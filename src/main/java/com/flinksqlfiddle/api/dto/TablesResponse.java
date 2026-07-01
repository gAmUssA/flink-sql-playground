package com.flinksqlfiddle.api.dto;

import com.flinksqlfiddle.execution.TableInfo;

import java.util.List;

public record TablesResponse(List<TableInfo> tables) {
}
