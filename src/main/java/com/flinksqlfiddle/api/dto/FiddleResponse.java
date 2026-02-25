package com.flinksqlfiddle.api.dto;

import com.flinksqlfiddle.execution.ExecutionMode;

public record FiddleResponse(
        String shortCode,
        String schema,
        String query,
        ExecutionMode mode
) {
}
