package com.flinksqlfiddle.session;

import com.flinksqlfiddle.flink.FlinkEnvironmentFactory;
import org.apache.flink.table.api.TableEnvironment;

import java.time.Instant;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class FlinkSession {

    private final String sessionId;
    private final TableEnvironment batchEnv;
    private final TableEnvironment streamEnv;
    private final Instant createdAt;
    private volatile Instant lastAccessed;

    // Dedicated thread for Flink SQL planning — Calcite's RelMetadataQuery uses
    // thread-local state, so all TableEnvironment operations (creation and executeSql)
    // must happen on the same thread to avoid NullPointerException in the metadata
    // handler provider.
    private final ExecutorService plannerExecutor;

    /**
     * Creates a session with environments built on the dedicated planner thread.
     * This ensures Calcite's thread-local metadata providers are consistent.
     */
    public FlinkSession(String sessionId, FlinkEnvironmentFactory factory) {
        this.sessionId = sessionId;
        this.createdAt = Instant.now();
        this.lastAccessed = this.createdAt;
        this.plannerExecutor = createPlannerExecutor(sessionId);
        this.batchEnv = runOnPlannerThread(factory::createBatchEnvironment);
        this.streamEnv = runOnPlannerThread(factory::createStreamingEnvironment);
    }

    /**
     * Creates a session with pre-built environments. Use only when creation and
     * execution happen on the same thread (e.g. in tests).
     */
    public FlinkSession(String sessionId, TableEnvironment batchEnv, TableEnvironment streamEnv) {
        this.sessionId = sessionId;
        this.batchEnv = batchEnv;
        this.streamEnv = streamEnv;
        this.createdAt = Instant.now();
        this.lastAccessed = this.createdAt;
        this.plannerExecutor = createPlannerExecutor(sessionId);
    }

    private static ExecutorService createPlannerExecutor(String sessionId) {
        return Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "flink-planner-" + sessionId.substring(0, Math.min(8, sessionId.length())));
            t.setDaemon(true);
            return t;
        });
    }

    /**
     * Runs a task on the session's dedicated planner thread.
     * This ensures Calcite's thread-local metadata state stays consistent.
     */
    public <T> T runOnPlannerThread(Callable<T> task) {
        try {
            return plannerExecutor.submit(task).get();
        } catch (ExecutionException e) {
            Throwable cause = e.getCause();
            if (cause instanceof RuntimeException re) throw re;
            throw new RuntimeException(cause);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Planner thread interrupted", e);
        }
    }

    public void close() {
        plannerExecutor.shutdownNow();
    }

    public String getSessionId() {
        return sessionId;
    }

    public TableEnvironment getBatchEnv() {
        return batchEnv;
    }

    public TableEnvironment getStreamEnv() {
        return streamEnv;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getLastAccessed() {
        return lastAccessed;
    }

    public void updateLastAccessed() {
        this.lastAccessed = Instant.now();
    }
}
