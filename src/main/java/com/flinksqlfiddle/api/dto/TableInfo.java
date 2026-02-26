package com.flinksqlfiddle.api.dto;

import java.util.List;

public record TableInfo(String name, List<ColumnInfo> columns) {
}
