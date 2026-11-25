# Deployment Guide

## Local Docker

```bash
docker compose up --build
```

Application will be available at `http://localhost:9090`.

## Railway (primary)

Railway builds the app from the repo `Dockerfile` and gives per-PR preview
environments plus scale-to-zero. The service is defined as Infrastructure as Code in
[`.railway/railway.ts`](.railway/railway.ts): Dockerfile builder, `/api/build-info`
health check, the Flyway pre-deploy command, restart policy, resources, app sleep and the
custom domain. Variables are not in the file (`variables: { managed: false }`); they stay
in the Railway dashboard.

Railway stops reading Config as Code (`railway.json`) on 2026-12-01. This service was
moved off it on 2026-11-22, and the repo has no `railway.json`. Change service settings in
`.railway/railway.ts`, never only in the dashboard:

```bash
npm ci                                  # installs the `railway` IaC SDK (dev dependency)
# The production service; a new project needs its own link (see "First deploy").
railway link --project insightful-harmony --environment production --service flink-sql-playground
railway config plan                     # review the diff against the live service
railway config apply                    # apply it (asks for confirmation)
```

A merge to `main` deploys the code at once (Railway does not wait for CI or for an
apply), and it never applies `.railway/railway.ts`. So order the two:

- A settings change that works with the code already on `main` (a new health-check
  timeout, more memory): apply it from the PR branch before merging.
- A change tied to new code (moving the `Dockerfile` and `dockerfilePath`, a new
  pre-deploy command): stage it. First merge code that works under both the old and new
  settings, then apply, then merge the part that needs the new settings.

### First deploy

1. Create a project and connect the GitHub repo:
   ```bash
   npm i -g @railway/cli && railway login
   railway init
   railway up          # or connect the repo in the dashboard for auto-deploys
   ```
   In the dashboard, connect the GitHub repo so pushes to `main` deploy and PRs
   get preview environments.
2. **Memory**: set the service to **at least 3.5 GB**. The container caps the JVM heap at
   `-Xmx2048m`, and the image built from `Dockerfile` also maps its ~200 MB AOT cache (see
   Memory Budget). 4 GB is comfortable. Session capacity is `FLINK_MAX_SESSIONS` (Railway variable);
   a 32-session local run peaked at 1.29 GB resident.
3. **Port**: none needed — Railway injects `$PORT` and the app binds it
   (`quarkus.http.port=${PORT:9090}`).
4. **Scale-to-zero**: enable serverless / app-sleep in the service settings. The
   frontend warms the backend on load (`SELECT 1`), so the cold start is masked
   behind the loading state.
5. **Domain**: generate a `*.up.railway.app` domain (Settings → Networking), then
   add a custom domain if desired (free TLS).
6. **Service settings**: `railway up` does not apply `.railway/railway.ts`. Copy it, change
   the project name, service, source and domain to the new environment's, `railway link`
   to the new project, then `railway config plan` and `railway config apply`. Until the
   pre-deploy command is applied, keep Flyway at startup (do not set the variables in
   "migrate before deploy" below): without either, the health check passes while every
   fiddle save fails on a missing table.

### Deployed-build footer

The footer (`/api/build-info`) reads build-time args baked into the image. Inside
the Docker build there's no `.git`, so without these it shows `unknown`. Railway
injects git metadata and passes variables into the build as args, so add two
**service variables** mapping Railway's git vars onto the ARG names the Dockerfile
already declares:

```
GIT_COMMIT = ${{ RAILWAY_GIT_COMMIT_SHA }}
GIT_BRANCH = ${{ RAILWAY_GIT_BRANCH }}
```

Define your **own** variables referencing `RAILWAY_GIT_*` via `${{ }}` rather than
consuming `RAILWAY_GIT_COMMIT_SHA` directly in the Dockerfile — user-defined vars
are reliably passed as build args, whereas the raw Railway-provided ones can be
unavailable at build time.

For persistent fiddle storage, add the Supabase env vars below.

