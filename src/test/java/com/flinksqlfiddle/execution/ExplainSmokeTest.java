package com.flinksqlfiddle.execution;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flinksqlfiddle.execution.plan.ExplainResult;
import com.flinksqlfiddle.execution.plan.PlanNode;
import com.flinksqlfiddle.flink.FlinkEnvironmentFactory;
import com.flinksqlfiddle.flink.FlinkProperties;
import com.flinksqlfiddle.flink.SharedMiniCluster;
import com.flinksqlfiddle.security.ForbiddenSqlException;
import com.flinksqlfiddle.security.SqlSecurityValidator;
import com.flinksqlfiddle.session.FlinkSession;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Plans real statements on the shared MiniCluster: every shipped preset, the collect-sink
 * changelog modes, INSERTs and statement sets, and the statements explain must refuse.
 */
@Tag("smoke")
class ExplainSmokeTest {

    private static final FlinkProperties PROPERTIES =
            new FlinkProperties(1, "8m", "32m", 5, null, true, 0, null, null);
    private static SharedMiniCluster cluster;

    private SqlExecutionService service;
    private FlinkSession session;

    private static final String ORDERS = """
            CREATE TEMPORARY TABLE orders (
                id INT, user_id INT, amount DOUBLE, ts TIMESTAMP(3),
                WATERMARK FOR ts AS ts - INTERVAL '5' SECOND
            ) WITH ('connector' = 'datagen')""";
    private static final String USERS =
            "CREATE TEMPORARY TABLE users (user_id INT, name STRING) WITH ('connector' = 'datagen')";
    private static final String SINK = """
            CREATE TEMPORARY TABLE totals (user_id INT, total DOUBLE, PRIMARY KEY (user_id) NOT ENFORCED)
            WITH ('connector' = 'blackhole')""";

    @BeforeAll
    static void startCluster() {
        cluster = new SharedMiniCluster(PROPERTIES);
        cluster.startAsync();
    }

    @AfterAll
    static void stopCluster() throws Exception {
        cluster.close();
    }

    @BeforeEach
    void setUp() {
        service = new SqlExecutionService(new SqlSecurityValidator(), ExecutionLimits.defaults());
        session = new FlinkSession("smoke-explain", new FlinkEnvironmentFactory(PROPERTIES, cluster));
    }

    @AfterEach
    void tearDown() {
        session.close();
    }

    private void ddl(String... statements) {
        for (String stmt : statements) {
            service.execute(session, ExecutionMode.STREAMING, stmt);
        }
    }

    private static PlanNode only(ExplainResult plan, String kind) {
        List<PlanNode> matches = plan.nodes().stream().filter(n -> n.kind().equals(kind)).toList();
        assertEquals(1, matches.size(), () -> "expected one " + kind + " in\n" + plan.plan());
        return matches.getFirst();
    }

    @Test
    void queryIsPlannedWithTheCollectSinkSoAggregatesRetract() {
        ddl(ORDERS);
        ExplainResult plan = service.explain(session, ExecutionMode.STREAMING,
                "SELECT user_id, SUM(amount) FROM orders GROUP BY user_id");

        assertEquals(1, plan.roots().size());
        PlanNode sink = plan.nodes().get(plan.roots().getFirst());
        assertEquals("Sink: collect", sink.label());
        // Without the collect sink the planner reports [I,UA]; the rows the user sees carry -U.
        assertEquals(List.of("I", "UB", "UA"), only(plan, "GroupAggregate").changelogMode());
        assertEquals("unbounded", only(plan, "GroupAggregate").state());
        assertEquals("Source: orders", only(plan, "TableSourceScan").label());
        assertEquals("hash[user_id]", only(plan, "Exchange").attrs().get("distribution"));
        assertFalse(plan.advice().isEmpty(), "the mini-batch advice is expected for a group aggregate");
        assertEquals(plan.advice().getFirst().id(), only(plan, "GroupAggregate").advice().getFirst());
    }

    @Test
    void joinHasTwoInputsInPlanOrder() {
        ddl(ORDERS, USERS);
        ExplainResult plan = service.explain(session, ExecutionMode.STREAMING,
                "SELECT o.id, u.name FROM orders o JOIN users u ON o.user_id = u.user_id");
        PlanNode join = only(plan, "Join");
        assertEquals(2, join.inputs().size());
        assertEquals("unbounded", join.state());
        List<String> sources = join.inputs().stream().map(id -> sourceBelow(plan, id)).toList();
        assertEquals(List.of("Source: orders", "Source: users"), sources);
    }

