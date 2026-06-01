package com.flinksqlfiddle;

import com.flinksqlfiddle.execution.ExecutionLimits;
import com.flinksqlfiddle.execution.SqlExecutionService;
import com.flinksqlfiddle.flink.FlinkProperties;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * Verifies the Quarkus application boots and that the config-mapped records bind from
 * application.properties — in particular {@link ExecutionLimits}, which is wired into
 * {@link SqlExecutionService} by the container rather than by tests.
 */
@QuarkusTest
class ApplicationContextTest {

    @Inject
    SqlExecutionService executionService;

    @Inject
    ExecutionLimits executionLimits;

    @Inject
    FlinkProperties flinkProperties;

    @Test
    void contextLoadsAndWiresBeans() {
        assertNotNull(executionService, "SqlExecutionService should be wired");
        assertNotNull(flinkProperties, "FlinkProperties should be wired");
    }

    @Test
    void executionLimitsBindFromConfiguration() {
        assertEquals(1000, executionLimits.maxRows());
        assertEquals(Duration.ofSeconds(30), executionLimits.executionTimeout());
        assertEquals(Duration.ofSeconds(15), executionLimits.collectionTimeout());
    }
}
