package com.flinksqlfiddle.execution;

import com.flinksqlfiddle.execution.plan.ExplainResult;
import com.flinksqlfiddle.execution.plan.PlanParser;
import com.flinksqlfiddle.security.SqlSecurityValidator;
import com.flinksqlfiddle.session.FlinkSession;
import com.flinksqlfiddle.util.SqlText;
import org.apache.flink.annotation.VisibleForTesting;
import org.apache.flink.core.execution.JobClient;
import org.apache.flink.table.api.ExplainDetail;
import org.apache.flink.table.api.ExplainFormat;
import org.apache.flink.table.api.SqlParserException;
import org.apache.flink.table.api.TableEnvironment;
import org.apache.flink.table.api.ValidationException;
import org.apache.flink.table.api.internal.TableEnvironmentInternal;
import org.apache.flink.table.api.TableResult;
import org.apache.flink.table.catalog.ResolvedSchema;
import org.apache.flink.table.operations.CollectModifyOperation;
import org.apache.flink.table.operations.ExplainOperation;
import org.apache.flink.table.operations.ModifyOperation;
import org.apache.flink.table.operations.Operation;
import org.apache.flink.table.operations.QueryOperation;
import org.apache.flink.table.operations.SinkModifyOperation;
import org.apache.flink.table.operations.StatementSetOperation;
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
import java.util.function.Supplier;
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

    // CREATE [TEMPORARY] TABLE|VIEW [IF NOT EXISTS] name, the name possibly qualified and quoted.
    private static final Pattern CREATE_TABLE_OR_VIEW_PATTERN = Pattern.compile(
            "^\\s*CREATE\\s+(TEMPORARY\\s+)?(TABLE|VIEW)\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?"
                    + "((?:`(?:[^`]|``)*`|[^\\s.`(]+)(?:\\s*\\.\\s*(?:`(?:[^`]|``)*`|[^\\s.`(]+))*)",
            Pattern.CASE_INSENSITIVE);

    // DROP [TEMPORARY] TABLE|VIEW [IF EXISTS] name.
    private static final Pattern DROP_TABLE_OR_VIEW_PATTERN = Pattern.compile(
            "^\\s*DROP\\s+(TEMPORARY\\s+)?(TABLE|VIEW)\\s+(?:IF\\s+EXISTS\\s+)?"
                    + "((?:`(?:[^`]|``)*`|[^\\s.`(;]+)(?:\\s*\\.\\s*(?:`(?:[^`]|``)*`|[^\\s.`(;]+))*)",
            Pattern.CASE_INSENSITIVE);

    // The last part of a possibly qualified, possibly quoted name: `a`.`b c` -> b c, db.t -> t.
    private static final Pattern LAST_NAME_PART = Pattern.compile("(?:`((?:[^`]|``)*)`|([^\\s.`]+))\\s*$");

    // Flink's refusal to plan an unbounded source in batch mode (DynamicSourceUtils).
    private static final String UNBOUNDED_IN_BATCH = "in batch mode is not allowed";

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
            return planning(sql, () -> executeDdlOnBothEnvironments(session, sql));
        }

        log.info("Executing SQL [{}]: {}", mode, SqlText.truncate(sql));

        TableEnvironment tEnv = (mode == ExecutionMode.BATCH)
                ? session.getBatchEnv()
                : session.getStreamEnv();

        try {
            return executeOnSessionThread(session, tEnv, sql);
        } catch (TableNotFoundException e) {
            throw streamingOnlyViewOr(session, mode, e);
        }
    }

    /**
     * A BATCH statement that misses a view the session has in Streaming only gets a
     * {@link StreamingOnlyViewException}: building the schema again would not create it.
     */
    private static RuntimeException streamingOnlyViewOr(FlinkSession session, ExecutionMode mode,
                                                        TableNotFoundException e) {
        if (mode == ExecutionMode.BATCH && session.isStreamingOnlyView(e.table())) {
            return new StreamingOnlyViewException(e.table(), e);
        }
        return e;
    }

    /**
     * Runs a planning step of {@code sql}, turning a planner error about a table or view the
     * session does not have into a {@link TableNotFoundException}. Other errors pass unchanged.
     */
    private static <T> T planning(String sql, Supplier<T> step) {
        try {
            return step.get();
        } catch (RuntimeException e) {
            Optional<TableNotFoundException> missing = TableNotFoundException.detect(e, sql);
            if (missing.isPresent()) {
                throw missing.get();
            }
            throw e;
        }
    }

    /**
     * Returns the optimized physical plan of {@code sql} without running it. A query is planned
     * with the same collect sink that {@link #execute} and {@link #prepareStream} attach, so the
     * changelog modes match the rows the user will see: a bare {@code explainSql} of a SELECT
     * plans without a sink, and an aggregate then reports {@code [I,UA]} where the collected
     * stream carries {@code [I,UB,UA]}. An INSERT or a statement set is planned as written.
     * Leading EXPLAINs are unwrapped. Anything else (DDL, SHOW, CTAS) is rejected: planning
     * a CTAS goes through table creation, and DDL has no plan.
     *
     * <p>Planning submits no job and takes no MiniCluster slot. It runs on the session's planner
     * thread, like every other TableEnvironment call (see {@link FlinkSession}). See
     * docs/adr/0004-real-job-graph-from-explain.md.
     */
    public ExplainResult explain(FlinkSession session, ExecutionMode mode, String sql) {
        validator.validate(sql);
        TableEnvironment tEnv = (mode == ExecutionMode.BATCH) ? session.getBatchEnv() : session.getStreamEnv();
        String text;
        try {
            text = planning(sql, () -> session.runOnPlannerThread(() -> explainText(tEnv, mode, sql)));
        } catch (TableNotFoundException e) {
            RuntimeException translated = streamingOnlyViewOr(session, mode, e);
            if (translated instanceof StreamingOnlyViewException) {
                throw new NotExplainableException(translated.getMessage(), "STREAMING_ONLY_VIEW");
            }
            throw e;
        } catch (ValidationException | SqlParserException e) {
            throw new NotExplainableException(e.getMessage(), "INVALID_SQL");
        }
        return PlanParser.parse(text, mode);
    }

    @VisibleForTesting
    static String explainText(TableEnvironment tEnv, ExecutionMode mode, String sql) {
        if (!(tEnv instanceof TableEnvironmentInternal internal)) {
            throw new IllegalStateException("TableEnvironment does not expose the planner");
        }
        List<Operation> operations = internal.getParser().parse(sql);
        if (operations.size() != 1) {
            throw new NotExplainableException("Explain one statement at a time");
        }
        Operation operation = operations.getFirst();
        while (operation instanceof ExplainOperation explain) {
            operation = explain.getChild();
        }
        List<Operation> targets = explainTargets(operation);
        // PLAN_ADVICE is streaming-only: the batch planner throws UnsupportedOperationException.
        ExplainDetail[] details = mode == ExecutionMode.STREAMING
                ? new ExplainDetail[]{ExplainDetail.CHANGELOG_MODE, ExplainDetail.PLAN_ADVICE}
                : new ExplainDetail[0];
        log.debug("Explaining [{}]: {}", mode, SqlText.truncate(sql));
        return internal.explainInternal(targets, ExplainFormat.TEXT, details);
    }

    /** The operations to plan; a statement set is planned as its INSERTs, together. */
    private static List<Operation> explainTargets(Operation operation) {
        if (operation instanceof QueryOperation query) {
            return List.of(new CollectModifyOperation(query));
        }
        if (isPlainInsert(operation)) {
            return List.of(operation);
        }
        if (operation instanceof StatementSetOperation set
                && !set.getOperations().isEmpty()
                && set.getOperations().stream().allMatch(SqlExecutionService::isPlainInsert)) {
            return List.copyOf(set.getOperations());
        }
        throw new NotExplainableException(
                "Only queries, INSERT statements and statement sets have a job graph");
    }

    /** An INSERT into an existing table. Subclasses (CTAS, RTAS staging) create tables. */
    private static boolean isPlainInsert(Operation operation) {
        return operation instanceof ModifyOperation && operation.getClass() == SinkModifyOperation.class;
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
     * For a CREATE TABLE or CREATE VIEW statement, returns the matching {@code DROP ... IF EXISTS}
     * statement that makes re-execution safe: building the schema again after a partial build
     * must not stop at a view the first build already created. Empty for any other statement.
     */
    static Optional<String> dropStatementFor(String sql) {
        String normalized = stripLeadingComments(sql);
        Matcher matcher = CREATE_TABLE_OR_VIEW_PATTERN.matcher(normalized);
        if (!matcher.find()) {
            return Optional.empty();
        }
        // A temporary table or view must be dropped with DROP TEMPORARY ...: the plain DROP only
        // targets the permanent catalog, so it would no-op here (or, for a view, fail because a
        // temporary one shadows it) and the re-CREATE would then fail with "already exists".
        // Match the idempotent DROP to the CREATE's kind.
        String temporary = matcher.group(1) != null ? "TEMPORARY " : "";
        String kind = matcher.group(2).toUpperCase(java.util.Locale.ROOT);
        return Optional.of("DROP " + temporary + kind + " IF EXISTS " + matcher.group(3));
    }

    /** The unquoted last name part of the table or view a CREATE or DROP statement names. */
    static Optional<String> ddlObjectName(String sql) {
        String normalized = stripLeadingComments(sql);
        Matcher matcher = CREATE_TABLE_OR_VIEW_PATTERN.matcher(normalized);
        if (!matcher.find()) {
            matcher = DROP_TABLE_OR_VIEW_PATTERN.matcher(normalized);
            if (!matcher.find()) {
                return Optional.empty();
            }
        }
        Matcher last = LAST_NAME_PART.matcher(matcher.group(3));
        if (!last.find()) {
            return Optional.empty();
        }
        return Optional.of(last.group(1) != null ? last.group(1).replace("``", "`") : last.group(2));
    }

    private static boolean isDrop(String sql) {
        return DROP_TABLE_OR_VIEW_PATTERN.matcher(stripLeadingComments(sql)).find();
    }

    private static boolean isCreateView(String sql) {
        Matcher matcher = CREATE_TABLE_OR_VIEW_PATTERN.matcher(stripLeadingComments(sql));
        return matcher.find() && matcher.group(2).equalsIgnoreCase("VIEW");
    }

    /** The batch failure is a missing view that this session has in Streaming only. */
    private static boolean readsStreamingOnlyView(FlinkSession session, RuntimeException e, String sql) {
        return TableNotFoundException.detect(e, sql)
                .map(missing -> session.isStreamingOnlyView(missing.table()))
                .orElse(false);
    }

    private static boolean isUnboundedInBatch(Throwable e) {
        for (Throwable t = e; t != null; t = t.getCause() == t ? null : t.getCause()) {
            if (t instanceof ValidationException && t.getMessage() != null
                    && t.getMessage().contains(UNBOUNDED_IN_BATCH)) {
                return true;
            }
        }
        return false;
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
        TableResult tableResult = planning(sql, () -> session.runOnPlannerThread(() -> tEnv.executeSql(sql)));

        // Result collection only iterates rows — no planner involvement, safe on any thread.
        return awaitResult(tableResult, sql, startTime);
    }

    private QueryResult executeDdlOnBothEnvironments(FlinkSession session, String sql) {
        long startTime = System.currentTimeMillis();
        session.runOnPlannerThread(() -> {
            // Drop any prior table or view of the same name first so re-execution is idempotent.
            dropStatementFor(sql).ifPresent(drop -> {
                log.debug("Executing idempotent DROP: {}", drop);
                session.getBatchEnv().executeSql(drop);
                session.getStreamEnv().executeSql(drop);
            });
            Optional<String> name = ddlObjectName(sql);
            boolean streamingOnly = name.map(session::isStreamingOnlyView).orElse(false);
            name.ifPresent(session::clearStreamingOnlyView);
            if (streamingOnly && isDrop(sql)) {
                // The batch environment never had it: a plain DROP VIEW would fail there.
                session.getStreamEnv().executeSql(sql);
                return null;
            }
            try {
                session.getBatchEnv().executeSql(sql);
            } catch (RuntimeException e) {
                // A view over an unbounded table (a deduplication over a faker or datagen
                // stream) cannot be planned in batch mode, nor can a view over such a view.
                // Create it for Streaming only and remember that, so a BATCH query on it says
                // so instead of "not found".
                if (!isCreateView(sql) || name.isEmpty()
                        || !(isUnboundedInBatch(e) || readsStreamingOnlyView(session, e, sql))) {
                    throw e;
                }
                log.debug("View {} reads an unbounded table: streaming environment only", name.get());
                session.getStreamEnv().executeSql(sql);
                session.markStreamingOnlyView(name.get());
                return null;
            }
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
            planning(sql, () -> executeDdlOnBothEnvironments(session, sql));
            return new StreamingQuery(null, startTime);
        }

        log.info("Streaming SQL: {}", SqlText.truncate(sql));
        TableEnvironment tEnv = session.getStreamEnv();
        TableResult tableResult = planning(sql, () -> session.runOnPlannerThread(() -> tEnv.executeSql(sql)));
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
            // The deadline cancels the job, which surfaces here as an iterator failure: a clean,
            // truncated end. Anything else is the job failing (a bad cast, an overflow): report it
            // instead of ending the stream as if every row had arrived.
            if (!deadlineFired.get()) {
                throw new RuntimeException("Query failed: " + rootCauseMessage(e), e);
            }
            log.debug("Stream iteration ended by the deadline: {}", e.getMessage());
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

    /**
     * The innermost cause, which for a failed Flink job is the user-facing error (a bad cast,
     * an overflow) rather than the layers of job-execution wrappers around it.
     */
    static String rootCauseMessage(Throwable t) {
        Throwable root = t;
        while (root.getCause() != null && root.getCause() != root) {
            root = root.getCause();
        }
        String message = root.getMessage();
        return root.getClass().getSimpleName() + (message == null || message.isBlank() ? "" : ": " + message);
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
            throw new RuntimeException("Failed to collect query results: " + rootCauseMessage(e), e);
        }

        long executionTimeMs = System.currentTimeMillis() - startTime;
        return new QueryResult(columnNames, columnTypes, rows, rowKinds, executionTimeMs, truncated);
    }
}
