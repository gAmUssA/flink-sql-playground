package com.flinksqlfiddle.api;

import com.flinksqlfiddle.api.dto.ExecuteRequest;
import com.flinksqlfiddle.api.dto.TimelineEvent;
import com.flinksqlfiddle.execution.ExecutionMode;
import com.flinksqlfiddle.execution.NotExplainableException;
import com.flinksqlfiddle.execution.timeline.TimelineService;
import com.flinksqlfiddle.execution.timeline.TimelineService.TimelineListener;
import com.flinksqlfiddle.execution.timeline.TimelineService.TimelineQuery;
import com.flinksqlfiddle.session.FlinkSession;
import com.flinksqlfiddle.session.SessionManager;
import io.smallrye.common.annotation.Blocking;
import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.subscription.MultiEmitter;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Streams a query's event-time timeline as NDJSON ({@link TimelineEvent} frames): a meta frame,
 * one tick per probed record, then end. Planning errors and "no event time" surface before the
 * stream starts, as HTTP 400. See {@link TimelineService}.
 */
@Path("/api/sessions/{sessionId}/timeline")
@ApplicationScoped
public class TimelineResource {

    private static final Logger log = LoggerFactory.getLogger(TimelineResource.class);

    private final ExecutorService streamExecutor = Executors.newVirtualThreadPerTaskExecutor();
    private final SessionManager sessionManager;
    private final TimelineService timelineService;

    public TimelineResource(SessionManager sessionManager, TimelineService timelineService) {
        this.sessionManager = sessionManager;
        this.timelineService = timelineService;
    }

    @PreDestroy
    void shutdown() {
        streamExecutor.shutdown();
    }

    @POST
    @Path("/stream")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces("application/x-ndjson")
    @RestStreamElementType(MediaType.APPLICATION_JSON)
    @Blocking
    public Multi<TimelineEvent> stream(@PathParam("sessionId") String sessionId, @Valid ExecuteRequest request) {
        if (request.mode() != ExecutionMode.STREAMING) {
            throw new NotExplainableException(
                    "Watermarks belong to streaming mode: switch to Streaming to record a timeline", "NOT_STREAMING");
        }
        FlinkSession session = sessionManager.getSession(sessionId);
        TimelineQuery query = timelineService.prepare(session, request.sql());

        return Multi.createFrom().<TimelineEvent>emitter(emitter -> {
            Listener listener = new Listener(emitter);
            emitter.onTermination(listener::clientGone);
            streamExecutor.execute(() -> {
                try {
                    listener.send(TimelineEvent.meta(query.meta()));
                    timelineService.stream(query, listener);
                    emitter.complete();
                } catch (IOException e) {
                    log.debug("Timeline client disconnected: {}", e.getMessage());
                    emitter.complete();
                } catch (Exception e) {
                    log.warn("Timeline probe failed: {}", e.getMessage());
                    listener.trySend(TimelineEvent.error(e.getMessage()));
                    emitter.complete();
                }
            });
        });
    }

    private static final class Listener implements TimelineListener {
        private final MultiEmitter<? super TimelineEvent> emitter;
        private final AtomicBoolean cancelled = new AtomicBoolean(false);

        Listener(MultiEmitter<? super TimelineEvent> emitter) {
            this.emitter = emitter;
        }

        void clientGone() {
            cancelled.set(true);
        }

        @Override
        public void onTick(long eventTime, Long watermark) throws IOException {
            send(TimelineEvent.tick(eventTime, watermark));
        }

        @Override
        public void onEnd(int count, boolean truncated) throws IOException {
            send(TimelineEvent.end(count, truncated));
        }

        void send(TimelineEvent event) throws IOException {
            if (cancelled.get()) {
                throw new IOException("client disconnected");
            }
            emitter.emit(event);
        }

        void trySend(TimelineEvent event) {
            if (!cancelled.get()) {
                emitter.emit(event);
            }
        }
    }
}
