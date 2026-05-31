package com.flinksqlfiddle.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * A single NDJSON frame in a streaming query response. One record type carries all
 * frame shapes; unused fields are omitted via {@link JsonInclude}. The {@code type}
 * discriminator tells the client how to interpret each line:
 *
 * <ul>
 *   <li>{@code schema} — column names and types (sent once, first)</li>
 *   <li>{@code row}    — one result row ({@code kind} = changelog op, {@code values})</li>
 *   <li>{@code end}    — terminal summary ({@code rowCount}, {@code truncated}, {@code executionTimeMs})</li>
 *   <li>{@code error}  — terminal error ({@code error} message, {@code code})</li>
 * </ul>
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record StreamEvent(
        String type,
        List<String> columns,
        List<String> columnTypes,
        String kind,
        List<Object> values,
        Integer rowCount,
        Boolean truncated,
        Long executionTimeMs,
        String error,
        String code
) {
    public static StreamEvent schema(List<String> columns, List<String> columnTypes) {
        return new StreamEvent("schema", columns, columnTypes, null, null, null, null, null, null, null);
    }

    public static StreamEvent row(String kind, List<Object> values) {
        return new StreamEvent("row", null, null, kind, values, null, null, null, null, null);
    }

    public static StreamEvent end(int rowCount, boolean truncated, long executionTimeMs) {
        return new StreamEvent("end", null, null, null, null, rowCount, truncated, executionTimeMs, null, null);
    }

    public static StreamEvent error(String error, String code) {
        return new StreamEvent("error", null, null, null, null, null, null, null, error, code);
    }
}
