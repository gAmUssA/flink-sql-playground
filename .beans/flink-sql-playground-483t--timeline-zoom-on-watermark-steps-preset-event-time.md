---
# flink-sql-playground-483t
title: Timeline zoom on watermark steps + preset event-time audit
status: completed
type: feature
priority: normal
created_at: 2026-11-22T21:18:15Z
updated_at: 2026-11-22T22:05:13Z
parent: flink-sql-playground-e6yy
---

Requested 2026-11-22 after the timeline shipped.

- [x] Zoom the timeline (drag, buttons, pinch) and label each watermark advance with its jump
- [x] Audit every preset's WATERMARK syntax and semantics (flink-sql skill + timeline probe measurements)
- [x] Fix findings: PROCTIME columns named like event time; Brewmaster grouped by window bounds after a join (not a window aggregation)
- [x] Contract: preset-watermarks.json, static test, probe-based smoke test (ADR 0006)
- [x] Adversarial review by Copilot with the flink-sql skill (21 findings: 20 fixed, 1 deferred to flink-sql-playground-nhqw)
- [x] Ship (PR #79)

## Summary of Changes

Timeline zoom (drag/buttons/pinch, watermark-step markers and jump labels, ms axis, advances stat). Preset audit with the flink-sql skill and the timeline probe: PROCTIME naming, Brewmaster aggregate-then-join, versioned-view temporal LEFT JOIN, interval join on order_id, paced Late Data. Contract in ADR 0006 (preset-watermarks.json + static test + PresetWatermarkSmokeTest). Mid-stream job failures now reported. Autocomplete reads CREATE VIEW. Copilot review: 21 findings, 20 fixed, 1 deferred (flink-sql-playground-nhqw).
