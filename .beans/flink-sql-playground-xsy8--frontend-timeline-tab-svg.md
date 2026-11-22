---
# flink-sql-playground-xsy8
title: 'Frontend: Timeline tab (SVG)'
status: completed
type: task
priority: normal
created_at: 2026-11-22T18:06:37Z
updated_at: 2026-11-22T19:46:13Z
parent: flink-sql-playground-it01
blocked_by:
    - flink-sql-playground-qena
---

- [x] Timeline tab always shown; explains no-event-time and batch (decision in ADR 0005)
- [x] Dots per record, watermark step line, window bands that close as the watermark passes
- [x] Late records in red + dropped count; legend
- [x] Live update while streaming (rAF batching like the changelog)
- [x] Theme tokens for all colours, contrast-checked; phone/landscape layouts
- [x] Stub stream + Playwright tests

## Summary of Changes

js/watermark-timeline.js (analyze + SVG render), Timeline tab in app.js (records only while the tab is in use, Record timeline button, redraw on resize). Tests: watermark-timeline.test.js (10), timeline.spec.js (10 x chromium/webkit incl. contrast in 3 themes), tab loops in mobile/results-bars specs.
