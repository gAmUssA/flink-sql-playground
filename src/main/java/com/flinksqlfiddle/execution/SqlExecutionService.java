package com.flinksqlfiddle.execution;

import com.flinksqlfiddle.security.SecurityConstants;
import com.flinksqlfiddle.security.SqlSecurityValidator;
import com.flinksqlfiddle.session.FlinkSession;
import org.apache.flink.table.api.TableEnvironment;
import org.apache.flink.table.api.TableResult;
import org.apache.flink.types.Row;
import org.apache.flink.types.RowKind;
import org.apache.flink.util.CloseableIterator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.regex.Pattern;

@Service
public class SqlExecutionService {

    private static final Logger log = LoggerFactory.getLogger(SqlExecutionService.class);

    private static final Pattern DDL_PATTERN = Pattern.compile(
            "^\\s*(CREATE\\s+(TEMPORARY\\s+)?(TABLE|VIEW)|DROP\\s+(TABLE|VIEW))\\b",
            Pattern.CASE_INSENSITIVE);

    private static final Map<RowKind, String> ROW_KIND_LABELS = Map.of(
            RowKind.INSERT, "+I",
            RowKind.UPDATE_BEFORE, "-U",
            RowKind.UPDATE_AFTER, "+U",
            RowKind.DELETE, "-D"
    );

    private final SqlSecurityValidator validator;

    public SqlExecutionService(SqlSecurityValidator validator) {
        this.validator = validator;
    }

    public QueryResult execute(TableEnvironment tEnv, String sql) {
        validator.validate(sql);

        log.debug("Executing SQL: {}", sql);
        long startTime = System.currentTimeMillis();

        // Direct execution on the calling thread — used by tests where create
        // and execute happen on the same thread (Calcite state is consistent).
        TableResult tableResult = tEnv.executeSql(sql);

        return awaitResult(tableResult, sql, startTime);
    }

    public QueryResult execute(FlinkSession session, ExecutionMode mode, String sql) {
        validator.validate(sql);

        if (isDdl(sql)) {
            log.debug("DDL detected, syncing to both environments: {}", truncate(sql));
            return executeDdlOnBothEnvironments(session, sql);
        }

        log.info("Executing SQL [{}]: {}", mode, truncate(sql));

        TableEnvironment tEnv = (mode == ExecutionMode.BATCH)
                ? session.getBatchEnv()
                : session.getStreamEnv();

        return executeOnSessionThread(session, tEnv, sql);
    }

    static boolean isDdl(String sql) {
        return DDL_PATTERN.matcher(sql).find();
    }

    /**
     * Executes SQL on the session's dedicated planner thread to keep Calcite's
     * RelMetadataQuery thread-local state consistent, then collects results
     * asynchronously with timeout.
     */
    private QueryResult executeOnSessionThread(FlinkSession session, TableEnvironment tEnv, String sql) {
        log.debug("Executing SQL: {}", sql);
        long startTime = System.currentTimeMillis();

        // executeSql must run on a consistent thread per session because Calcite's
        // RelMetadataQuery uses thread-local state for the metadata handler provider.
        TableResult tableResult = session.runOnPlannerThread(() -> tEnv.executeSql(sql));

        // Result collection only iterates rows — no planner involvement, safe on any thread.
        return awaitResult(tableResult, sql, startTime);
    }

    private QueryResult executeDdlOnBothEnvironments(FlinkSession session, String sql) {
        long startTime = System.currentTimeMillis();
        session.runOnPlannerThread(() -> {
            session.getBatchEnv().executeSql(sql);
            session.getStreamEnv().executeSql(sql);
            return null;
        });
        long executionTimeMs = System.currentTimeMillis() - startTime;
        return new QueryResult(List.of(), List.of(), List.of(), List.of(), executionTimeMs, false);
    }

    private QueryResult awaitResult(TableResult tableResult, String sql, long startTime) {
        CompletableFuture<QueryResult> future = CompletableFuture.supplyAsync(() ->
                collectResult(tableResult, startTime));

        try {
            QueryResult result = future.get(SecurityConstants.EXECUTION_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            log.info("Query complete: {} rows in {}ms{}",
                    result.getRowCount(), result.getExecutionTimeMs(),
                    result.isTruncated() ? " (truncated)" : "");
            return result;
        } catch (TimeoutException e) {
            future.cancel(true);
            tableResult.getJobClient().ifPresent(client -> client.cancel());
            log.warn("Execution timeout after {}s: {}", SecurityConstants.EXECUTION_TIMEOUT_SECONDS,
                    truncate(sql));
            throw new ExecutionTimeoutException(SecurityConstants.EXECUTION_TIMEOUT_SECONDS);
        } catch (ExecutionException e) {
            Throwable cause = e.getCause();
            log.error("Query execution failed: {}", cause.getMessage());
            if (cause instanceof RuntimeException re) {
                throw re;
            }
            throw new RuntimeException("Query execution failed", cause);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Query execution interrupted", e);
        }
    }

    private static String truncate(String sql) {
        String oneLine = sql.replaceAll("\\s+", " ").trim();
        return oneLine.length() > 80 ? oneLine.substring(0, 80) + "..." : oneLine;
    }

    private QueryResult collectResult(TableResult tableResult, long startTime) {
        List<String> columnNames = new ArrayList<>();
        List<String> columnTypes = new ArrayList<>();
        tableResult.getResolvedSchema().getColumns().forEach(col -> {
            columnNames.add(col.getName());
            columnTypes.add(col.getDataType().toString());
        });

        List<List<Object>> rows = new ArrayList<>();
        List<String> rowKinds = new ArrayList<>();
        boolean truncated = false;

        try (CloseableIterator<Row> it = tableResult.collect()) {
            while (it.hasNext()) {
                if (rows.size() >= SecurityConstants.MAX_ROWS) {
                    truncated = true;
                    break;
                }
                Row row = it.next();
                rowKinds.add(ROW_KIND_LABELS.getOrDefault(row.getKind(), row.getKind().name()));
                List<Object> values = new ArrayList<>();
                for (int i = 0; i < row.getArity(); i++) {
                    values.add(row.getField(i));
                }
                rows.add(values);
            }
        } catch (Exception e) {
            throw new RuntimeException("Failed to collect query results", e);
        }

        long executionTimeMs = System.currentTimeMillis() - startTime;
        return new QueryResult(columnNames, columnTypes, rows, rowKinds, executionTimeMs, truncated);
    }
}
