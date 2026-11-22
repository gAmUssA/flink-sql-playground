package com.flinksqlfiddle.execution.plan;

import com.flinksqlfiddle.execution.ExecutionMode;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** Fixtures are real Flink 2.3 EXPLAIN output, trimmed to the sections the parser reads. */
class PlanParserTest {

    private static final String AGGREGATE = """
            == Abstract Syntax Tree ==
            LogicalSink(table=[*anonymous_collect$1*], fields=[user_id, EXPR$1])
            +- LogicalAggregate(group=[{0}], EXPR$1=[SUM($1)])

            == Optimized Physical Plan With Advice ==
            Sink(table=[*anonymous_collect$1*], fields=[user_id, EXPR$1], changelogMode=[NONE])
            +- GroupAggregate(advice=[1], groupBy=[user_id], select=[user_id, SUM(amount) AS EXPR$1], changelogMode=[I,UB,UA])
               +- Exchange(distribution=[hash[user_id]], changelogMode=[I])
                  +- Calc(select=[user_id, amount], changelogMode=[I])
                     +- WatermarkAssigner(rowtime=[ts], watermark=[-(ts, 5000:INTERVAL SECOND)], changelogMode=[I])
                        +- TableSourceScan(table=[[default_catalog, default_database, orders]], fields=[id, user_id, amount, ts], changelogMode=[I])

            advice[1]: [ADVICE] You might want to enable local-global two-phase optimization by configuring ('table.exec.mini-batch.enabled' to 'true').

            == Optimized Execution Plan ==
            GroupAggregate(groupBy=[user_id], select=[user_id, SUM(amount) AS EXPR$1])
            +- Exchange(distribution=[hash[user_id]])
            """;

    private static final String JOIN = """
            == Optimized Physical Plan With Advice ==
            Sink(table=[*anonymous_collect$3*], fields=[id, name], changelogMode=[NONE])
            +- Calc(select=[id, name], changelogMode=[I])
               +- Join(joinType=[InnerJoin], where=[=(user_id, user_id0)], select=[id, user_id, user_id0, name], leftInputSpec=[NoUniqueKey], rightInputSpec=[NoUniqueKey], changelogMode=[I])
                  :- Exchange(distribution=[hash[user_id]], changelogMode=[I])
                  :  +- Calc(select=[id, user_id], changelogMode=[I])
                  :     +- TableSourceScan(table=[[default_catalog, default_database, orders]], fields=[id, user_id, amount, ts], changelogMode=[I])
                  +- Exchange(distribution=[hash[user_id]], changelogMode=[I])
                     +- TableSourceScan(table=[[default_catalog, default_database, users]], fields=[user_id, name], changelogMode=[I])

            No available advice...

            == Optimized Execution Plan ==
            """;

    private static final String STATEMENT_SET = """
            == Optimized Physical Plan ==
            Sink(table=[default_catalog.default_database.sink], fields=[user_id, amount], changelogMode=[NONE])
            +- Calc(select=[user_id, amount], changelogMode=[I])
               +- [#1] TableSourceScan(table=[[default_catalog, default_database, orders]], fields=[id, user_id, amount], changelogMode=[I])

            Sink(table=[default_catalog.default_database.`audit`], fields=[user_id], changelogMode=[NONE])
            +- Calc(select=[user_id], changelogMode=[I])
               +- Reused(reference_id=[1])

            == Optimized Execution Plan ==
            """;

    private static final String BATCH = """
            == Optimized Physical Plan ==
            Sink(table=[*anonymous_collect$9*], fields=[user_id, EXPR$1])
            +- HashAggregate(isMerge=[true], groupBy=[user_id], select=[user_id, Final_SUM(sum$0) AS EXPR$1])
               +- Exchange(distribution=[hash[user_id]])
                  +- LocalHashAggregate(groupBy=[user_id], select=[user_id, Partial_SUM(amount) AS sum$0])
                     +- TableSourceScan(table=[[default_catalog, default_database, orders, project=[user_id, amount], metadata=[]]], fields=[user_id, amount])

            == Optimized Execution Plan ==
            """;

    private static PlanNode byKind(ExplainResult r, String kind) {
        return r.nodes().stream().filter(n -> n.kind().equals(kind)).findFirst().orElseThrow();
    }

