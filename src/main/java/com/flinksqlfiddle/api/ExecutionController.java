package com.flinksqlfiddle.api;

import tools.jackson.databind.ObjectMapper;
import com.flinksqlfiddle.api.dto.ExecuteRequest;
import com.flinksqlfiddle.api.dto.ExecuteResponse;
import com.flinksqlfiddle.api.dto.StreamEvent;
import com.flinksqlfiddle.execution.ExecutionLimits;
import com.flinksqlfiddle.execution.QueryResult;
import com.flinksqlfiddle.execution.ResultStreamListener;
import com.flinksqlfiddle.execution.SqlExecutionService;
import com.flinksqlfiddle.execution.SqlExecutionService.StreamingQuery;
import com.flinksqlfiddle.session.FlinkSession;
import com.flinksqlfiddle.session.SessionManager;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyEmitter;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@RestController
@RequestMapping("/api/sessions/{sessionId}")
public class ExecutionController {

    private static final Logger log = LoggerFactory.getLogger(ExecutionController.class);

    // Each streaming request occupies a thread for its whole lifetime (up to streamTimeout),
    // so virtual threads keep this cheap under many concurrent streams.
    private static final ExecutorService STREAM_EXECUTOR =
            Executors.newVirtualThreadPerTaskExecutor();

    private final SessionManager sessionManager;
    private final SqlExecutionService executionService;
    private final ExecutionLimits limits;
    private final ObjectMapper objectMapper;

    public ExecutionController(SessionManager sessionManager,
                               SqlExecutionService executionService,
                               ExecutionLimits limits,
                               ObjectMapper objectMapper) {
        this.sessionManager = sessionManager;
        this.executionService = executionService;
        this.limits = limits;
        this.objectMapper = objectMapper;
    }

    @PostMapping("/execute")
    public ExecuteResponse execute(@PathVariable String sessionId,
                                   @Valid @RequestBody ExecuteRequest request) {
        FlinkSession session = sessionManager.getSession(sessionId);
        QueryResult result = executionService.execute(session, request.mode(), request.sql());
        return ExecuteResponse.from(result);
    }

    /**
     * Streams query results as newline-delimited JSON ({@link StreamEvent} frames), pushing
     * each row as Flink yields it rather than buffering the full result set. Validation and
     * SQL-compile errors surface synchronously (before any streaming) so they map to proper
     * HTTP status codes via {@code GlobalExceptionHandler}; once streaming has begun, errors
     * are delivered as an {@code error} frame.
     */
    @PostMapping(value = "/execute/stream", produces = MediaType.APPLICATION_NDJSON_VALUE)
    public ResponseBodyEmitter executeStream(@PathVariable String sessionId,
                                             @Valid @RequestBody ExecuteRequest request) {
        FlinkSession session = sessionManager.getSession(sessionId);
        StreamingQuery query = executionService.prepareStream(session, request.sql());

        // Emitter timeout sits just beyond the server-side stream cap so the container's
        // async timeout never truncates a stream that is still within its allowed window.
        ResponseBodyEmitter emitter = new ResponseBodyEmitter(limits.streamTimeout().toMillis() + 5_000);
        STREAM_EXECUTOR.execute(() -> {
            try {
                executionService.streamRows(query, new EmitterStreamListener(emitter, objectMapper));
                emitter.complete();
            } catch (IOException e) {
                // Client disconnected mid-stream; nothing left to send.
                log.debug("Stream client disconnected: {}", e.getMessage());
                emitter.complete();
            } catch (Exception e) {
                log.warn("Streaming query failed: {}", e.getMessage());
                trySend(emitter, StreamEvent.error(e.getMessage(), "STREAM_ERROR"));
                emitter.complete();
            }
        });
        return emitter;
    }

    private void trySend(ResponseBodyEmitter emitter, StreamEvent event) {
        try {
            emitter.send(objectMapper.writeValueAsString(event) + "\n", MediaType.APPLICATION_NDJSON);
        } catch (IOException ignored) {
            // Client already gone — best effort.
        }
    }

    /** Serializes each callback as one NDJSON line onto the response emitter. */
    private record EmitterStreamListener(ResponseBodyEmitter emitter, ObjectMapper mapper)
            implements ResultStreamListener {

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
            emitter.send(mapper.writeValueAsString(event) + "\n", MediaType.APPLICATION_NDJSON);
        }
    }
}
