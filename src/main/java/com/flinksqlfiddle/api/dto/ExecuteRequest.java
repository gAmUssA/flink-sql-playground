package com.flinksqlfiddle.api.dto;

import com.flinksqlfiddle.execution.ExecutionMode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record ExecuteRequest(
        @NotBlank String sql,
        @NotNull ExecutionMode mode
) {
}
