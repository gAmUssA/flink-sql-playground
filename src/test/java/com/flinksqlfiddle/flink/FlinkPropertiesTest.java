package com.flinksqlfiddle.flink;

import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertEquals;

class FlinkPropertiesTest {

    @Test
    void sessionIdleTimeoutDefaultsTo15MinutesWhenNull() {
        var props = new FlinkProperties(1, "8m", "32m", 3, null);
        assertEquals(Duration.ofMinutes(15), props.sessionIdleTimeout());
    }

    @Test
    void sessionIdleTimeoutDefaultsTo15MinutesWhenZero() {
        var props = new FlinkProperties(1, "8m", "32m", 3, Duration.ZERO);
        assertEquals(Duration.ofMinutes(15), props.sessionIdleTimeout());
    }

    @Test
    void sessionIdleTimeoutUsesProvidedValue() {
        var props = new FlinkProperties(1, "8m", "32m", 3, Duration.ofMinutes(30));
        assertEquals(Duration.ofMinutes(30), props.sessionIdleTimeout());
    }
}
