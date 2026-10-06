package com.flinksqlfiddle.flink;

import org.apache.flink.configuration.Configuration;
import org.apache.flink.configuration.MemorySize;
import org.apache.flink.configuration.RestOptions;
import org.apache.flink.configuration.TaskManagerOptions;
import org.apache.flink.runtime.minicluster.MiniCluster;
import org.apache.flink.runtime.minicluster.MiniClusterConfiguration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.URI;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * One long-lived Flink MiniCluster that every session's TableEnvironment submits to.
 *
 * <p>Without it, Flink's local executor starts a fresh MiniCluster (Pekko RPC, blob
 * server, Netty shuffle, REST endpoint) for every query and tears it down afterwards,
 * which dominates the latency of small queries. Starting the cluster once moves that
 * cost to boot, off the request path.
 *
 * <p>The REST endpoint binds to 127.0.0.1 on an ephemeral port, so it is reachable only
 * from inside this process and never conflicts with another cluster.
 */
public class SharedMiniCluster implements AutoCloseable {

    private static final Logger log = LoggerFactory.getLogger(SharedMiniCluster.class);

    private static final String LOOPBACK = "127.0.0.1";

    private final FlinkProperties properties;
    private final CompletableFuture<URI> restAddress = new CompletableFuture<>();
    private final AtomicInteger startAttempts = new AtomicInteger();
    private volatile MiniCluster cluster;
    private boolean startRequested;
    private boolean closed;

    public SharedMiniCluster(FlinkProperties properties) {
        this.properties = properties;
    }

    /** Starts the cluster on a background thread; {@link #awaitRestAddress} blocks until it is up. */
    public synchronized void startAsync() {
        if (startRequested || closed) {
            return;
        }
        startRequested = true;
        Thread starter = new Thread(this::startNow, "flink-shared-minicluster-start");
        starter.setDaemon(true);
        starter.start();
    }

    private void startNow() {
        startAttempts.incrementAndGet();
        long begin = System.currentTimeMillis();
        MiniCluster mc = null;
        try {
            mc = new MiniCluster(clusterConfiguration());
            mc.start();
            URI uri = mc.getRestAddress().get(properties.clusterStartTimeout().toMillis(), TimeUnit.MILLISECONDS);
            synchronized (this) {
                if (closed) {
                    throw new IllegalStateException("closed while starting");
                }
                cluster = mc;
            }
            restAddress.complete(uri);
            log.info("Shared MiniCluster started in {}ms [slots={}, network={}, managed/slot={}, rest={}]",
                    System.currentTimeMillis() - begin, properties.clusterSlots(),
                    properties.clusterNetworkMemory(), properties.managedMemory(), uri);
        } catch (Exception e) {
            log.error("Shared MiniCluster failed to start: {}", e.getMessage(), e);
            closeQuietly(mc);
            restAddress.completeExceptionally(e);
        }
    }

    /** Releases a cluster that started partway (threads, ports) before its start failed. */
    private static void closeQuietly(MiniCluster mc) {
        if (mc == null) {
            return;
        }
        try {
            mc.close();
        } catch (Exception closeError) {
            log.warn("Could not close partially started MiniCluster: {}", closeError.getMessage());
        }
    }

    MiniClusterConfiguration clusterConfiguration() {
        int slots = properties.clusterSlots();
        MemorySize managedPerSlot = MemorySize.parse(properties.managedMemory());
        MemorySize network = MemorySize.parse(properties.clusterNetworkMemory());

        Configuration config = new Configuration();
        config.set(RestOptions.ADDRESS, LOOPBACK);
        config.set(RestOptions.BIND_ADDRESS, LOOPBACK);
        config.set(RestOptions.BIND_PORT, "0");
        config.set(TaskManagerOptions.NUM_TASK_SLOTS, slots);
        config.set(TaskManagerOptions.MANAGED_MEMORY_SIZE, managedPerSlot.multiply(slots));
        config.set(TaskManagerOptions.NETWORK_MEMORY_MIN, network);
        config.set(TaskManagerOptions.NETWORK_MEMORY_MAX, network);

        return new MiniClusterConfiguration.Builder()
                .setConfiguration(config)
                .setNumTaskManagers(1)
                .setNumSlotsPerTaskManager(slots)
                .build();
    }

    /**
     * The REST address jobs are submitted to. Waits for an in-progress start, starting the
     * cluster first if nobody has yet.
     *
     * @throws IllegalStateException if the cluster failed to start or did not start in time
     */
    public URI awaitRestAddress() {
        startAsync();
        Duration timeout = properties.clusterStartTimeout();
        try {
            return restAddress.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            throw new IllegalStateException("Shared Flink MiniCluster did not start within " + timeout
                    + "; check the startup log for the cause", e);
        } catch (ExecutionException e) {
            throw new IllegalStateException("Shared Flink MiniCluster failed to start: "
                    + e.getCause().getMessage(), e.getCause());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while waiting for the shared Flink MiniCluster", e);
        }
    }

    /** How many times a cluster start began; exposed for tests. */
    int startAttempts() {
        return startAttempts.get();
    }

    public boolean isRunning() {
        MiniCluster mc = cluster;
        return mc != null && mc.isRunning();
    }

    @Override
    public void close() throws Exception {
        MiniCluster mc;
        synchronized (this) {
            closed = true;
            mc = cluster;
            cluster = null;
        }
        if (mc != null) {
            mc.close();
            log.info("Shared MiniCluster stopped");
        }
    }
}
