package com.flinksqlfiddle.execution;

import io.smallrye.config.ConfigMapping;
import io.smallrye.config.WithDefault;

import java.time.Duration;

/**
 * Binds the {@code execution.*} configuration prefix. Mapped into the plain
 * {@link ExecutionLimits} domain record by {@code AppConfig}.
 */
@ConfigMapping(prefix = "execution")
public interface ExecutionConfig {

    @WithDefault("1000")
    int maxRows();

    @WithDefault("30s")
    Duration executionTimeout();

    @WithDefault("15s")
    Duration collectionTimeout();

    @WithDefault("3m")
    Duration streamTimeout();
}
