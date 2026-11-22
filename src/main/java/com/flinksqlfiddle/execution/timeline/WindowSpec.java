package com.flinksqlfiddle.execution.timeline;

import com.flinksqlfiddle.execution.plan.ExplainResult;
import com.flinksqlfiddle.execution.plan.PlanNode;

import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The event-time windows a query aggregates over, read from its plan, so the timeline can draw
 * them and tell which records arrived after their window fired.
 *
 * @param kind     {@code TUMBLE}, {@code HOP} or {@code CUMULATE}
 * @param sizeMs   window length (CUMULATE: the max size)
 * @param slideMs  HOP: distance between window starts; else equal to {@code sizeMs}
 * @param stepMs   CUMULATE: how much each window grows; else 0
 * @param offsetMs window alignment offset (0 unless the query sets one)
 */
public record WindowSpec(String kind, long sizeMs, long slideMs, long stepMs, long offsetMs) {

    // Window TVF operators print e.g. TUMBLE(time_col=[ts], size=[10 s]) or
    // HOP(slice_end=[$slice_end], size=[15 s], slide=[5 s]) or CUMULATE(..., max_size=[1 min], step=[10 s]).
    private static final Pattern TVF = Pattern.compile("^(TUMBLE|HOP|CUMULATE)\\((.*)\\)$");
    // Legacy GROUP BY TUMBLE(...) prints TumblingGroupWindow('w$, ts, 10000) (sizes in ms).
    private static final Pattern LEGACY = Pattern.compile(
            "^(TumblingGroupWindow|SlidingGroupWindow)\\('?w\\d*\\$, [^,]+, (\\d+)(?:, (\\d+))?\\)$");
    private static final Pattern DURATION = Pattern.compile("^(\\d+)\\s*(ms|s|min|h|d)$");

    /** The first window spec in the plan (window aggregate, join, rank, dedup or TVF), if any. */
    public static Optional<WindowSpec> fromPlan(ExplainResult plan) {
        for (PlanNode node : plan.nodes()) {
            String window = node.attrs().get("window");
            if (window != null) {
                Optional<WindowSpec> spec = parse(window);
                if (spec.isPresent()) {
                    return spec;
                }
            }
        }
        return Optional.empty();
    }

    static Optional<WindowSpec> parse(String window) {
        String text = window.trim();
        Matcher legacy = LEGACY.matcher(text);
        if (legacy.matches()) {
            long size = Long.parseLong(legacy.group(2));
            long slide = legacy.group(3) != null ? Long.parseLong(legacy.group(3)) : size;
            return Optional.of(new WindowSpec(slide == size ? "TUMBLE" : "HOP", size, slide, 0, 0));
        }
        Matcher tvf = TVF.matcher(text);
        if (!tvf.matches()) {
            return Optional.empty(); // SESSION windows and unknown shapes have no fixed bounds
        }
        String kind = tvf.group(1);
        var attrs = com.flinksqlfiddle.execution.plan.PlanParser.parseAttrs(tvf.group(2));
        if (attrs == null) {
            return Optional.empty();
        }
        Long offset = attrs.containsKey("offset") ? millis(attrs.get("offset")) : Long.valueOf(0);
        if (offset == null) {
            return Optional.empty();
        }
        return switch (kind) {
            case "TUMBLE" -> Optional.ofNullable(millis(attrs.get("size")))
                    .map(size -> new WindowSpec(kind, size, size, 0, offset));
            case "HOP" -> {
                Long size = millis(attrs.get("size"));
                Long slide = millis(attrs.get("slide"));
                yield size == null || slide == null ? Optional.empty()
                        : Optional.of(new WindowSpec(kind, size, slide, 0, offset));
            }
            default -> {
                Long max = millis(attrs.get("max_size"));
                Long step = millis(attrs.get("step"));
                yield max == null || step == null ? Optional.empty()
                        : Optional.of(new WindowSpec(kind, max, max, step, offset));
            }
        };
    }

    /** {@code "10 s"}, {@code "1 min"}, {@code "500 ms"} → milliseconds; null if unreadable. */
    static Long millis(String text) {
        if (text == null) {
            return null;
        }
        Matcher m = DURATION.matcher(text.trim());
        if (!m.matches()) {
            return null;
        }
        long n = Long.parseLong(m.group(1));
        return switch (m.group(2)) {
            case "ms" -> n;
            case "s" -> n * 1_000;
            case "min" -> n * 60_000;
            case "h" -> n * 3_600_000;
            default -> n * 86_400_000;
        };
    }
}