    @Test
    void parsesAChainWithChangelogModesStateAndAdvice() {
        ExplainResult r = PlanParser.parse(AGGREGATE, ExecutionMode.STREAMING);

        assertEquals(6, r.nodes().size());
        assertEquals(List.of(0), r.roots());
        PlanNode sink = r.nodes().get(0);
        assertEquals("Sink: collect", sink.label());
        assertEquals(List.of(), sink.changelogMode(), "NONE means the sink emits nothing");

        PlanNode agg = byKind(r, "GroupAggregate");
        assertEquals(List.of("I", "UB", "UA"), agg.changelogMode());
        assertEquals("unbounded", agg.state());
        assertEquals(List.of(1), agg.advice());
        assertEquals("user_id", agg.attrs().get("groupBy"));
        assertFalse(agg.attrs().containsKey("changelogMode"));
        assertFalse(agg.attrs().containsKey("advice"));

        assertEquals("hash[user_id]", byKind(r, "Exchange").attrs().get("distribution"));
        assertEquals("-(ts, 5000:INTERVAL SECOND)", byKind(r, "WatermarkAssigner").attrs().get("watermark"));
        assertEquals("Source: orders", byKind(r, "TableSourceScan").label());

        // Each node feeds the one above it.
        for (int i = 0; i < 5; i++) {
            assertEquals(List.of(i + 1), r.nodes().get(i).inputs());
        }
        assertEquals(1, r.advice().size());
        assertEquals("ADVICE", r.advice().getFirst().level());
        assertTrue(r.advice().getFirst().text().startsWith("You might want to enable local-global"));
        assertTrue(r.plan().startsWith("Sink(table=[*anonymous_collect$1*]"));
        assertFalse(r.plan().contains("Optimized Execution Plan"));
        assertFalse(r.plan().contains("advice[1]"));
    }

    @Test
    void joinInputsFollowPlanOrder() {
        ExplainResult r = PlanParser.parse(JOIN, ExecutionMode.STREAMING);
        PlanNode join = byKind(r, "Join");
        assertEquals(2, join.inputs().size());
        assertEquals("Exchange", r.nodes().get(join.inputs().get(0)).kind());
        assertEquals("Exchange", r.nodes().get(join.inputs().get(1)).kind());
        // Left input reaches orders, right input reaches users.
        PlanNode left = r.nodes().get(r.nodes().get(join.inputs().get(0)).inputs().getFirst());
        assertEquals("Calc", left.kind());
        assertEquals("Source: orders", r.nodes().get(left.inputs().getFirst()).label());
        assertEquals("Source: users", r.nodes().get(r.nodes().get(join.inputs().get(1)).inputs().getFirst()).label());
        assertEquals("=(user_id, user_id0)", join.attrs().get("where"));
        assertTrue(r.advice().isEmpty(), "'No available advice...' is not an advice entry");
    }

    @Test
    void statementSetHasOneRootPerSinkAndReusedSubPlansAreShared() {
        ExplainResult r = PlanParser.parse(STATEMENT_SET, ExecutionMode.STREAMING);
        assertEquals(2, r.roots().size());
        assertEquals("Sink: sink", r.nodes().get(r.roots().get(0)).label());
        assertEquals("Sink: audit", r.nodes().get(r.roots().get(1)).label());
        List<PlanNode> scans = r.nodes().stream().filter(n -> n.kind().equals("TableSourceScan")).toList();
        assertEquals(1, scans.size(), "Reused(reference_id=[1]) points at the [#1] node, not a copy");
        int scan = scans.getFirst().id();
        long feeders = r.nodes().stream().filter(n -> n.inputs().contains(scan)).count();
        assertEquals(2, feeders);
    }

    @Test
    void batchPlanHasNoChangelogModesOrState() {
        ExplainResult r = PlanParser.parse(BATCH, ExecutionMode.BATCH);
        assertEquals(ExecutionMode.BATCH, r.mode());
        r.nodes().forEach(n -> {
            assertNull(n.changelogMode(), n.kind());
            assertNull(n.state(), n.kind());
        });
        assertEquals("Source: orders", byKind(r, "TableSourceScan").label(), "project=[...] after the name is ignored");
    }

