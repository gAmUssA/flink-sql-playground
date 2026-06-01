package com.flinksqlfiddle;

import com.flinksqlfiddle.flink.FlinkProperties;
import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Logs the effective Flink configuration once the application has started — the
 * Quarkus equivalent of the former {@code @EventListener(ApplicationReadyEvent.class)}.
 */
@ApplicationScoped
public class StartupLogger {

    private static final Logger log = LoggerFactory.getLogger(StartupLogger.class);

    private final FlinkProperties flinkProperties;

    public StartupLogger(FlinkProperties flinkProperties) {
        this.flinkProperties = flinkProperties;
    }

    void onStart(@Observes StartupEvent event) {
        log.info("Flink SQL Fiddle started [parallelism={}, network={}, managed={}, sessionIdleTimeout={}]",
                flinkProperties.parallelism(),
                flinkProperties.networkMemory(),
                flinkProperties.managedMemory(),
                flinkProperties.sessionIdleTimeout().toMinutes() + " min");
    }
}
