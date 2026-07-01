package com.flinksqlfiddle.api.dto;

import com.flinksqlfiddle.execution.ExecutionMode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ExecuteRequest(
        // Bound the payload so a single request can't submit an unreasonably large script.
        // 50k chars comfortably fits any realistic playground query.
        @NotBlank @Size(max = 50_000, message = "must be at most 50000 characters") String sql,
        @NotNull ExecutionMode mode
) {
}