    @Test
    void windowAggregateStateIsFreedByTheWatermark() {
        ddl(ORDERS);
        ExplainResult plan = service.explain(session, ExecutionMode.STREAMING, """
                SELECT window_start, COUNT(*) FROM TABLE(
                    TUMBLE(TABLE orders, DESCRIPTOR(ts), INTERVAL '10' SECOND))
                GROUP BY window_start, window_end""");
        assertEquals("time-bounded", only(plan, "GlobalWindowAggregate").state());
        assertEquals(List.of("I"), only(plan, "GlobalWindowAggregate").changelogMode());
    }

    @Test
    void insertIsPlannedIntoItsSink() {
        ddl(ORDERS, SINK);
        ExplainResult plan = service.explain(session, ExecutionMode.STREAMING,
                "INSERT INTO totals SELECT user_id, SUM(amount) FROM orders GROUP BY user_id");
        assertEquals("Sink: totals", plan.nodes().get(plan.roots().getFirst()).label());
    }

    @Test
    void statementSetHasOneRootPerInsert() {
        ddl(ORDERS, USERS, SINK);
        ExplainResult plan = service.explain(session, ExecutionMode.STREAMING, """
                EXECUTE STATEMENT SET BEGIN
                  INSERT INTO totals SELECT user_id, amount FROM orders;
                  INSERT INTO totals SELECT user_id, 1.0 FROM users;
                END""");
        assertFalse(plan.roots().isEmpty());
        plan.roots().forEach(r -> assertEquals("Sink: totals", plan.nodes().get(r).label()));
        assertTrue(plan.nodes().stream().anyMatch(n -> n.label().equals("Source: users")));
        assertTrue(plan.nodes().stream().anyMatch(n -> n.label().equals("Source: orders")));
    }

    @Test
    void statementSetIntoTwoSinksHasTwoRoots() {
        ddl(ORDERS, SINK, "CREATE TEMPORARY TABLE audit (user_id INT) WITH ('connector' = 'blackhole')");
        ExplainResult plan = service.explain(session, ExecutionMode.STREAMING, """
                EXECUTE STATEMENT SET BEGIN
                  INSERT INTO totals SELECT user_id, SUM(amount) FROM orders GROUP BY user_id;
                  INSERT INTO audit SELECT user_id FROM orders WHERE amount > 100;
                END""");
        assertEquals(List.of("Sink: totals", "Sink: audit"),
                plan.roots().stream().map(r -> plan.nodes().get(r).label()).toList(), plan.plan());
        // Flink may share the orders scan between both sinks ([#1] ... Reused); either way every
        // operator hangs off a sink and both sinks reach orders.
        plan.roots().forEach(r -> assertTrue(reaches(plan, r, "Source: orders"), plan.plan()));
    }

    @Test
    void leadingExplainIsUnwrapped() {
        ddl(ORDERS);
        ExplainResult plan = service.explain(session, ExecutionMode.STREAMING, "EXPLAIN SELECT id FROM orders");
        assertEquals("Sink: collect", plan.nodes().get(plan.roots().getFirst()).label());
        // Flink's grammar has no nested EXPLAIN: a syntax error, reported as a user error.
        NotExplainableException nested = assertThrows(NotExplainableException.class, () -> service.explain(
                session, ExecutionMode.STREAMING, "EXPLAIN PLAN FOR EXPLAIN /* twice */ SELECT id FROM orders"));
        assertEquals("INVALID_SQL", nested.code());
    }

    @Test
    void batchPlanHasNoChangelogModesStateOrAdvice() {
        service.execute(session, ExecutionMode.BATCH,
                "CREATE TEMPORARY TABLE b (k INT, v DOUBLE) WITH ('connector' = 'datagen', 'number-of-rows' = '5')");
        ExplainResult plan = service.explain(session, ExecutionMode.BATCH, "SELECT k, SUM(v) FROM b GROUP BY k");
        assertEquals(ExecutionMode.BATCH, plan.mode());
        assertTrue(plan.advice().isEmpty());
        plan.nodes().forEach(n -> {
            assertNull(n.changelogMode(), n.kind());
            assertNull(n.state(), n.kind());
        });
        assertEquals("Sink: collect", plan.nodes().get(plan.roots().getFirst()).label());
    }

    @Test
    void ddlHasNoPlan() {
        NotExplainableException e = assertThrows(NotExplainableException.class, () -> service.explain(
                session, ExecutionMode.STREAMING, "CREATE TABLE x (a INT) WITH ('connector' = 'datagen')"));
        assertEquals("NOT_EXPLAINABLE", e.code());
        assertThrows(NotExplainableException.class,
                () -> service.explain(session, ExecutionMode.STREAMING, "SHOW TABLES"));
    }

