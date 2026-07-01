package com.flinksqlfiddle.execution;

import java.util.List;

public record TableInfo(String name, List<ColumnInfo> columns) {
}
