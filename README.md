# Flink SQL Playground

[![Smoke Test](https://github.com/gAmUssA/flink-sql-playground/actions/workflows/smoke-test.yml/badge.svg)](https://github.com/gAmUssA/flink-sql-playground/actions/workflows/smoke-test.yml)
[![Docker Build](https://github.com/gAmUssA/flink-sql-playground/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/gAmUssA/flink-sql-playground/actions/workflows/docker-publish.yml)
[![Java 25](https://img.shields.io/badge/Java-25-orange?logo=openjdk)](https://adoptium.net/)
[![Quarkus](https://img.shields.io/badge/Quarkus-3.40-blue?logo=quarkus)](https://quarkus.io/)
[![Apache Flink](https://img.shields.io/badge/Apache%20Flink-2.3.0-blue?logo=apacheflink)](https://flink.apache.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

An interactive web-based SQL editor for Apache Flink. Write and execute Flink SQL queries in your browser against an embedded Flink runtime — no external cluster or infrastructure required.

## Features

- **Browser-based SQL editor** — CodeMirror 6 with Flink SQL highlighting, schema-aware autocomplete (tables and columns — also before Build Schema, from the DDL you type — plus connector options inside `WITH (...)`), and Ctrl/Cmd+Enter to run
- **Embedded Flink runtime** — single-JVM execution, no cluster setup needed
- **Batch and streaming modes** — switch between execution modes per query
- **Built-in data generators** — `datagen` and custom `faker` connectors for realistic test data
- **Shareable fiddles** — save and share SQL snippets via short URLs; when the server is unavailable, Share copies a self-contained link that carries the SQL in the URL fragment
- **Embeddable** — drop a runnable fiddle into a blog post or slide with an `<iframe>` (see [Embedding a fiddle](#embedding-a-fiddle))
- **Example queries** — 15 preloaded examples covering windows, joins, pattern matching, and more
- **Security sandbox** — blocked UDF injection, connector whitelist, execution timeouts

## Prerequisites

- **Java 25** — required to build and run locally ([Eclipse Temurin](https://adoptium.net/) recommended). Quarkus augmentation runs in the Gradle JVM and loads the compiled Java 25 classes, so the build itself must run on JDK 25.
- **Node.js 22.19+** — bundles the SQL editor and runs the frontend unit tests. Run `npm ci --omit=dev` once before `./gradlew build` or `quarkusDev`: the `bundleEditor` task bundles CodeMirror with esbuild into `js/editor.bundle.js` (generated, not committed)
- **Docker** (optional) — for running the app in a container

## Local Java Build

Build the project:

```bash
./gradlew build
```

Run in development mode (live reload):

```bash
./gradlew quarkusDev
```

Open [http://localhost:9090](http://localhost:9090) in your browser.

## Docker

### Quick start (no build required)

Pull and run the pre-built image from GitHub Container Registry:

```bash
docker run -p 9090:9090 ghcr.io/gamussa/flink-sql-playground:latest
```

The image supports both `amd64` and `arm64` architectures — works on Intel, AMD, and Apple Silicon.

### Build locally

Build and run with Docker Compose:

```bash
docker compose up --build
```

Open [http://localhost:9090](http://localhost:9090) in your browser.

To stop: press `Ctrl+C` or run `docker compose down`.

## Embedding a fiddle

Share → **Copy embed code** copies an `<iframe>` for the fiddle on screen:

```html
<iframe src="https://<host>/embed.html#f=v1.…" title="Flink SQL fiddle" width="100%" height="480"
        loading="lazy" style="border:1px solid #8884;border-radius:8px"
        referrerpolicy="strict-origin-when-cross-origin" allow="clipboard-write"></iframe>
```

The embed shows the query editor, Run, and the Table, Changelog, Job Graph and Timeline tabs.
The schema sits behind a toggle and cannot be edited. **Open in playground** opens the full app with
the same fiddle. The SQL travels in the URL fragment, so the link works while the server sleeps and
the fragment never reaches a server.

| Param (before the `#`) | Effect |
|---|---|
| `autorun=1` | Runs the query once, when the embed is on screen. |
| `tab=changelog` | Opens `table` (default), `changelog`, `graph` or `timeline`. |
| `theme=cobalt` | `nebula`, `carbon` or `cobalt`; without it the embed follows the visitor's colour scheme. |

Example: `https://<host>/embed.html?autorun=1&tab=changelog#f=v1.…`

- **No session until Run.** A page with five embeds opens none on load. The first Run says "Waking up
  the Flink cluster…" while an idle backend starts (up to about half a minute), builds the schema, then
  runs the query.
- **Size.** Give it at least 400 px of width and 400 px of height; 480 px is the default.
- **Who may embed.** `embed.html` is the only page the backend lets other sites frame (`frame-ancestors *`);
  the app and the API refuse framing. Set `EMBED_FRAME_ANCESTORS` (space-separated origins) to restrict it.
  The decision is in [ADR 0008](docs/adr/0008-embed-mode.md).
- Self-contained links are limited by URL length: a very large fiddle may be too long for some
  tools to paste. The playground's own short link (`/f/<code>`) is not an embed URL.

## Running Tests

```bash
./gradlew test      # fast JVM tests
./gradlew jsTest    # frontend unit tests (node --test on src/test/js/*.test.js)
./gradlew check     # everything, including the Flink smoke tests
```

Browser tests (phone and desktop layouts in Chromium and WebKit) and the Lighthouse mobile
check use npm. They serve the static frontend and stub the API, so no backend is needed:

```bash
npm ci
npm run build:editor                                  # bundle the CodeMirror editor
npx playwright install chromium webkit
npx playwright test                                   # phone (375/390/412 px upright, 844/915 px sideways), desktop and editor tests
node scripts/serve-static.js 8790 &                   # then, in another step:
node scripts/lighthouse-check.js http://127.0.0.1:8790/ accessibility=95 performance=85 transfer-kb=400
```

Add `--theme=nebula`, `--theme=carbon` or `--theme=cobalt` to audit one theme; without it the
page follows the browser's colour scheme, as on a first visit.

The tests serve on port 8790 and reuse a server already listening there, except on CI. Set
`E2E_PORT` (for example `E2E_PORT=8796 npx playwright test`) when another checkout serves 8790.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for a detailed overview of the system design, request flow, session management, security model, and test structure.