### Embeds and framing

`/embed.html` is the one page other sites may frame; every other path, the API included, sends
`X-Frame-Options: DENY` and `frame-ancestors 'none'`. The rule is code (`EmbedFraming`) plus
`application.properties`, so a merge deploys it and **no Railway service setting changes**
(`railway config apply` is not needed). Optional variable, set in the Railway dashboard:

| Variable | Default | Meaning |
|---|---|---|
| `EMBED_FRAME_ANCESTORS` | `*` | Space-separated origins that may frame `/embed.html`, e.g. `https://blog.example.com https://*.example.org`. |

GitHub Pages serves `embed.html` as well and sends no headers, so it can be framed as it is
and nothing needs configuring there. After a deploy, check both:

```bash
curl -sI https://<backend>/embed.html | grep -i -E 'x-frame|content-security'   # no x-frame-options, frame-ancestors *
curl -sI https://<backend>/            | grep -i -E 'x-frame|content-security'   # DENY, frame-ancestors 'none'
```

See [ADR 0008](docs/adr/0008-embed-mode.md).

## Fly.io

```bash
fly launch --no-deploy
fly scale memory 3584   # the Dockerfile image maps a ~200 MB AOT cache; see Memory Budget
fly deploy
```

The app listens on `$PORT` (falls back to 9090). Configure in `fly.toml`:

```toml
[http_service]
  internal_port = 9090
```

## Hetzner VPS

1. Provision a VPS with at least 3 GB RAM (CX21 or higher); Docker Compose builds the `Dockerfile` image, which maps a ~200 MB AOT cache
2. Install Docker:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
3. Clone and run:
   ```bash
   git clone <repo-url> && cd flink-sql-fiddle
   docker compose up -d
   ```
4. Configure firewall:
   ```bash
   ufw allow 9090/tcp
   ```

## Supabase (Persistent Fiddle Storage)

By default, fiddles are stored in an in-memory H2 database (lost on restart). To
persist fiddles across deployments, activate the `supabase` Quarkus profile with
a Supabase PostgreSQL database.

> **Important — the profile must be active at BUILD time, not just runtime.**
> Quarkus fixes the JDBC driver from `quarkus.datasource.db-kind` during
> augmentation (both the H2 and PostgreSQL drivers are on the classpath). A
> runtime-only `QUARKUS_PROFILE=supabase` swaps the URL to Postgres but leaves the
> H2 driver baked in, so boot fails with *"Driver does not support the provided
> URL"*. The image must be **built** with `QUARKUS_PROFILE=supabase` so the
> PostgreSQL driver is baked in. The `Dockerfile` exposes this as a build arg
> (`ARG QUARKUS_PROFILE`); on Railway the `QUARKUS_PROFILE` service variable is
> forwarded to the build automatically, so build and runtime stay in sync. For a
> manual `docker build`, pass `--build-arg QUARKUS_PROFILE=supabase`.

### Required Environment Variables

| Variable               | Description                                         | Example                                                        |
|------------------------|-----------------------------------------------------|----------------------------------------------------------------|
| `QUARKUS_PROFILE`      | Activate Supabase profile                           | `supabase`                                                     |
| `SUPABASE_DB_URL`      | JDBC connection URL (Transaction pooler, port 6543) | `jdbc:postgresql://<region>.pooler.supabase.com:6543/postgres` |
| `SUPABASE_DB_USER`     | Database user                                        | `postgres.<project-ref>`                                       |
| `SUPABASE_DB_PASSWORD` | Database password                                   | `<your-password>`                                              |

### Setup

