package com.flinksqlfiddle.execution;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class RootCauseMessageTest {

    @Test
    void reportsTheInnermostCauseWithItsType() {
        Throwable chain = new RuntimeException("Failed to fetch next result",
                new java.io.IOException("Failed to fetch job execution result",
                        new NumberFormatException("For input string: \"1x\"")));
        assertEquals("NumberFormatException: For input string: \"1x\"", SqlExecutionService.rootCauseMessage(chain));
    }

    @Test
    void reportsTheTypeAloneWhenTheCauseHasNoMessage() {
        Throwable chain = new RuntimeException("outer", new java.util.concurrent.TimeoutException());
        assertEquals("TimeoutException", SqlExecutionService.rootCauseMessage(chain));
    }

    @Test
    void reportsATopLevelExceptionWithoutCauses() {
        assertEquals("IllegalStateException: boom", SqlExecutionService.rootCauseMessage(new IllegalStateException("boom")));
    }
}
