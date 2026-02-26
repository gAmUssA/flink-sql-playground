package com.flinksqlfiddle.flink;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties(prefix = "flink")
public record FlinkProperties(
        int parallelism,
        String networkMemory,
        String managedMemory,
        int maxSessions,
        Duration sessionIdleTimeout
) {
    private static final Duration DEFAULT_SESSION_IDLE_TIMEOUT = Duration.ofMinutes(15);

    public FlinkProperties {
        if (parallelism <= 0) parallelism = 1;
        if (networkMemory == null || networkMemory.isBlank()) networkMemory = "8m";
        if (managedMemory == null || managedMemory.isBlank()) managedMemory = "32m";
        if (maxSessions <= 0) maxSessions = 3;
        if (sessionIdleTimeout == null || sessionIdleTimeout.isZero()) sessionIdleTimeout = DEFAULT_SESSION_IDLE_TIMEOUT;
    }
}
