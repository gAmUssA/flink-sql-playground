package com.flinksqlfiddle.execution;

import java.util.List;

public class QueryResult {

  private final List<String> columnNames;
  private final List<String> columnTypes;
  private final List<List<Object>> rows;
  private final List<String> rowKinds;
  private final int rowCount;
  private final long executionTimeMs;
  private final boolean truncated;

  public QueryResult(List<String> columnNames, List<String> columnTypes,
                     List<List<Object>> rows, List<String> rowKinds,
                     long executionTimeMs, boolean truncated) {
    this.columnNames = columnNames;
    this.columnTypes = columnTypes;
    this.rows = rows;
    this.rowKinds = rowKinds;
    this.rowCount = rows.size();
    this.executionTimeMs = executionTimeMs;
    this.truncated = truncated;
  }

  public List<String> getColumnNames() {
    return columnNames;
  }

  public List<String> getColumnTypes() {
    return columnTypes;
  }

  public List<List<Object>> getRows() {
    return rows;
  }

  public List<String> getRowKinds() {
    return rowKinds;
  }

  public int getRowCount() {
    return rowCount;
  }

  public long getExecutionTimeMs() {
    return executionTimeMs;
  }

  public boolean isTruncated() {
    return truncated;
  }
}
