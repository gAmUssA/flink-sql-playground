---
# flink-sql-playground-9bqj
title: Embed layout + Share-menu embed snippet
status: completed
type: task
priority: normal
created_at: 2026-11-22T18:06:37Z
updated_at: 2026-11-23T00:30:00Z
parent: flink-sql-playground-har4
---

- [x] `?embed=1` layout: editor + Run + results, schema toggle, no chrome/tour
- [x] "Open in playground" link with the same fragment
- [x] `autorun` and `tab` params
- [x] Lazy session creation on first Run; cold-start message
- [x] Verify framing headers on Railway + Pages (frame-ancestors / X-Frame-Options)
- [x] "Copy embed code" in Share menu
- [x] Playwright: embed in an iframe at 400x500 and 800x600; Lighthouse on the embed URL
- [x] README: how to embed

## Summary of Changes

Embed layout (`css/embed.css`, `embed.html`), the Share menu with "Copy embed code" (`EmbedParams.iframeSnippet`), and the 44 px touch targets are done and tested. See the parent bean flink-sql-playground-har4 and ADR 0008.
