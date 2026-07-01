package com.flinksqlfiddle.api.dto;

import com.flinksqlfiddle.execution.ExecutionMode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record SaveFiddleRequest(
        // Cap persisted fiddle size so shareable links can't be used to fill storage.
        @NotBlank @Size(max = 50_000, message = "must be at most 50000 characters") String schema,
        @NotBlank @Size(max = 50_000, message = "must be at most 50000 characters") String query,
        @NotNull ExecutionMode mode
) {
}
