---
# flink-sql-playground-ztp2
title: 'Lighthouse embed check flaps: median of 3 runs and a separate embed threshold'
status: completed
type: bug
priority: high
created_at: 2026-11-24T10:12:47Z
updated_at: 2026-11-24T10:13:03Z
---

Issue #87. `embed.html` mobile Lighthouse performance scores 81-87 on runs that touch nothing, against a threshold of 85, and fails the `e2e` check on unrelated PRs (seen on #86 and #90). `index.html` stays at 92.

Median of 3 alone does not fix it: the embed scores mostly sit near 82, so there is a real gap of a few points besides the noise.

- [x] `scripts/lighthouse-check.js`: run Lighthouse 3 times per URL and score each category on the median. Keep the one-line JSON output and exit codes; report the three runs in the JSON.
- [x] `.github/workflows/frontend-e2e.yml`: the embed check uses performance=80; the index check stays at 85, accessibility 95 and transfer-kb 400 for both.
- [x] AGENTS.md Lighthouse line: say the embed threshold is 80 and why.
- [x] A node test for the median logic if it can live in a pure function (`jsTest`).
- [x] Follow-up bean: trim what embed mode loads, then raise the threshold back to 85.

Touches CI and `scripts/`, so the factory stops at needs-human for this one.

## Resolution

`lighthouse-check.js` runs Lighthouse 3 times per URL, one after the other, each in a fresh Chrome, and scores the median of each category and of the transfer size. The JSON keeps its keys and gains `runs`. The embed check in CI uses `performance=80`; follow-up bean flink-sql-playground-ztp3 trims embed mode and raises it back to 85.
