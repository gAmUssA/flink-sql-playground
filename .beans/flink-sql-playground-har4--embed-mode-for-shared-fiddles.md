---
# flink-sql-playground-har4
title: Embed mode for shared fiddles
status: todo
type: feature
created_at: 2026-11-22T18:06:37Z
updated_at: 2026-11-22T18:06:37Z
parent: flink-sql-playground-e6yy
---

## Problem
Blog posts, docs and workshop slides show Flink SQL as screenshots or static code. Share links already exist and are self-contained (`#f=v1.<deflated JSON>` in fiddle-link.js; nothing hits the server), so a runnable embed is one layout away.

## Goal
`?embed=1` (or `/embed#f=...`) renders a compact view sized for an iframe:
- query editor + Run + results (table/changelog tabs), schema collapsed behind a toggle
- no sidebar, header or onboarding tour
- "Open in playground" link carrying the same fragment
- optional `&autorun=1` and `&tab=changelog`
- a "Copy embed code" item in the Share menu that produces the `<iframe>` snippet

## Notes
- Backend cold start: show a clear "waking up the Flink cluster…" state; embeds on a blog will often be the first request.
- CSP/frame-ancestors: make sure the app and Pages allow framing (check headers on Railway and Pages).
- Session cost: a page with 5 embeds must not create 5 sessions on load; create the session on first Run.
- Lighthouse budget applies to the embed page too.
