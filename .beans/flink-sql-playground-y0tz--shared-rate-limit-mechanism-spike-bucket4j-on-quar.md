---
# flink-sql-playground-y0tz
title: 'Shared rate-limit mechanism: spike Bucket4j on Quarkus 3.40, proxy settings, 429 contract, ADR'
status: completed
type: task
priority: normal
tags:
    - rate-limit
created_at: 2026-11-24T22:23:43Z
updated_at: 2026-11-24T22:27:25Z
parent: flink-sql-playground-0nc9
---

First child of the rate-limiting epic. Spike io.quarkiverse.bucket4j:quarkus-bucket4j 1.0.7 on Quarkus 3.40 (it was built for 3.15.1): does the interceptor fire, what status and body does a rejection give. If it fails, use bucket4j_jdk17-core with the existing Caffeine cache in a ContainerRequestFilter. Set quarkus.http.proxy.* so per-IP keys see the client, not Railway. Define one 429 body with a code the UI can explain, and write the ADR (extension or library, limits, response). No endpoint gets limited here beyond a test route; on62 and weay use it.

- [x] Spike Bucket4j extension on 3.40; fall back to core library if needed
- [x] Proxy forwarding settings, tested behind a forwarded header
- [x] One 429 response shape and code, documented
- [x] ADR: decision, limits, response

## Resolution

The extension works on Quarkus 3.40 (interceptor fires) but answers 429 with an empty body and has no
cap on its bucket store, so the shipped mechanism is `bucket4j_jdk17-core` in a name-bound
`ContainerRequestFilter` with buckets in Caffeine. `quarkus.http.proxy.*` is set; rejection is 429
`RATE_LIMITED` with `Retry-After`. Only a test route (src/test) is limited. See docs/adr/0010-shared-rate-limit.md.
