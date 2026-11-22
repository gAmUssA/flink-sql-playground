package com.flinksqlfiddle.execution.plan;

import java.util.List;
import java.util.Map;

/**
 * One operator of an optimized physical plan.
 *
 * @param id            position in {@link ExplainResult#nodes()}; stable only within one result
 * @param kind          the planner's operator name, e.g. {@code GroupAggregate}, {@code Exchange}
 * @param label         display name: {@code Source: orders}, {@code Sink: collect}, or {@code kind}
 * @param attrs         the operator's attributes as printed by EXPLAIN (minus changelogMode and advice)
 * @param changelogMode the row kinds this operator emits ({@code I}, {@code UB}, {@code UA}, {@code D});
 *                      empty for a sink, {@code null} when the plan carries no changelog modes (batch)
 * @param state         {@code "unbounded"} when the operator keeps state that grows with the key
 *                      space, {@code "time-bounded"} when the watermark frees it, {@code "pattern"}
 *                      for MATCH_RECOGNIZE (bounded only by WITHIN, which the plan does not show),
 *                      else {@code null}
 * @param advice        ids of {@link PlanAdvice} entries attached to this operator
 * @param inputs        ids of the operators feeding this one, in plan order (left input first)
 */
public record PlanNode(
        int id,
        String kind,
        String label,
        Map<String, String> attrs,
        List<String> changelogMode,
        String state,
        List<Integer> advice,
        List<Integer> inputs
) {
}
