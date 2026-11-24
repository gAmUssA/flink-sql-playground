# 0010. One shared per-client rate limit: Bucket4j core in a JAX-RS filter, 429 `RATE_LIMITED`

## Status

accepted

## Date

2026-11-25

## Context

The playground limits sessions (`flink.max-sessions`) and rows and time per query, but not how often
a client may call. Embed autorun (bean `on62`) and per-session planning limits (bean `weay`) both
need a request rate limit. This ADR builds the shared part: the mechanism, the client key, the 429
body and the proxy settings. No production endpoint is limited by it yet; only a test route is.

## Decision

### Mechanism: `bucket4j_jdk17-core` in a name-bound `ContainerRequestFilter`

**Spike.** `io.quarkiverse.bucket4j:quarkus-bucket4j:1.0.7` was added on Quarkus 3.40.1 and a
`@RateLimited(bucket = "spike")` resource called four times with a limit of 2.

- It works mechanically. The extension starts, the interceptor fires, calls 1 and 2 answer 200 and
  calls 3 and 4 answer **429 with an empty body** and `Retry-After` (1799 s for 2 uses per hour).
  It brings its own exception mapper, so the body is not our `ErrorResponse`.
- Its configuration (`quarkus.rate-limiter.buckets.<name>.limits[n]`) has no size cap or expiry for
  the per-key bucket store, so a flood of distinct IPs has no bound that we control. It also pulls
  in `quarkus-cache`.
- Getting the JSON contract and a bounded store out of it means replacing its mapper and its
  storage, which leaves little of the extension.

**Shipped:** `com.bucket4j:bucket4j_jdk17-core:8.14.0` (the version the extension resolved; the
Quarkus BOM does not pin Bucket4j) with buckets in a Caffeine cache (`maximumSize`,
`expireAfterAccess`). Caffeine is already a dependency (`SessionManager`).

- `@RateLimited(Tier)` is a JAX-RS `@NameBinding`. `RateLimitFilter` runs only on annotated
  resources, so static files, `/api/build-info` (the Railway health check), and the streaming
  execute path are never touched unless someone annotates them. To limit an endpoint, annotate it.
- On rejection the filter throws `RateLimitedException`, which `GlobalExceptionHandler` maps.
- The test route lives in `src/test`, so it is not in the production artifact.

### The 429 shape

HTTP 429, `Content-Type: application/json`, `Retry-After: <whole seconds, at least 1>`:

```json
{"error": "Too many requests. Try again in 12 seconds.", "code": "RATE_LIMITED"}
```

It is an `ErrorResponse` with no extra fields. `SESSION_LIMIT_EXCEEDED` (too many sessions) is also
429 with the same shape and a different code, so a UI can tell "slow down" from "no free session".
The media type is forced to JSON, whatever the limited route produces. The UI copy for
`RATE_LIMITED` is not part of this change.

### Client key

The key is `<tier>:<client address>`: the client IP, never the `Origin` (embed requests come from
iframes on third-party sites, ADR 0008). Buckets are per tier so one endpoint's burst does not
spend another's.

`application.properties` sets `quarkus.http.proxy.proxy-address-forwarding=true` and
`allow-x-forwarded=true`, so `request.remoteAddress()` is the `X-Forwarded-For` client, and the TCP
peer when the header is missing (`RateLimitTest` checks both). `enable-forwarded-host` stays off.

**Trust assumption.** Railway's edge sets `X-Forwarded-For`, and the app is reached only through it.
Quarkus (Vert.x) takes the *first* address in the header, which a client can send itself. If the
edge appends to a client-sent value instead of replacing it, a client can pick its own key and dodge
the limit. Treat the limit as protection against honest bursts and simple loops, not against a
determined attacker, until the edge behavior is checked. Where the app is also reachable directly
(Fly, a VPS, `DEPLOY.md`) any client can spoof the header; set `quarkus.http.proxy.*` off there, or
keep a trusted proxy in front. `quarkus.http.proxy.trusted-proxies` is not set: Railway's proxy
addresses are not published.

### Memory

`BucketStore` is a Caffeine cache: `app.rate-limit.max-keys` (default 10000) and
`app.rate-limit.key-expiry` (idle, default 15m). Two limits of this: an attacker with many
addresses can evict other clients' buckets and so reset them (a bucket forgotten early is a full
one), and `key-expiry` below the longest refill period would do the same, so startup fails then.

### Configuration

All overridable by env var (`APP_RATE_LIMIT_*`), defaults in `application.properties` and
`RateLimitConfig`:

| Property | Default |
|---|---|
| `app.rate-limit.max-keys` | `10000` |
| `app.rate-limit.key-expiry` | `15m` |
| `app.rate-limit.standard-capacity` / `-refill-period` | `30` / `1m` |
| `app.rate-limit.test-capacity` / `-refill-period` | `3` / `10m` |

Refill is greedy: `capacity` tokens spread over the period.

### Proposed limits for the next beans (to adopt, not set here)

- `on62` (embed autorun, session creation): the `standard` tier is too loose for session creation,
  which starts Flink work. Start at capacity 5 per minute per IP on the create-session call, and
  keep the run calls at the standard tier.
- `weay` (explain and execute per session): the standard tier, 30 per minute per IP. A person
  editing and pressing Run stays under it; a loop does not.

They add a tier (or a property pair) and annotate the endpoint. Tune from the logs.

## Consequences

- One mechanism, one body, one code. `on62` and `weay` annotate endpoints and add config.
- The in-memory store is per instance. That is fine for the single Railway instance; two instances
  would each allow the full rate.
- A restart empties all buckets.
- `RateLimitedException` is thrown from a filter, so an endpoint that already started streaming
  cannot be limited this way; the check runs before the first byte, which is the intent.
- The proxy settings change `request.remoteAddress()` for the whole app. Nothing else reads it
  (`StartupLogger`, `EmbedFraming` do not).
- Tests: `RateLimitTest`, `RateLimitConfigOverrideTest`, `BucketStoreTest`, `ClientAddressTest`.
