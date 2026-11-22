package com.flinksqlfiddle.execution.plan;

/**
 * One entry of Flink's {@code PLAN_ADVICE} output.
 *
 * @param id    the advice number the plan refers to ({@code advice=[1]})
 * @param level {@code ADVICE} or {@code WARNING}
 * @param text  the advice text
 */
public record PlanAdvice(int id, String level, String text) {
}
