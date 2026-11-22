---
# flink-sql-playground-it01
title: Watermark timeline
status: completed
type: feature
priority: normal
created_at: 2026-11-22T18:06:36Z
updated_at: 2026-11-22T19:54:10Z
parent: flink-sql-playground-e6yy
blocked_by:
    - flink-sql-playground-ip4e
---

## Problem
Watermarks are the #1 thing people get wrong in Flink SQL. The presets "Late Data & the Watermark Dial" and the temporal join explain them in SQL comments, but nothing in the UI shows event time, the watermark, or which records were dropped as late.

## Goal
A Timeline view for queries over a table with a WATERMARK:
- x axis = processing (arrival) order/time, y axis = event time (or the reverse; pick the clearer one)
- each record a dot; the watermark as a rising step line
- window boundaries (TUMBLE/HOP/CUMULATE) drawn as bands; a band closes and its result row appears when the watermark crosses its end
- records that arrive behind the watermark marked late/dropped in red, with a count ("62 of 500 dropped")

The "Watermark Dial" preset should make the loss obvious at a glance: tight 5s watermark = red dots, 15s = none.

## Notes
- Data source: `CURRENT_WATERMARK(rowtime)` per record. Options: (a) backend runs a sidecar query over the source table selecting the rowtime column + CURRENT_WATERMARK; (b) rewrite the user query. Prefer (a): don't mutate user SQL.
- Needs the rowtime column and window spec: reuse the EXPLAIN plan from the job-graph feature (WatermarkAssigner, WindowAggregate window spec) instead of regexing SQL.
- Sidecar must respect ExecutionLimits (rows, time) and the shared MiniCluster slot budget.
- Only shown when the plan has a watermark; otherwise the tab is hidden.

## Summary of Changes

Timeline tab backed by a CURRENT_WATERMARK probe job (TimelineService, POST /timeline/stream) over the query's first watermarked source, windows read from the plan; js/watermark-timeline.js classifies records as Flink windows do (fired when wm >= end - 1). New canonical preset "Watermark Timeline: who misses the window". Decisions in docs/adr/0005-watermark-timeline-probe.md. Adversarial review by Copilot (herdr): all six findings fixed (pre-stream probe cancel, stop on tab leave / batch switch, window-count cap, negative offsets, real mid-run test).
