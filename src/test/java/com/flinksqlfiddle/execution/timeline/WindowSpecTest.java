package com.flinksqlfiddle.execution.timeline;

import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

/** Window strings are real Flink 2.3 plan text. */
class WindowSpecTest {

    @Test
    void windowTvfs() {
        assertEquals(Optional.of(new WindowSpec("TUMBLE", 10_000, 10_000, 0, 0)),
                WindowSpec.parse("TUMBLE(time_col=[event_time], size=[10 s])"));
        assertEquals(Optional.of(new WindowSpec("TUMBLE", 10_000, 10_000, 0, 0)),
                WindowSpec.parse("TUMBLE(slice_end=[$slice_end], size=[10 s])"));
        assertEquals(Optional.of(new WindowSpec("HOP", 15_000, 5_000, 0, 0)),
                WindowSpec.parse("HOP(time_col=[click_time], size=[15 s], slide=[5 s])"));
        assertEquals(Optional.of(new WindowSpec("CUMULATE", 10_000, 10_000, 2_000, 0)),
                WindowSpec.parse("CUMULATE(time_col=[view_time], max_size=[10 s], step=[2 s])"));
        assertEquals(Optional.of(new WindowSpec("TUMBLE", 3_600_000, 3_600_000, 0, 60_000)),
                WindowSpec.parse("TUMBLE(time_col=[ts], size=[1 h], offset=[1 min])"));
    }

    @Test
    void legacyGroupWindows() {
        assertEquals(Optional.of(new WindowSpec("TUMBLE", 10_000, 10_000, 0, 0)),
                WindowSpec.parse("TumblingGroupWindow('w$, ts, 10000)"));
        assertEquals(Optional.of(new WindowSpec("HOP", 10_000, 5_000, 0, 0)),
                WindowSpec.parse("SlidingGroupWindow(w$, rowtime, 10000, 5000)"));
    }

    @Test
    void unknownShapesHaveNoSpec() {
        assertEquals(Optional.empty(), WindowSpec.parse("SessionGroupWindow('w$, ts, 5000)"));
        assertEquals(Optional.empty(), WindowSpec.parse("SESSION(time_col=[ts], gap=[5 s])"));
        assertEquals(Optional.empty(), WindowSpec.parse("TUMBLE(time_col=[ts], size=[10 fortnights])"));
    }

    @Test
    void durations() {
        assertEquals(500L, WindowSpec.millis("500 ms"));
        assertEquals(2_000L, WindowSpec.millis("2 s"));
        assertEquals(120_000L, WindowSpec.millis("2 min"));
        assertEquals(86_400_000L, WindowSpec.millis("1 d"));
        assertNull(WindowSpec.millis("soon"));
    }
}
