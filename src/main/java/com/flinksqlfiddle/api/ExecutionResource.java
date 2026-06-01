package com.flinksqlfiddle.api;

import com.flinksqlfiddle.api.dto.ExecuteRequest;
import com.flinksqlfiddle.api.dto.ExecuteResponse;
import com.flinksqlfiddle.api.dto.StreamEvent;
import com.flinksqlfiddle.execution.QueryResult;
import com.flinksqlfiddle.execution.ResultStreamListener;
import com.flinksqlfiddle.execution.SqlExecutionService;
import com.flinksqlfiddle.execution.SqlExecutionService.StreamingQuery;
import com.flinksqlfiddle.session.FlinkSession;
import com.flinksqlfiddle.session.SessionManager;
import io.smallrye.common.annotation.RunOnVirtualThread;
import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.subscription.MultiEmitter;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import org.jboss.resteasy.reactive.RestStreamElementType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

@Path("/api/sessions/{sessionId}")
@Produces(MediaType.APPLICATION_JSON)
public class ExecutionResource {

    private static final Logger log = LoggerFactory.getLogger(ExecutionResource.class);

    // Each streaming request occupies a thread for its whole lifetime (up to streamTimeout),
    // so virtual threads keep this cheap under many concurrent streams.
    private static final ExecutorService STREAM_EXECUTOR =
            Executors.newVirtualThreadPerTaskExecutor();

    private final SessionManager sessionManager;
    private final SqlExecutionService executionService;

    @Inject
    public ExecutionResource(SessionManager sessionManager, SqlExecutionService executionService) {
        this.sessionManager = sessionManager;
        this.executionService = executionService;
    }

    @POST
    @Path("/execute")
    @Consumes(MediaType.APPLICATION_JSON)
    @RunOnVirtualThread
    public ExecuteResponse execute(@PathParam("sessionId") String sessionId,
                                   @Valid ExecuteRequest request) {
        FlinkSession session = sessionManager.getSession(sessionId);
        QueryResult result = executionService.execute(session, request.mode(), request.sql());
        return ExecuteResponse.from(result);
    }

    /**
     * Streams query results as newline-delimited JSON ({@link StreamEvent} frames), pushing
     * each row as Flink yields it rather than buffering the full result set. Validation and
     * SQL-compile errors surface synchronously (in {@code prepareStream}, before any
     * streaming) so they map to proper HTTP status codes via {@code GlobalExceptionHandler};
     * once streaming has begun, errors are delivered as an {@code error} frame. Quarkus REST
     * serializes each emitted {@link StreamEvent} to one JSON line for {@code application/x-ndjson}.
     */
    @POST
    @Path("/execute/stream")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces("application/x-ndjson")
    @RestStreamElementType(MediaType.APPLICATION_JSON)
    public Multi<StreamEvent> executeStream(@PathParam("sessionId") String sessionId,
                                            @Valid ExecuteRequest request) {
        FlinkSession session = sessionManager.getSession(sessionId);
        StreamingQuery query = executionService.prepareStream(session, request.sql());

        return Multi.createFrom().<StreamEvent>emitter(emitter -> {
            EmitterStreamListener listener = new EmitterStreamListener(emitter);
            // Subscriber cancellation (client disconnect) flips the listener's flag so the
            // next callback throws IOException — the same stop path streamRows already handles.
            emitter.onTermination(listener::clientGone);
            STREAM_EXECUTOR.execute(() -> {
                try {
                    executionService.streamRows(query, listener);
                    emitter.complete();
                } catch (IOException e) {
                    // Client disconnected mid-stream; nothing left to send.
                    log.debug("Stream client disconnected: {}", e.getMessage());
                    emitter.complete();
                } catch (Exception e) {
                    log.warn("Streaming query failed: {}", e.getMessage());
                    listener.trySend(StreamEvent.error(e.getMessage(), "STREAM_ERROR"));
                    emitter.complete();
                }
            });
        });
    }

    /** Emits each callback as a {@link StreamEvent} onto the Mutiny stream. */
    private static final class EmitterStreamListener implements ResultStreamListener {

        private final MultiEmitter<? super StreamEvent> emitter;
        private final AtomicBoolean cancelled = new AtomicBoolean(false);

        EmitterStreamListener(MultiEmitter<? super StreamEvent> emitter) {
            this.emitter = emitter;
        }

        void clientGone() {
            cancelled.set(true);
        }

        @Override
        public void onSchema(List<String> columnNames, List<String> columnTypes) throws IOException {
            send(StreamEvent.schema(columnNames, columnTypes));
        }

        @Override
        public void onRow(String kind, List<Object> values) throws IOException {
            send(StreamEvent.row(kind, values));
        }

        @Override
        public void onEnd(int rowCount, boolean truncated, long executionTimeMs) throws IOException {
            send(StreamEvent.end(rowCount, truncated, executionTimeMs));
        }

        private void send(StreamEvent event) throws IOException {
            if (cancelled.get()) {
                throw new IOException("client disconnected");
            }
            emitter.emit(event);
        }

        void trySend(StreamEvent event) {
            if (!cancelled.get()) {
                emitter.emit(event);
            }
        }
    }
}
