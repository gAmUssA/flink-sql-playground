package com.flinksqlfiddle.execution;

import com.flinksqlfiddle.security.SqlSecurityValidator;
import com.flinksqlfiddle.session.FlinkSession;
import com.flinksqlfiddle.util.SqlText;
import org.apache.flink.annotation.VisibleForTesting;
import org.apache.flink.core.execution.JobClient;
import org.apache.flink.table.api.TableEnvironment;
import org.apache.flink.table.api.TableResult;
import org.apache.flink.table.catalog.ResolvedSchema;
import org.apache.flink.types.Row;
import org.apache.flink.types.RowKind;
import org.apache.flink.util.CloseableIterator;
import jakarta.enterprise.context.ApplicationScoped;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@ApplicationScoped
public class SqlExecutionService {

    private static final Logger log = LoggerFactory.getLogger(SqlExecutionService.class);

    // Dedicated executor for result collection — virtual threads avoid the
    // ForkJoinPool contention that occurs when many sessions collect concurrently.
    private static final ExecutorService RESULT_COLLECTOR =
            Executors.newVirtualThreadPerTaskExecutor();

    // Enforces the streaming wall-clock cap: cancels the (possibly unbounded) Flink job
    // when the deadline fires, so an idle blocking hasNext() can't outlive streamTimeout.
    private static final ScheduledExecutorService STREAM_DEADLINE =
            Executors.newSingleThreadScheduledExecutor(r -> {
                Thread t = new Thread(r, "stream-deadline");
                t.setDaemon(true);
                return t;
            });

    private static final Pattern DDL_PATTERN = Pattern.compile(
            "^\\s*(CREATE\\s+(TEMPORARY\\s+)?(TABLE|VIEW)|DROP\\s+(TEMPORARY\\s+)?(TABLE|VIEW))\\b",
            Pattern.CASE_INSENSITIVE);

    private static final Pattern CREATE_TABLE_PATTERN = Pattern.compile(
            "^\\s*CREATE\\s+(?:TEMPORARY\\s+)?TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(`[^`]+`|\\S+)",
            Pattern.CASE_INSENSITIVE);

    private static final Pattern CREATE_TEMPORARY_TABLE_PATTERN = Pattern.compile(
            "^\\s*CREATE\\s+TEMPORARY\\s+TABLE\\b", Pattern.CASE_INSENSITIVE);

    private static final Map<RowKind, String> ROW_KIND_LABELS = Map.of(
            RowKind.INSERT, "+I",
            RowKind.UPDATE_BEFORE, "-U",
            RowKind.UPDATE_AFTER, "+U",
            RowKind.DELETE, "-D"
    );

    private final SqlSecurityValidator validator;
    private final ExecutionLimits limits;

    public SqlExecutionService(SqlSecurityValidator validator, ExecutionLimits limits) {
        this.validator = validator;
        this.limits = limits;
    }

    /**
     * Test-only entry point: executes directly on the calling thread. Production code
     * must go through {@link #execute(FlinkSession, ExecutionMode, String)} so that
     * planning runs on the session's dedicated planner thread (see {@link FlinkSession}).
     */
    @VisibleForTesting
    public QueryResult execute(TableEnvironment tEnv, String sql) {
        validator.validate(sql);

        log.debug("Executing SQL: {}", sql);
        long startTime = System.currentTimeMillis();

        TableResult tableResult = tEnv.executeSql(sql);

        return awaitResult(tableResult, sql, startTime);
    }

    /**
     * Executes a single SQL statement. The input is treated as one statement here
     * (DDL detection is anchored at the start); multi-statement splitting, where it
     * happens, is the caller's responsibility — {@link SqlSecurityValidator} validates
     * each statement of a {@code ;}-separated batch independently.
     */
    public QueryResult execute(FlinkSession session, ExecutionMode mode, String sql) {
        validator.validate(sql);

        if (isDdl(sql)) {
            log.debug("DDL detected, syncing to both environments: {}", SqlText.truncate(sql));
            return executeDdlOnBothEnvironments(session, sql);
        }

        log.info("Executing SQL [{}]: {}", mode, SqlText.truncate(sql));

        TableEnvironment tEnv = (mode == ExecutionMode.BATCH)
                ? session.getBatchEnv()
                : session.getStreamEnv();

        return executeOnSessionThread(session, tEnv, sql);
    }

