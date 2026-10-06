package com.flinksqlfiddle.flink;

import io.smallrye.config.ConfigMapping;
import io.smallrye.config.WithDefault;

import java.time.Duration;

/**
 * Binds the {@code flink.*} configuration prefix. Mapped into the plain
 * {@link FlinkProperties} domain record by {@code AppConfig} so the rest of the
 * code keeps using the record (and tests can still instantiate it directly).
 */
@ConfigMapping(prefix = "flink")
public interface FlinkConfig {

    @WithDefault("1")
    int parallelism();

    @WithDefault("8m")
    String networkMemory();

    @WithDefault("32m")
    String managedMemory();

    @WithDefault("3")
    int maxSessions();

    @WithDefault("15m")
    Duration sessionIdleTimeout();

    /** Submit every query to one long-lived MiniCluster instead of one per job. */
    @WithDefault("true")
    boolean sharedCluster();

    /** Task slots in the shared cluster; 0 means two per session (BATCH + STREAMING). */
    @WithDefault("0")
    int clusterSlots();

    /** Network buffer memory for the shared cluster, allocated when it starts. */
    @WithDefault("64m")
    String clusterNetworkMemory();

    @WithDefault("60s")
    Duration clusterStartTimeout();
}
