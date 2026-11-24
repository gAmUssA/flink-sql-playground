# 0008. Embed mode: one framable page, everything else stays unframeable

## Status

accepted

## Date

2026-11-23

## Context

Blog posts, docs and workshop slides show Flink SQL as screenshots. Share links are already
self-contained (`#f=v1.<deflated JSON>`, `js/fiddle-link.js`), so a runnable embed needs only a
compact page and permission to frame it.

Today the backend sends `X-Frame-Options: DENY` and `frame-ancestors 'none'` on every response
(`application.properties`). GitHub Pages serves the same static SPA and sends no framing headers
at all, and a `<meta>` CSP cannot carry `frame-ancestors`, so on Pages every page can be framed
already. Pages is a static host: we cannot change that, and nothing on it holds state or secrets.

Three questions needed an answer: where the embed lives, who may frame it, and what a hostile
framing page can do with it.

## Decision

**A dedicated page, `embed.html`, not `?embed=1` on `index.html`.** A header rule can match a
path but not a query string. With `?embed=1` the only way to allow framing would be to allow it
for the whole app, which has table drops, Share (a fiddle write) and settings. A separate document
lets the backend relax framing for exactly `/embed.html`. It shares `app.js`, `style.css` and the
results views with the app; `data-embed="1"` on `<html>` switches `app.js` into embed behaviour.

**Served from both origins.** The Pages build rewrites `embed.html` like `index.html` (base href,
backend in `connect-src`). The backend serves it too (Railway, Docker, offline demos). The Share
menu's "Copy embed code" uses the origin the user is on. For a blog that wants instant loads
the Pages origin is the better one: the page paints while the backend sleeps, and the cold start
is paid on Run.

**Framing rules on the backend (`EmbedFraming`).**
- For exactly `/embed.html` (the normalized path, so `/embed.html/`, `//embed.html`, `/EMBED.html`,
  `/embed` do not match) a response header hook drops `X-Frame-Options` and rewrites
  `frame-ancestors 'none'` to `frame-ancestors <app.embed.frame-ancestors>`. The default is `*`;
  set `EMBED_FRAME_ANCESTORS` to a space-separated origin list to restrict who may embed.
  The hook edits the headers as they are written, so it does not depend on the order in which
  configured headers are added. Every other directive of the CSP stays.
- Every other path keeps `DENY` and `frame-ancestors 'none'`: `/`, `/index.html`, `/f/<code>`, the
  scripts and styles, and the whole API. The embed's scripts are the app's scripts and are not
  framable on their own; only the document needs to be.
- `X-Frame-Options` has no "any origin" value (`ALLOW-FROM` is gone from browsers), so the header
  is removed for the embed and `frame-ancestors` carries the rule.

**Lazy session.** The embed makes no API call on load: no session, no warm-up probe, no
build-info, no fiddle fetch (it only reads the fragment). The first Run creates the session
(retrying 502/503/504 and network errors for about 40 seconds while it says "Waking up the Flink
cluster…"), builds the schema once, then runs. Concurrent Runs share one session request. A
session that expired is replaced on the next Run, and so is the session when the link loads another
fiddle. A hung session request times out after 10 seconds and counts as a miss in the retry loop. Five embeds on a page open no session on load.

**`autorun` is gated on visibility.** `?autorun=1` runs once, when at least half of the embed is
on screen. An iframe that is scrolled off, smaller than 200x120, or (in Chromium, through
IntersectionObserver v2) covered or transparent does not start a session. This is best effort: a
browser without v2 cannot tell a transparent frame from a visible one, so a hostile page can still
open sessions there. The real cap is the server's session limit, row cap and timeouts. A link that
changes after load voids a pending autorun. Only the literal `1` counts.

**The embed has no destructive or persistent action.** It has Run/Stop, a schema toggle (read-only
schema), the results tabs, and a link that opens the full app in a new tab (`rel="noopener"`).
No Share/save, no drop-table, no presets, no tweaks, no tour. Tab, theme and autorun params are
checked against fixed lists and never written into the page.

## Alternatives

- **`?embed=1` on `index.html`.** Rejected: frames the whole app (see above).
- **An origin allowlist as the default.** Rejected: embeds are for blogs we do not know. The knob
  exists (`EMBED_FRAME_ANCESTORS`) for a deployment that wants it.
- **Pages only.** Rejected: self-hosted and offline demos would have no embed, and the headers
  would never be testable. Pages stays supported because it needs nothing from us.
- **Signed or time-limited embed tokens.** Rejected: the fragment is public by design and a token
  buys nothing the session limit does not already cap.
- **A `sandbox` attribute in the snippet.** Rejected: the page needs `allow-scripts` and
  `allow-same-origin` to run and to call the API, which removes most of what sandbox restricts.

## Consequences

- **Clickjacking.** A hostile page can frame the embed and overlay it so a visitor's click lands
  on Run. That costs one session and one bounded query (existing session limit, row cap and
  execution timeout apply). It cannot read the visitor's data (there is none), change a fiddle,
  drop a table or change settings, because the embed has none of those. The worst case is spent
  compute, which the limits already bound, and a clickable "Open in playground" link, which only
  navigates to the same app.
- Any site can frame the embed and so can start sessions on the visitor's behalf. Rate limits per
  origin are not in place; if abuse shows up, restrict with `EMBED_FRAME_ANCESTORS` or add a limit.
  The shared per-IP limit (keyed on client address, not origin) is in [ADR 0010](0010-shared-rate-limit.md);
  bean `on62` applies it to the embed.
- On Pages, `index.html` is frameable and cannot be fixed there. It exposes the same app a visitor
  could open directly, with the same limits; nothing on it is more dangerous than on the embed
  except the drop-table button, which only affects that visitor's own session.
- Headers live in `application.properties` and a Java hook, so a merge deploys them; no Railway
  service setting changes and `railway config apply` is not needed.
- A new page means `embed.html` joins the no-cache list (`quarkus.http.filter.static.matches`),
  the static-site build, and the Lighthouse check.
- Tests: `SecurityHeadersTest` (framing on the embed only, look-alike paths stay strict, 304s keep
  the relaxed headers), `StaticCacheHeadersTest`, `embed.spec.js` (iframe at 400x500 and 800x600,
  lazy session, cold start, autorun, hostile links), `embed-params.test.js`.
