package com.flinksqlfiddle.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * An API error: {@code error} is the message (for a Flink failure, Flink's own text) and
 * {@code code} names the kind. {@code TABLE_NOT_FOUND} adds {@code table}, the missing table or
 * view, {@code path}, its name parts ending with {@code table}, and {@code suggestion}, Flink's
 * "did you mean" name when it has one. {@code OBJECT_NOT_FOUND} (a DROP of a missing table or view, or
 * of the other kind) carries only {@code error}: Flink's text, with a "Use DROP VIEW" or "Use DROP
 * TABLE" hint after it when the object is of the other kind. Absent fields are left out of the JSON.
 * {@code RATE_LIMITED} (HTTP 429, a client used up its rate-limit bucket) carries only {@code error}, and the
 * response has a {@code Retry-After} header in whole seconds, at least 1. {@code SESSION_LIMIT_EXCEEDED} (also 429)
 * has the same shape. See docs/adr/0007-table-not-found-error-contract.md and docs/adr/0010-shared-rate-limit.md.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ErrorResponse(String error, String code, String table, List<String> path, String suggestion) {

    public ErrorResponse(String error, String code) {
        this(error, code, null, null, null);
    }
}