1. Create a [Supabase](https://supabase.com) project
2. Copy the **Transaction pooler** connection string from **Settings > Database > Connection string > JDBC** (select "Transaction pooler" / port 6543)
3. Set the environment variables in your deployment platform (Railway, Fly.io, Docker, etc.)

### Railway Example

Set these in the service **Variables** tab (or via CLI):

```bash
railway variables \
  --set QUARKUS_PROFILE=supabase \
  --set SUPABASE_DB_URL=jdbc:postgresql://<region>.pooler.supabase.com:6543/postgres \
  --set SUPABASE_DB_USER=postgres.<ref> \
  --set SUPABASE_DB_PASSWORD=<password>
```

### Railway: migrate before deploy, not on every boot

With app sleeping enabled, every wake-up is a cold start, and running Flyway
plus Hibernate schema validation against Supabase adds about 3 s to each one.
`.railway/railway.ts` therefore runs the migration once per deploy as its
`preDeploy` command. The command boots Quarkus with `quarkus.init-and-exit=true`,
which runs Flyway and exits before the HTTP server starts. A failed migration
fails the deploy, and the previous version keeps serving.

Only once that pre-deploy command is applied to the service (check `railway config plan`
reports no changes), stop the running service repeating that work on each wake-up:

```bash
railway variables \
  --set QUARKUS_FLYWAY_MIGRATE_AT_START=false \
  --set QUARKUS_HIBERNATE_ORM_SCHEMA_MANAGEMENT_STRATEGY=none
```

The pre-deploy command passes its settings as `-D` system properties, which take
precedence over these variables, so it still migrates and validates. Other
platforms without a pre-deploy step should leave both variables unset so the app
keeps migrating at startup.

### Docker Example

Build the image with the profile (bakes the PostgreSQL driver), then run it with
the matching runtime env:

```bash
docker build --build-arg QUARKUS_PROFILE=supabase -t flink-sql-fiddle .

docker run -p 9090:9090 \
  -e QUARKUS_PROFILE=supabase \
  -e SUPABASE_DB_URL=jdbc:postgresql://<region>.pooler.supabase.com:6543/postgres \
  -e SUPABASE_DB_USER=postgres.<ref> \
  -e SUPABASE_DB_PASSWORD=<password> \
  flink-sql-fiddle
```

### Notes

- Use the **Transaction pooler** (port 6543 on `pooler.supabase.com`) — available on the free tier and works over IPv4. The `?prepareThreshold=0` parameter is appended automatically by the supabase profile to disable prepared statements (required for Transaction mode).
- Do **not** use the direct connection (`db.<ref>.supabase.co:5432`) — it requires IPv6, which many deployment environments don't support without the paid IPv4 add-on. Session pooler (port 5432) requires a paid plan.
- Flyway runs migrations automatically on startup. The `fiddles` table is created by `V1__create_fiddles_table.sql`.
- Without the `supabase` profile, the app defaults to in-memory H2 (no env vars needed for local dev).

## Memory Budget

| Component                | Memory          |
|--------------------------|-----------------|
| JVM heap                 | up to 2 GB      |
| JVM metaspace            | 128 MB - 384 MB |
| Shared Flink MiniCluster | ~150 MB         |
| AOT cache (`app.aot`, mapped) | ~200 MB    |
| OS / overhead            | ~200 MB         |
| **Worst case**           | **~2.9 GB**     |

Measured: RSS about 1.1 GB after a cold start and two queries with the cache, about
0.8 GB without it (`docs/STARTUP.md`); Railway container memory 643 MB after queries
without the cache.

The JVM is configured with `-Xmx2048m -XX:+UseG1GC
-XX:MetaspaceSize=128m -XX:MaxMetaspaceSize=384m -XX:AOTCache=app.aot` (see `Dockerfile`; the
AOT cache is trained during the image build, see `docs/STARTUP.md`). There is no
`-Xms`, so the heap starts small and grows on demand. ZGC is avoided: it backs the
heap with a shared-memory file, so the committed heap is charged to the container
as `shmem` (about 800 MB at idle with the old `-Xms768m`). Provision the
platform with at least 3.5 GB for the `Dockerfile` image (2 GB is enough for the
`Dockerfile.runtime` image, which has no AOT cache and keeps a 1.5 GB heap); 4 GB gives headroom for concurrent
sessions.
