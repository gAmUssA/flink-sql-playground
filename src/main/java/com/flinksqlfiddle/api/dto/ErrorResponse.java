package com.flinksqlfiddle.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * An API error: {@code error} is the message (for a Flink failure, Flink's own text) and
 * {@code code} names the kind. {@code TABLE_NOT_FOUND} adds {@code table}, the missing table or
 * view, and {@code suggestion}, Flink's "did you mean" name when it has one. Absent fields are
 * left out of the JSON. See docs/adr/0007-table-not-found-error-contract.md.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ErrorResponse(String error, String code, String table, String suggestion) {

    public ErrorResponse(String error, String code) {
        this(error, code, null, null);
    }
}
