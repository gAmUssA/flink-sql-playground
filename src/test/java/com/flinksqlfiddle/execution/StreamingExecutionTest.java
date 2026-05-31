package com.flinksqlfiddle.execution;

import com.flinksqlfiddle.flink.FlinkEnvironmentFactory;
import com.flinksqlfiddle.flink.FlinkProperties;
import com.flinksqlfiddle.security.SqlSecurityValidator;
import com.flinksqlfiddle.session.FlinkSession;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

@Tag("smoke")
class StreamingExecutionTest {

    private SqlExecutionService service;
    private FlinkEnvironmentFactory factory;

    @BeforeEach
    void setUp() {
        factory = new FlinkEnvironmentFactory(new FlinkProperties(1, "8m", "32m", 5, null));
        service = new SqlExecutionService(new SqlSecurityValidator(), ExecutionLimits.defaults());
    }

    /** Collects callbacks into lists for assertions. */
    private static final class CollectingListener implements ResultStreamListener {
        final List<String> columns = new ArrayList<>();
        final List<List<Object>> rows = new ArrayList<>();
        final List<String> kinds = new ArrayList<>();
        int endRowCount = -1;
        boolean ended = false;
        boolean truncated = false;

        @Override
        public void onSchema(List<String> columnNames, List<String> columnTypes) {
            columns.addAll(columnNames);
        }

        @Override
        public void onRow(String kind, List<Object> values) {
            kinds.add(kind);
            rows.add(values);
        }

        @Override
        public void onEnd(int rowCount, boolean truncated, long executionTimeMs) {
            this.endRowCount = rowCount;
            this.truncated = truncated;
            this.ended = true;
        }
    }

    @Test
    void streamsEachRowThenEnds() throws Exception {
        FlinkSession session = new FlinkSession("stream-basic", factory);
        service.execute(session, ExecutionMode.STREAMING, """
                CREATE TEMPORARY TABLE src (id INT) WITH (
                    'connector' = 'datagen', 'number-of-rows' = '3',
                    'fields.id.kind' = 'sequence', 'fields.id.start' = '1', 'fields.id.end' = '3')
                """);

        SqlExecutionService.StreamingQuery query = service.prepareStream(session, "SELECT id FROM src");
        CollectingListener listener = new CollectingListener();
        service.streamRows(query, listener);

        assertEquals(List.of("id"), listener.columns);
        assertEquals(3, listener.rows.size());
        assertEquals(3, listener.endRowCount);
        assertFalse(listener.truncated);
        assertTrue(listener.ended);
        listener.kinds.forEach(kind -> assertEquals("+I", kind));
    }

    @Test
    void stopsAndSkipsEndWhenClientDisconnects() throws Exception {
        FlinkSession session = new FlinkSession("stream-stop", factory);
        service.execute(session, ExecutionMode.STREAMING, """
                CREATE TEMPORARY TABLE src (id INT) WITH (
                    'connector' = 'datagen', 'number-of-rows' = '50',
                    'fields.id.kind' = 'sequence', 'fields.id.start' = '1', 'fields.id.end' = '50')
                """);

        SqlExecutionService.StreamingQuery query = service.prepareStream(session, "SELECT id FROM src");
        AtomicInteger received = new AtomicInteger();
        AtomicBoolean ended = new AtomicBoolean(false);

        service.streamRows(query, new ResultStreamListener() {
            @Override
            public void onSchema(List<String> columnNames, List<String> columnTypes) {
            }

            @Override
            public void onRow(String kind, List<Object> values) throws IOException {
                if (received.incrementAndGet() == 1) {
                    throw new IOException("client disconnected");
                }
            }

            @Override
            public void onEnd(int rowCount, boolean truncated, long executionTimeMs) {
                ended.set(true);
            }
        });

        assertEquals(1, received.get(), "iteration should stop on the first disconnect");
        assertFalse(ended.get(), "onEnd must not fire after the client disconnects");
    }

    @Test
    void ddlOnStreamPathReportsEmptySchemaAndEnds() throws Exception {
        FlinkSession session = new FlinkSession("stream-ddl", factory);

        SqlExecutionService.StreamingQuery query = service.prepareStream(session, """
                CREATE TEMPORARY TABLE made_via_stream (id INT) WITH (
                    'connector' = 'datagen', 'number-of-rows' = '1')
                """);
        CollectingListener listener = new CollectingListener();
        service.streamRows(query, listener);

        assertTrue(listener.columns.isEmpty());
        assertTrue(listener.rows.isEmpty());
        assertEquals(0, listener.endRowCount);
        assertTrue(listener.ended);
    }
}
