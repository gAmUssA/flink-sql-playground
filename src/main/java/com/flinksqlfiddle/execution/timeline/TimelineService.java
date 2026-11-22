package com.flinksqlfiddle.execution.timeline;

import com.flinksqlfiddle.execution.ExecutionMode;
import com.flinksqlfiddle.execution.NotExplainableException;
import com.flinksqlfiddle.execution.ResultStreamListener;
import com.flinksqlfiddle.execution.SqlExecutionService;
import com.flinksqlfiddle.execution.SqlExecutionService.StreamingQuery;
import com.flinksqlfiddle.execution.plan.ExplainResult;
import com.flinksqlfiddle.execution.plan.PlanNode;
import com.flinksqlfiddle.execution.plan.PlanParser;
import com.flinksqlfiddle.session.FlinkSession;
import jakarta.enterprise.context.ApplicationScoped;
import org.apache.flink.table.api.TableEnvironment;
import org.apache.flink.table.api.TableResult;
import org.apache.flink.table.catalog.ResolvedSchema;
import org.apache.flink.table.catalog.WatermarkSpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Records a query's event-time timeline: for each record of its watermarked source, the record's
 * event time and the watermark at the moment that record was processed.
 *
 * <p>It does not touch the user's query. It plans the query to find the first source table that
 * declares a WATERMARK and the windows the query uses, then runs a separate probe job over that
 * table: {@code SELECT rowtime, CURRENT_WATERMARK(rowtime) FROM table}. The probe reads its own
 * sample of the source, so a generated source (datagen, faker) yields different records than the
 * user's run; the timeline is self-consistent, not a trace of that run. See
 * docs/adr/0005-watermark-timeline-probe.md.
 */
@ApplicationScoped
public class TimelineService {

    private static final Logger log = LoggerFactory.getLogger(TimelineService.class);

    private final SqlExecutionService executionService;

    public TimelineService(SqlExecutionService executionService) {
        this.executionService = executionService;
    }

    /** What the timeline describes: the probed table, its rowtime and watermark, the windows. */
    public record TimelineMeta(String table, String rowtime, String watermark, WindowSpec window) {
    }

    /** A submitted probe: its metadata and the running job's result. */
    public record TimelineQuery(TimelineMeta meta, StreamingQuery probe, ZoneId zone) {
    }

    /** Receives one call per probed record, then one end call. */
    public interface TimelineListener {
        void onTick(long eventTime, Long watermark) throws IOException;

        void onEnd(int count, boolean truncated) throws IOException;
    }

    /**
     * Plans {@code sql} (validated like any explain), finds its watermarked source and submits the
     * probe job. Runs on the request thread so planning errors surface as HTTP status codes.
     */
    public TimelineQuery prepare(FlinkSession session, String sql) {
        ExplainResult plan = executionService.explain(session, ExecutionMode.STREAMING, sql);
        WindowSpec window = WindowSpec.fromPlan(plan).orElse(null);
        List<List<String>> sources = sourceTables(plan);
        TableEnvironment tEnv = session.getStreamEnv();
        return session.runOnPlannerThread(() -> {
            for (List<String> path : sources) {
                ResolvedSchema schema = tEnv.from(quotedPath(path)).getResolvedSchema();
                List<WatermarkSpec> specs = schema.getWatermarkSpecs();
                if (specs.isEmpty()) {
                    continue;
                }
                WatermarkSpec spec = specs.getFirst();
                String rowtime = spec.getRowtimeAttribute();
                String probe = "SELECT " + quote(rowtime) + ", CURRENT_WATERMARK(" + quote(rowtime) + ") FROM "
                        + quotedPath(path);
                log.info("Timeline probe: {}", probe);
                long start = System.currentTimeMillis();
                TableResult result = tEnv.executeSql(probe);
                TimelineMeta meta = new TimelineMeta(path.getLast(), rowtime,
                        spec.getWatermarkExpression().asSummaryString(), window);
                return new TimelineQuery(meta, new StreamingQuery(result, start), tEnv.getConfig().getLocalTimeZone());
            }
            throw new NotExplainableException(
                    "No event time: none of the tables this query reads declares a WATERMARK", "NO_EVENT_TIME");
        });
    }

    /**
     * Streams the probe's records to {@code listener} with the same limits as a query stream (row
     * cap, wall-clock cap, cancel on client disconnect). Times are epoch milliseconds of the
     * wall-clock value Flink windows by: a TIMESTAMP as is, a TIMESTAMP_LTZ in the session's
     * time zone.
     */
    public void stream(TimelineQuery query, TimelineListener listener) throws IOException {
        executionService.streamRows(query.probe(), new ResultStreamListener() {
            @Override
            public void onSchema(List<String> columnNames, List<String> columnTypes) {
                // The probe's columns are fixed; the client already has the meta frame.
            }

            @Override
            public void onRow(String kind, List<Object> values) throws IOException {
                Long t = wallClockMillis(values.get(0), query.zone());
                if (t != null) {
                    listener.onTick(t, wallClockMillis(values.get(1), query.zone()));
                }
            }

            @Override
            public void onEnd(int rowCount, boolean truncated, long executionTimeMs) throws IOException {
                listener.onEnd(rowCount, truncated);
            }
        });
    }

    static Long wallClockMillis(Object value, ZoneId zone) {
        if (value instanceof LocalDateTime ldt) {
            return ldt.toInstant(ZoneOffset.UTC).toEpochMilli();
        }
        if (value instanceof Instant instant) {
            return instant.atZone(zone).toLocalDateTime().toInstant(ZoneOffset.UTC).toEpochMilli();
        }
        return null;
    }

    /** Source tables in plan order (left input first), as catalog paths, without duplicates. */
    static List<List<String>> sourceTables(ExplainResult plan) {
        List<List<String>> out = new ArrayList<>();
        for (PlanNode node : plan.nodes()) {
            String table = node.attrs().get("table");
            if (!node.kind().endsWith("TableSourceScan") || table == null) {
                continue;
            }
            String inner = table.startsWith("[") && table.endsWith("]") ? table.substring(1, table.length() - 1) : table;
            List<String> parts = PlanParser.splitTopLevel(inner);
            if (parts.size() < 3) {
                continue;
            }
            List<String> path = parts.subList(0, 3).stream().map(p -> p.replace("`", "")).toList();
            if (!out.contains(path)) {
                out.add(path);
            }
        }
        return out;
    }

    static String quote(String identifier) {
        return "`" + identifier.replace("`", "``") + "`";
    }

    static String quotedPath(List<String> path) {
        return path.stream().map(TimelineService::quote).collect(Collectors.joining("."));
    }
}
