---
# flink-sql-playground-483t
title: Timeline zoom on watermark steps + preset event-time audit
status: in-progress
type: feature
created_at: 2026-11-22T21:18:15Z
updated_at: 2026-11-22T21:18:15Z
parent: flink-sql-playground-e6yy
---

Requested 2026-11-22 after the timeline shipped.

- [x] Zoom the timeline (drag, buttons, pinch) and label each watermark advance with its jump
- [x] Audit every preset's WATERMARK syntax and semantics (flink-sql skill + timeline probe measurements)
- [x] Fix findings: PROCTIME columns named like event time; Brewmaster grouped by window bounds after a join (not a window aggregation)
- [x] Contract: preset-watermarks.json, static test, probe-based smoke test (ADR 0006)
- [ ] Adversarial review by Copilot with the flink-sql skill
- [ ] Ship
