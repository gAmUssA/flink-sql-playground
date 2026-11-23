---
# flink-sql-playground-on62
title: Rate-limit embed sessions so autorun can't fill the playground
status: todo
type: task
priority: normal
tags:
    - embed
    - security
    - rate-limit
created_at: 2026-11-23T12:02:15Z
updated_at: 2026-11-23T12:07:30Z
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


## Reuse first: shared rate limiting (researched 2026-11-23)
This bean and its sibling (flink-sql-playground-weay for /explain and /execute planning, flink-sql-playground-on62 for embed sessions, #83) need the same mechanism. Build it once, in whichever bean goes first, and have the other reuse it. Do not write a hand-rolled token bucket.

- **First choice: the Quarkiverse Bucket4j extension, `io.quarkiverse.bucket4j:quarkus-bucket4j`** (1.0.7 on Maven Central).
  - It provides `@RateLimited(bucket = "...", identityResolver = ...)` on REST methods, with limits set in config.
  - It has a built-in `IpResolver` and a pluggable `IdentityResolver` interface.
  - Its `RateLimitExceptionMapper` turns a rejection into an HTTP response.
  - It runs on bucket4j 8.14 with Caffeine; the app already uses Caffeine.
  - For on62, put an IP-keyed bucket on `POST /api/sessions`. For weay, write a custom resolver that keys `/explain` and `/execute` on the `sessionId` path parameter.
  - Risk: 1.0.7 was built against Quarkus 3.15.1 and released in Sept 2025; the app is on 3.40.1. Spike first: add it, run `./gradlew build`, check that the interceptor fires and what status and body a rejection returns. If it doesn't work on 3.40, fall back to the plain `com.bucket4j:bucket4j_jdk17-core` library and the app's existing Caffeine cache in a small ContainerRequestFilter, which needs no extension.
- **Not enough on its own: SmallRye Fault Tolerance `@RateLimit`** (`quarkus-smallrye-fault-tolerance`, in the Quarkus BOM). It keeps one shared counter per method, so it cannot limit each client or session separately. It is fine as a global backstop (for example, N new sessions per minute in total), and `@Bulkhead` caps concurrency.
- **Prerequisite for any per-IP limit:** behind Railway's proxy, the remote address is the proxy's. Set `quarkus.http.proxy.proxy-address-forwarding=true` (plus `allow-x-forwarded` or `enable-forwarded-host`, and `trusted-proxies` if possible), or every visitor shares one bucket. Today `application.properties` has no proxy settings.
- Record the decision (extension or library, limits, response) in an ADR. Have the embed show a 429 as "busy, click Run to retry".