    @Test
    void ctasIsRefusedSoExplainNeverCreatesATable() {
        ddl(ORDERS);
        assertThrows(NotExplainableException.class, () -> service.explain(session, ExecutionMode.STREAMING,
                "CREATE TABLE copy WITH ('connector' = 'blackhole') AS SELECT id FROM orders"));
        assertFalse(List.of(session.getStreamEnv().listTables()).contains("copy"));
    }

    @Test
    void forbiddenConnectorIsBlockedBeforePlanning() {
        assertThrows(ForbiddenSqlException.class, () -> service.explain(session, ExecutionMode.STREAMING,
                "CREATE TABLE f (a INT) WITH ('connector' = 'filesystem', 'path' = '/etc')"));
        // Behind EXPLAIN the validator's anchored patterns don't see the CREATE, but the
        // statement is still DDL: refused without being planned or executed.
        assertThrows(NotExplainableException.class, () -> service.explain(session, ExecutionMode.STREAMING,
                "EXPLAIN CREATE TABLE f (a INT) WITH ('connector' = 'filesystem', 'path' = '/etc')"));
        assertFalse(List.of(session.getStreamEnv().listTables()).contains("f"));
    }

    @Test
    void unknownTableIsAUserError() {
        NotExplainableException e = assertThrows(NotExplainableException.class,
                () -> service.explain(session, ExecutionMode.STREAMING, "SELECT * FROM nope"));
        assertEquals("INVALID_SQL", e.code());
        assertTrue(e.getMessage().contains("nope"), e.getMessage());
    }

    /**
     * Every shipped preset plans into a well-formed graph: one collect sink, every operator
     * reachable from it, at least one source, no attribute list the parser had to keep raw,
     * and (streaming) a changelog mode on every operator.
     */
    @Test
    void everyPresetPlans() throws Exception {
        String path = System.getProperty("presets.json");
        assertNotNull(path, "run through ./gradlew smokeTest (it writes the presets JSON)");
        JsonNode presets = new ObjectMapper().readTree(new File(path));
        assertTrue(presets.size() > 0);
        List<String> failures = new ArrayList<>();
        for (JsonNode preset : presets) {
            String title = preset.get("title").asText();
            ExecutionMode mode = ExecutionMode.valueOf(preset.get("mode").asText());
            FlinkSession s = new FlinkSession("smoke-preset", new FlinkEnvironmentFactory(PROPERTIES, cluster));
            try {
                for (JsonNode stmt : preset.get("schema")) {
                    service.execute(s, mode, stmt.asText());
                }
                ExplainResult plan = service.explain(s, mode, preset.get("query").get(0).asText());
                failures.addAll(problems(title, mode, plan));
            } catch (Exception e) {
                failures.add(title + ": " + e);
            } finally {
                s.close();
            }
        }
        assertTrue(failures.isEmpty(), String.join("\n", failures));
    }

    private static List<String> problems(String title, ExecutionMode mode, ExplainResult plan) {
        List<String> out = new ArrayList<>();
        if (plan.roots().size() != 1 || !plan.nodes().get(plan.roots().getFirst()).label().equals("Sink: collect")) {
            out.add(title + ": expected one collect sink, got roots " + plan.roots());
        }
        Set<Integer> seen = new HashSet<>();
        Deque<Integer> todo = new ArrayDeque<>(plan.roots());
        while (!todo.isEmpty()) {
            int id = todo.pop();
            if (seen.add(id)) {
                todo.addAll(plan.nodes().get(id).inputs());
            }
        }
        if (seen.size() != plan.nodes().size()) {
            out.add(title + ": " + (plan.nodes().size() - seen.size()) + " operator(s) unreachable from the sink");
        }
        if (plan.nodes().stream().noneMatch(n -> n.label().startsWith("Source: "))) {
            out.add(title + ": no source");
        }
        for (PlanNode n : plan.nodes()) {
            if (n.attrs().containsKey("_raw")) {
                out.add(title + ": unparsed attributes on " + n.kind());
            }
            if (mode == ExecutionMode.STREAMING && n.changelogMode() == null) {
                out.add(title + ": no changelog mode on " + n.kind());
            }
        }
        return out;
    }

    private static boolean reaches(ExplainResult plan, int from, String label) {
        Deque<Integer> todo = new ArrayDeque<>(List.of(from));
        Set<Integer> seen = new HashSet<>();
        while (!todo.isEmpty()) {
            int id = todo.pop();
            if (!seen.add(id)) {
                continue;
            }
            if (plan.nodes().get(id).label().equals(label)) {
                return true;
            }
            todo.addAll(plan.nodes().get(id).inputs());
        }
        return false;
    }

    private static String sourceBelow(ExplainResult plan, int id) {
        PlanNode n = plan.nodes().get(id);
        while (!n.label().startsWith("Source: ")) {
            n = plan.nodes().get(n.inputs().getFirst());
        }
        return n.label();
    }
}
