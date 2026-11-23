---
# flink-sql-playground-on62
title: Rate-limit embed sessions so autorun can't fill the playground
status: todo
type: task
priority: normal
tags:
    - embed
    - security
created_at: 2026-11-23T12:02:15Z
updated_at: 2026-11-23T12:02:15Z
---

GitHub issue: #83. Follow-up from har4 (embed mode, PR #82), accepted as a known risk when it merged on 2026-11-23.

`embed.html?autorun=1` starts a backend session when the frame becomes visible. Any site can frame the embed and open one session per visitor, but the server allows only `flink.max-sessions=8` at once. A popular page could fill every slot, demos included.

- The visibility gate is best effort: at least 200x120, plus IntersectionObserver v2 in Chromium. A hostile host page can satisfy it, and outside Chromium a transparent frame passes.
- `EMBED_FRAME_ANCESTORS` does not close the gap. It applies only to the copy Railway serves. GitHub Pages sends no framing headers, so any site can frame the Pages copy, which calls the Railway backend.

Ops escape hatch until this is done: lower `flink.max-sessions`, or take `embed.html` out of the deploy.

## Todo
- [ ] Server-side session rate limit per client (IP), with a "busy, click Run to retry" answer the embed can show
- [ ] Decide on autorun: keep it behind the limit, allow it only for allowlisted parent origins (`location.ancestorOrigins`, no Firefox support), or drop it
- [ ] Client timeout for the schema build request (the session request already has one)
- [ ] ADR 0008: say that EMBED_FRAME_ANCESTORS covers only the Railway-served copy, and record the limit
- [ ] Tests: a burst of autorun embeds cannot take every session
