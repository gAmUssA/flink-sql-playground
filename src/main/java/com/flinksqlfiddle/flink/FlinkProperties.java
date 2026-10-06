package com.flinksqlfiddle.flink;

import java.time.Duration;

/**
 * Plain domain record holding the effective Flink settings. Bound from
 * configuration via {@link FlinkConfig} + {@code AppConfig}; directly
 * instantiable in tests.
 */
public record FlinkProperties(
        int parallelism,
        String networkMemory,
        String managedMemory,
        int maxSessions,
        Duration sessionIdleTimeout,
        boolean sharedCluster,
        int clusterSlots,
        String clusterNetworkMemory,
        Duration clusterStartTimeout
) {
    private static final Duration DEFAULT_SESSION_IDLE_TIMEOUT = Duration.ofMinutes(15);
    private static final Duration DEFAULT_CLUSTER_START_TIMEOUT = Duration.ofSeconds(60);

    public FlinkProperties {
        if (parallelism <= 0) parallelism = 1;
        if (networkMemory == null || networkMemory.isBlank()) networkMemory = "8m";
        if (managedMemory == null || managedMemory.isBlank()) managedMemory = "32m";
        if (maxSessions <= 0) maxSessions = 3;
        if (sessionIdleTimeout == null || sessionIdleTimeout.isZero()) sessionIdleTimeout = DEFAULT_SESSION_IDLE_TIMEOUT;
        // Each session keeps a BATCH and a STREAMING environment, so two concurrent jobs per session.
        if (clusterSlots <= 0) clusterSlots = maxSessions * 2;
        if (clusterNetworkMemory == null || clusterNetworkMemory.isBlank()) clusterNetworkMemory = "64m";
        if (clusterStartTimeout == null || clusterStartTimeout.isZero()) clusterStartTimeout = DEFAULT_CLUSTER_START_TIMEOUT;
    }

    /** Per-job MiniCluster settings (no shared cluster); used by unit tests. */
    public FlinkProperties(int parallelism, String networkMemory, String managedMemory,
                           int maxSessions, Duration sessionIdleTimeout) {
        this(parallelism, networkMemory, managedMemory, maxSessions, sessionIdleTimeout,
                false, 0, null, null);
    }
}
