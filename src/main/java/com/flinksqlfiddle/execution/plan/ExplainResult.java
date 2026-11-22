package com.flinksqlfiddle.execution.plan;

import com.flinksqlfiddle.execution.ExecutionMode;

import java.util.List;

/**
 * The optimized physical plan of one statement, as a DAG.
 *
 * @param mode   the environment the statement was planned in
 * @param nodes  every operator; {@link PlanNode#inputs()} holds the edges
 * @param roots  ids of the sinks (one per INSERT of a statement set; the collect sink of a query)
 * @param advice Flink's plan advice (streaming only; the batch planner has none)
 * @param plan   the raw physical-plan section of the EXPLAIN output
 */
public record ExplainResult(
        ExecutionMode mode,
        List<PlanNode> nodes,
        List<Integer> roots,
        List<PlanAdvice> advice,
        String plan
) {
}
