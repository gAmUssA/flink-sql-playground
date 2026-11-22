package com.flinksqlfiddle.api.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.flinksqlfiddle.execution.timeline.TimelineService.TimelineMeta;

/**
 * One NDJSON frame of a timeline stream:
 *
 * <ul>
 *   <li>{@code meta}  — sent first: the probed {@code table}, its {@code rowtime} column, the
 *       {@code watermark} expression and the query's {@code window} (null without windows)</li>
 *   <li>{@code tick}  — one record: event time {@code t} and the watermark {@code wm} when it was
 *       processed (null before the first watermark), both epoch milliseconds of wall-clock time</li>
 *   <li>{@code end}   — the probe finished ({@code count}, {@code truncated})</li>
 *   <li>{@code error} — the probe failed ({@code error})</li>
 * </ul>
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record TimelineEvent(
        String type,
        TimelineMeta meta,
        Long t,
        Long wm,
        Integer count,
        Boolean truncated,
        String error
) {
    public static TimelineEvent meta(TimelineMeta meta) {
        return new TimelineEvent("meta", meta, null, null, null, null, null);
    }

    public static TimelineEvent tick(long t, Long wm) {
        return new TimelineEvent("tick", null, t, wm, null, null, null);
    }

    public static TimelineEvent end(int count, boolean truncated) {
        return new TimelineEvent("end", null, null, null, count, truncated, null);
    }

    public static TimelineEvent error(String error) {
        return new TimelineEvent("error", null, null, null, null, null, error);
    }
}
