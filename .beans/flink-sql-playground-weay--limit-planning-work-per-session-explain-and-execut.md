---
# flink-sql-playground-weay
title: Limit planning work per session (/explain and /execute)
status: todo
type: task
priority: low
tags:
    - rate-limit
created_at: 2026-11-22T18:34:18Z
updated_at: 2026-11-23T12:07:30Z
---

From the adversarial review of ip4e (Copilot, 2026-11-22).

Both /execute and /explain plan on the session's single planner thread with no timeout, and a Calcite plan can't be interrupted. /explain takes no MiniCluster slot, so a client can call it in a tight loop or with a deeply nested query and keep that session's planner busy. The impact stays inside that session (one planner thread per session), but it costs server CPU.

- [ ] Per-session rate limit on /explain (and /execute planning), e.g. a token bucket in SessionManager
- [ ] Cap statement complexity cheaply before planning (nesting depth / join count), or a planner time budget that fails the session's next request
- [ ] 429 with a clear code; frontend shows it in the Graph tab
- [ ] Note in ADR 0004


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