    @Test
    void stateKinds() {
        String plan = """
                == Optimized Physical Plan With Advice ==
                Sink(table=[default_catalog.default_database.t], fields=[a], upsertMaterialize=[true], changelogMode=[NONE])
                +- Match(partitionBy=[k], orderBy=[ts ASC], pattern=[(_UTF-16LE'A', _UTF-16LE'B')], changelogMode=[I])
                   +- IntervalJoin(joinType=[InnerJoin], windowBounds=[isRowTime=true], changelogMode=[I])
                      :- Values(tuples=[[{ 1 }]], changelogMode=[I])
                      +- Calc(select=[a], changelogMode=[I])
                         +- Values(tuples=[[{ 2 }]], changelogMode=[I])
                """;
        ExplainResult r = PlanParser.parse(plan, ExecutionMode.STREAMING);
        assertEquals("unbounded", byKind(r, "Sink").state(), "SinkUpsertMaterializer keeps state");
        assertEquals("pattern", byKind(r, "Match").state());
        assertEquals("time-bounded", byKind(r, "IntervalJoin").state());
        assertNull(byKind(r, "Calc").state());
        assertEquals("Source: VALUES", byKind(r, "Values").label());
        assertEquals("(_UTF-16LE'A', _UTF-16LE'B')", byKind(r, "Match").attrs().get("pattern"));
    }

    @Test
    void windowPropertyReferencesWithAStrayQuoteStillParse() {
        Map<String, String> attrs = PlanParser.parseAttrs(
                "window=[TUMBLE(time_col=[event_time], size=[10 s])], select=[COUNT(*) AS c, slice_end('w$) AS $slice_end], changelogMode=[I]");
        assertNotNull(attrs);
        assertEquals("TUMBLE(time_col=[event_time], size=[10 s])", attrs.get("window"));
        assertEquals("COUNT(*) AS c, slice_end(w$) AS $slice_end", attrs.get("select"));
        assertEquals("I", attrs.get("changelogMode"));
    }

    @Test
    void bracketsInsideStringLiteralsDoNotEndTheValue() {
        Map<String, String> attrs = PlanParser.parseAttrs("where=[=(name, _UTF-16LE'a]b')], select=[name]");
        assertEquals("=(name, _UTF-16LE'a]b')", attrs.get("where"));
        assertEquals("name", attrs.get("select"));
    }

    @Test
    void unparseableAttributesAreKeptRaw() {
        ExplainResult r = PlanParser.parse("""
                == Optimized Physical Plan ==
                Weird(not a key value list)
                """, ExecutionMode.STREAMING);
        assertEquals("Weird", r.nodes().getFirst().kind());
        assertEquals("not a key value list", r.nodes().getFirst().attrs().get("_raw"));
    }

    @Test
    void longAttributeValuesAreTruncated() {
        String select = "a".repeat(1000);
        ExplainResult r = PlanParser.parse("== Optimized Physical Plan ==\nCalc(select=[" + select + "])\n",
                ExecutionMode.STREAMING);
        String shown = r.nodes().getFirst().attrs().get("select");
        assertTrue(shown.length() < 500);
        assertTrue(shown.endsWith("…"));
    }

    @Test
    void multiLineAdviceIsJoined() {
        ExplainResult r = PlanParser.parse("""
                == Optimized Physical Plan With Advice ==
                Calc(advice=[1, 2], select=[a], changelogMode=[I])

                advice[1]: [WARNING] first line
                continues here
                advice[2]: [ADVICE] second

                == Optimized Execution Plan ==
                """, ExecutionMode.STREAMING);
        assertEquals(List.of(1, 2), r.nodes().getFirst().advice());
        assertEquals(new PlanAdvice(1, "WARNING", "first line continues here"), r.advice().get(0));
        assertEquals(new PlanAdvice(2, "ADVICE", "second"), r.advice().get(1));
    }

    @Test
    void missingSectionIsAnError() {
        assertThrows(IllegalStateException.class,
                () -> PlanParser.parse("== Abstract Syntax Tree ==\nLogicalValues()\n", ExecutionMode.STREAMING));
    }
}
