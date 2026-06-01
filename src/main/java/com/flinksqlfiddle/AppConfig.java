package com.flinksqlfiddle;

import com.flinksqlfiddle.execution.ExecutionConfig;
import com.flinksqlfiddle.execution.ExecutionLimits;
import com.flinksqlfiddle.flink.FlinkConfig;
import com.flinksqlfiddle.flink.FlinkProperties;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Singleton;

/**
 * Maps the {@code @ConfigMapping} interfaces into the plain domain records the
 * application uses ({@link FlinkProperties}, {@link ExecutionLimits}). Keeping the
 * records as the injected types means consumers and unit tests are unchanged — only
 * the binding mechanism moved from Spring's {@code @ConfigurationProperties} to
 * SmallRye Config.
 */
@ApplicationScoped
public class AppConfig {

    @Produces
    @Singleton
    public FlinkProperties flinkProperties(FlinkConfig config) {
        return new FlinkProperties(
                config.parallelism(),
                config.networkMemory(),
                config.managedMemory(),
                config.maxSessions(),
                config.sessionIdleTimeout());
    }

    @Produces
    @Singleton
    public ExecutionLimits executionLimits(ExecutionConfig config) {
        return new ExecutionLimits(
                config.maxRows(),
                config.executionTimeout(),
                config.collectionTimeout(),
                config.streamTimeout());
    }
}
