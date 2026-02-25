package com.flinksqlfiddle.api.dto;

import java.util.List;

public record ExecuteResponse(
        List<String> columns,
        List<String> columnTypes,
        List<List<Object>> rows,
        List<String> rowKinds,
        int rowCount,
        long executionTimeMs,
        boolean truncated
) {
}
