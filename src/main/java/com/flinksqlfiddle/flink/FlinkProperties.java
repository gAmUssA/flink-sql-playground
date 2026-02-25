package com.flinksqlfiddle.flink;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "flink")
public record FlinkProperties(
        int parallelism,
        String networkMemory,
        String managedMemory
) {
    public FlinkProperties {
        if (parallelism <= 0) parallelism = 1;
        if (networkMemory == null || networkMemory.isBlank()) networkMemory = "8m";
        if (managedMemory == null || managedMemory.isBlank()) managedMemory = "32m";
    }
}
