package com.flinksqlfiddle.api.dto;

import com.flinksqlfiddle.execution.QueryResult;

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
    public static ExecuteResponse from(QueryResult result) {
        return new ExecuteResponse(
                result.columnNames(),
                result.columnTypes(),
                result.rows(),
                result.rowKinds(),
                result.rowCount(),
                result.executionTimeMs(),
                result.truncated()
        );
    }
}