    public List<TableInfo> listTables(FlinkSession session) {
        return session.runOnPlannerThread(() -> {
            TableEnvironment tEnv = session.getStreamEnv();
            String[] tableNames = tEnv.listTables();
            log.debug("listTables found {} table(s): {}", tableNames.length, String.join(", ", tableNames));
            List<TableInfo> tables = new ArrayList<>();
            for (String tableName : tableNames) {
                try {
                    ResolvedSchema schema = tEnv.from(tableName).getResolvedSchema();
                    List<ColumnInfo> columns = schema.getColumns().stream()
                            .map(col -> new ColumnInfo(col.getName(), col.getDataType().toString()))
                            .toList();
                    tables.add(new TableInfo(tableName, columns));
                } catch (Exception e) {
                    log.warn("Failed to resolve schema for table '{}': {}", tableName, e.getMessage());
                    tables.add(new TableInfo(tableName, List.of()));
                }
            }
            return tables;
        });
    }

    /**
     * For a CREATE TABLE statement, returns the matching {@code DROP TABLE IF EXISTS}
     * statement that makes re-execution safe. Empty for any other statement.
     */
    static Optional<String> dropStatementFor(String sql) {
        String normalized = stripLeadingComments(sql);
        Matcher matcher = CREATE_TABLE_PATTERN.matcher(normalized);
        if (!matcher.find()) {
            return Optional.empty();
        }
        // A temporary table must be dropped with DROP TEMPORARY TABLE — DROP TABLE only
        // targets the permanent catalog, so it would no-op here and the re-CREATE would then
        // fail with "table already exists". Match the idempotent DROP to the CREATE's kind.
        String keyword = CREATE_TEMPORARY_TABLE_PATTERN.matcher(normalized).find()
                ? "DROP TEMPORARY TABLE IF EXISTS "
                : "DROP TABLE IF EXISTS ";
        return Optional.of(keyword + matcher.group(1));
    }

    static boolean isDdl(String sql) {
        return DDL_PATTERN.matcher(stripLeadingComments(sql)).find();
    }

