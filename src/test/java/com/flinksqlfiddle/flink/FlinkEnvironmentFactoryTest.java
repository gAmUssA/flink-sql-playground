package com.flinksqlfiddle.flink;

import org.apache.flink.table.api.TableEnvironment;
import org.apache.flink.table.api.TableResult;
import org.apache.flink.types.Row;
import org.apache.flink.util.CloseableIterator;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

class FlinkEnvironmentFactoryTest {

    private final FlinkEnvironmentFactory factory = new FlinkEnvironmentFactory(
            new FlinkProperties(1, "8m", "32m")
    );

    @Test
    void batchEnvironmentExecutesDatagenQuery() throws Exception {
        TableEnvironment env = factory.createBatchEnvironment();

        env.executeSql("""
                CREATE TEMPORARY TABLE test_source (
                    id INT,
                    val INT
                ) WITH (
                    'connector' = 'datagen',
                    'number-of-rows' = '5',
                    'fields.id.kind' = 'sequence',
                    'fields.id.start' = '1',
                    'fields.id.end' = '5',
                    'fields.val.min' = '1',
                    'fields.val.max' = '100'
                )
                """);

        TableResult result = env.executeSql("SELECT id, val FROM test_source");
        List<Row> rows = collectRows(result);

        assertEquals(5, rows.size());
    }

    @Test
    void streamingEnvironmentExecutesDatagenQuery() throws Exception {
        TableEnvironment env = factory.createStreamingEnvironment();

        env.executeSql("""
                CREATE TEMPORARY TABLE test_source (
                    id INT,
                    val INT
                ) WITH (
                    'connector' = 'datagen',
                    'fields.id.kind' = 'sequence',
                    'fields.id.start' = '1',
                    'fields.id.end' = '10',
                    'fields.val.min' = '1',
                    'fields.val.max' = '100'
                )
                """);

        TableResult result = env.executeSql("SELECT id, val FROM test_source");
        List<Row> rows = collectRows(result);

        assertEquals(10, rows.size());
    }

    private List<Row> collectRows(TableResult result) throws Exception {
        List<Row> rows = new ArrayList<>();
        try (CloseableIterator<Row> it = result.collect()) {
            while (it.hasNext()) {
                rows.add(it.next());
            }
        }
        return rows;
    }
}
