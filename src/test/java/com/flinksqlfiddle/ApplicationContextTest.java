package com.flinksqlfiddle;

import com.flinksqlfiddle.execution.ExecutionLimits;
import com.flinksqlfiddle.execution.SqlExecutionService;
import com.flinksqlfiddle.flink.FlinkProperties;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * Verifies the full Spring context boots and that the {@code @ConfigurationProperties}
 * records bind from application.yaml — in particular {@link ExecutionLimits}, which is
 * wired into {@link SqlExecutionService} by the framework rather than by tests.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
class ApplicationContextTest {

    @Autowired
    private SqlExecutionService executionService;

    @Autowired
    private ExecutionLimits executionLimits;

    @Autowired
    private FlinkProperties flinkProperties;

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