    /**
     * Strips leading comments/whitespace so the DDL/CREATE-TABLE patterns (anchored at the
     * start) still match a statement that opens with a comment. Without this, a statement like
     * {@code "-- note\nCREATE TABLE ..."} is not recognized as DDL, so it never gets synced
     * to both the batch and streaming environments — and toggling modes then fails to find
     * the table. Delegates to {@link SqlText#stripLeadingComments(String)}, the single
     * implementation shared with {@link SqlSecurityValidator}.
     */
    static String stripLeadingComments(String sql) {
        return SqlText.stripLeadingComments(sql);
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
            // Drop any prior table of the same name first so re-execution is idempotent.
            dropStatementFor(sql).ifPresent(drop -> {
                log.debug("Executing idempotent DROP: {}", drop);
                session.getBatchEnv().executeSql(drop);
                session.getStreamEnv().executeSql(drop);
            });
            session.getBatchEnv().executeSql(sql);
            session.getStreamEnv().executeSql(sql);
            return null;
        });
        long executionTimeMs = System.currentTimeMillis() - startTime;
        return new QueryResult(List.of(), List.of(), List.of(), List.of(), executionTimeMs, false);
    }

    /**
     * Handle to a submitted streaming query. Created synchronously by
     * {@link #prepareStream} (so validation and SQL-compile errors surface on the
     * request thread and map to proper HTTP status codes), then consumed
     * asynchronously by {@link #streamRows}. A null {@code tableResult} denotes a DDL
     * statement that produced no result set.
     */
    public record StreamingQuery(TableResult tableResult, long startTime) {
        boolean isDdl() {
            return tableResult == null;
        }
    }

    /**
     * Validates and submits a query for streaming, returning immediately. For a SELECT
     * this submits the job and returns its lazy {@link TableResult}; rows are pulled
     * later by {@link #streamRows}. DDL is executed eagerly (synced to both envs) and
     * yields a DDL marker. Runs on the request thread so security/SQL errors propagate
     * to the {@code GlobalExceptionHandler}.
     */
    public StreamingQuery prepareStream(FlinkSession session, String sql) {
        validator.validate(sql);
        long startTime = System.currentTimeMillis();

        if (isDdl(sql)) {
            log.debug("DDL detected on stream path, syncing to both environments: {}", SqlText.truncate(sql));
            executeDdlOnBothEnvironments(session, sql);
            return new StreamingQuery(null, startTime);
        }

        log.info("Streaming SQL: {}", SqlText.truncate(sql));
        TableEnvironment tEnv = session.getStreamEnv();
        TableResult tableResult = session.runOnPlannerThread(() -> tEnv.executeSql(sql));
        return new StreamingQuery(tableResult, startTime);
    }

    /**
     * Pushes results to {@code listener} one row at a time as Flink yields them.
     * Stops on the first of: row cap ({@link ExecutionLimits#maxRows()}), wall-clock cap
     * ({@link ExecutionLimits#streamTimeout()}), source exhaustion, or client disconnect
     * (an {@link IOException} from the listener). The underlying job is cancelled when the
     * stream ends early. Intended to run on a background (virtual) thread.
     */
    public void streamRows(StreamingQuery query, ResultStreamListener listener) throws IOException {
        if (query.isDdl()) {
            listener.onSchema(List.of(), List.of());
            listener.onEnd(0, false, System.currentTimeMillis() - query.startTime());
            return;
        }

        TableResult tableResult = query.tableResult();
        long startTime = query.startTime();

        List<String> columnNames = new ArrayList<>();
        List<String> columnTypes = new ArrayList<>();
        tableResult.getResolvedSchema().getColumns().forEach(col -> {
            columnNames.add(col.getName());
            columnTypes.add(col.getDataType().toString());
        });
        listener.onSchema(columnNames, columnTypes);

        AtomicBoolean deadlineFired = new AtomicBoolean(false);
        ScheduledFuture<?> deadline = tableResult.getJobClient()
                .map(jc -> STREAM_DEADLINE.schedule(() -> {
                    deadlineFired.set(true);
                    cancelQuietly(jc);
                }, limits.streamTimeout().toMillis(), TimeUnit.MILLISECONDS))
                .orElse(null);

        int count = 0;
        boolean rowCapHit = false;
        boolean clientGone = false;
        try (CloseableIterator<Row> it = tableResult.collect()) {
            while (it.hasNext()) {
                if (count >= limits.maxRows()) {
                    rowCapHit = true;
                    break;
                }
                Row row = it.next();
                try {
                    listener.onRow(
                            ROW_KIND_LABELS.getOrDefault(row.getKind(), row.getKind().name()),
                            rowValues(row));
                } catch (IOException e) {
                    clientGone = true; // client aborted/disconnected — stop and cancel
                    break;
                }
                count++;
            }
        } catch (Exception e) {
            // A deadline/stop cancellation surfaces here as an iterator failure; treat as a clean end.
            log.debug("Stream iteration ended: {}", e.getMessage());
        } finally {
            if (deadline != null) {
                deadline.cancel(false);
            }
            if (rowCapHit || clientGone) {
                tableResult.getJobClient().ifPresent(SqlExecutionService::cancelQuietly);
            }
        }

        boolean truncated = rowCapHit || deadlineFired.get();
        log.info("Stream complete: {} rows{}{}", count,
                truncated ? " (truncated)" : "",
                clientGone ? " (client disconnected)" : "");

        if (!clientGone) {
            listener.onEnd(count, truncated, System.currentTimeMillis() - startTime);
        }
    }

    /** Best-effort job cancellation — a job that already terminated throws, which we ignore. */
    private static void cancelQuietly(JobClient jobClient) {
        try {
            jobClient.cancel();
        } catch (Exception e) {
            log.debug("Job cancel skipped (already terminated?): {}", e.getMessage());
        }
    }

    private static List<Object> rowValues(Row row) {
        List<Object> values = new ArrayList<>(row.getArity());
        for (int i = 0; i < row.getArity(); i++) {
            values.add(row.getField(i));
        }
        return values;
    }

    private QueryResult awaitResult(TableResult tableResult, String sql, long startTime) {
        CompletableFuture<QueryResult> future = CompletableFuture.supplyAsync(() ->
                collectResult(tableResult, startTime), RESULT_COLLECTOR);

        try {
            QueryResult result = future.get(limits.executionTimeout().toMillis(), TimeUnit.MILLISECONDS);
            log.info("Query complete: {} rows in {}ms{}",
                    result.rowCount(), result.executionTimeMs(),
                    result.truncated() ? " (truncated)" : "");
            return result;
        } catch (TimeoutException e) {
            future.cancel(true);
            tableResult.getJobClient().ifPresent(client -> client.cancel());
            log.warn("Execution timeout after {}s: {}", limits.executionTimeout().toSeconds(),
                    SqlText.truncate(sql));
            throw new ExecutionTimeoutException((int) limits.executionTimeout().toSeconds());
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
                if (rows.size() >= limits.maxRows()) {
                    truncated = true;
                    break;
                }
                Row row = it.next();
                rowKinds.add(ROW_KIND_LABELS.getOrDefault(row.getKind(), row.getKind().name()));
                rows.add(rowValues(row));

                // Time-based collection limit: for unbounded streaming queries,
                // return partial results rather than blocking until the hard timeout.
                // Bounded queries (batch/finite sources) end naturally before this fires.
                if ((System.currentTimeMillis() - startTime) > limits.collectionTimeout().toMillis()) {
                    truncated = true;
                    break;
                }
            }
        } catch (Exception e) {
            throw new RuntimeException("Failed to collect query results", e);
        }

        long executionTimeMs = System.currentTimeMillis() - startTime;
        return new QueryResult(columnNames, columnTypes, rows, rowKinds, executionTimeMs, truncated);
    }
}
