---
# flink-sql-playground-ztp3
title: 'Trim what embed mode loads, then raise the embed Lighthouse threshold back to 85'
status: todo
type: task
priority: normal
created_at: 2026-11-24T10:30:00Z
updated_at: 2026-11-24T10:30:00Z
---

Follow-up to flink-sql-playground-ztp2 (issue #87). `embed.html` mobile Lighthouse performance sits near 82, a few points under `index.html` (92), so CI checks it at `performance=80` for now.

- [ ] Find out what embed mode loads on first paint that it does not need before a Run (editor bundle size, tour, tweaks, fonts, scripts); load it lazily or drop it. Keep the embed rules in AGENTS.md (no API call before a Run, works without the topbar and sidebar).
- [ ] Measure with `node scripts/lighthouse-check.js http://127.0.0.1:8790/embed.html accessibility=95 performance=85 transfer-kb=400` and read the three runs in the JSON `runs` key.
- [ ] `.github/workflows/frontend-e2e.yml`: raise the embed check to `performance=85`.
- [ ] AGENTS.md Lighthouse line: remove the note about the lower embed threshold.
