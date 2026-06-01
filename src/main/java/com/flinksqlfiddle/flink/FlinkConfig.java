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
}
