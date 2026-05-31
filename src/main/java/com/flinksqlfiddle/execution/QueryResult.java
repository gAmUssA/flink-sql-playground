package com.flinksqlfiddle.execution;

import java.util.List;

public record QueryResult(
        List<String> columnNames,
        List<String> columnTypes,
        List<List<Object>> rows,
        List<String> rowKinds,
        long executionTimeMs,
        boolean truncated
) {
    /** Derived from {@link #rows()}; not a stored component. */
    public int rowCount() {
        return rows.size();
    }
}
