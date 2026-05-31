package com.flinksqlfiddle.session;

import com.flinksqlfiddle.flink.FlinkEnvironmentFactory;
import org.apache.flink.table.api.TableEnvironment;

import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;
import java.util.function.Supplier;

public class FlinkSession {

    private final String sessionId;
    private final FlinkEnvironmentFactory factory;

    // Dedicated thread for Flink SQL planning — Calcite's RelMetadataQuery uses
    // thread-local state, so all TableEnvironment operations (creation and executeSql)
    // must happen on the same thread to avoid NullPointerException in the metadata
    // handler provider.
    private final ExecutorService plannerExecutor;
    private volatile Thread plannerThread;

    // Lazy-initialized environments — created on first access to save ~50 MB per
    // unused env and make session creation instant.
    private volatile TableEnvironment batchEnv;
    private volatile TableEnvironment streamEnv;
    private final Object batchLock = new Object();
    private final Object streamLock = new Object();

    /**
     * Creates a session with lazy environment initialization.
     * Environments are created on the dedicated planner thread on first access.
     */
    public FlinkSession(String sessionId, FlinkEnvironmentFactory factory) {
        this.sessionId = sessionId;
        this.factory = factory;
        this.plannerExecutor = createPlannerExecutor(sessionId);
    }

    /**
     * Creates a session with pre-built environments. Use only when creation and
     * execution happen on the same thread (e.g. in tests).
     */
    public FlinkSession(String sessionId, TableEnvironment batchEnv, TableEnvironment streamEnv) {
        this.sessionId = sessionId;
        this.factory = null;
        this.batchEnv = batchEnv;
        this.streamEnv = streamEnv;
        this.plannerExecutor = createPlannerExecutor(sessionId);
    }

    private ExecutorService createPlannerExecutor(String sessionId) {
        return Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "flink-planner-" + sessionId.substring(0, Math.min(8, sessionId.length())));
            t.setDaemon(true);
            plannerThread = t;
            return t;
        });
    }

    /**
     * Returns true if the current thread is the planner thread.
     * Used to avoid deadlock when getBatchEnv/getStreamEnv are called
     * from within a runOnPlannerThread block.
     */
    private boolean isOnPlannerThread() {
        return Thread.currentThread() == plannerThread;
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
        return getOrCreate(() -> batchEnv, env -> batchEnv = env, batchLock,
                factory::createBatchEnvironment);
    }

    public TableEnvironment getStreamEnv() {
        return getOrCreate(() -> streamEnv, env -> streamEnv = env, streamLock,
                factory::createStreamingEnvironment);
    }

    /**
     * Double-checked-locking lazy initializer shared by both environment getters.
     * If already on the planner thread (e.g. called from within a runOnPlannerThread
     * block such as DDL syncing), creates directly to avoid deadlocking on the
     * single-thread executor.
     */
    private TableEnvironment getOrCreate(Supplier<TableEnvironment> getter,
                                         Consumer<TableEnvironment> setter,
                                         Object lock,
                                         Supplier<TableEnvironment> creator) {
        TableEnvironment env = getter.get();
        if (env == null) {
            synchronized (lock) {
                env = getter.get();
                if (env == null) {
                    env = isOnPlannerThread() ? creator.get() : runOnPlannerThread(creator::get);
                    setter.accept(env);
                }
            }
        }
        return env;
    }
}
