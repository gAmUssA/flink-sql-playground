---
# flink-sql-playground-har4
title: Embed mode for shared fiddles
status: completed
type: feature
priority: normal
created_at: 2026-11-22T18:06:37Z
updated_at: 2026-11-23T00:30:00Z
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

## Summary of Changes

- New `/embed.html` page: compact iframe with editor, Run, four result tabs, schema toggle and an Open-in-playground link. Params `autorun=1` and `tab=`. No session or API call until the first Run; cold start shows a waking message and retries.
- Framing decision (ADR 0008): `X-Frame-Options: DENY` and `frame-ancestors 'none'` stay everywhere except the exact path `/embed.html`, where `EmbedFraming` allows `app.embed.frame-ancestors` (default `*`, env `EMBED_FRAME_ANCESTORS`).
- Share menu gets "Copy embed code". README, DEPLOY.md, ARCHITECTURE.md and AGENTS.md updated; Lighthouse runs on the embed URL in CI.
- Tests: SecurityHeadersTest and StaticCacheHeadersTest extended, new JS unit tests, new Playwright embed projects.
- Copilot review: 7 findings, all fixed in df54fdf. Bob second opinion skipped (no API key, read-only unconfirmed).
