# Deployment Guide

## Local Docker

```bash
docker compose up --build
```

Application will be available at `http://localhost:9090`.

## Railway (primary)

Railway builds the app from the repo `Dockerfile` and gives per-PR preview
environments plus scale-to-zero. Config lives in [`railway.json`](railway.json)
(Dockerfile builder + `/api/build-info` health check).

### First deploy

1. Create a project and connect the GitHub repo:
   ```bash
   npm i -g @railway/cli && railway login
   railway init
   railway up          # or connect the repo in the dashboard for auto-deploys
   ```
   In the dashboard, connect the GitHub repo so pushes to `main` deploy and PRs
   get preview environments.
2. **Memory**: set the service to **at least 3 GB**. The container caps the JVM heap at
   `-Xmx1536m`, and the image built from `Dockerfile` also maps its ~200 MB AOT cache (see
   Memory Budget). 4 GB is comfortable.
3. **Port**: none needed — Railway injects `$PORT` and the app binds it
   (`quarkus.http.port=${PORT:9090}`).
4. **Scale-to-zero**: enable serverless / app-sleep in the service settings. The
   frontend warms the backend on load (`SELECT 1`), so the cold start is masked
   behind the loading state.
5. **Domain**: generate a `*.up.railway.app` domain (Settings → Networking), then
   add a custom domain if desired (free TLS).

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

## Fly.io

```bash
fly launch --no-deploy
fly scale memory 3072   # the Dockerfile image maps a ~200 MB AOT cache; see Memory Budget
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
`railway.json` therefore runs the migration once per deploy as a
`preDeployCommand`. The command boots Quarkus with `quarkus.init-and-exit=true`,
which runs Flyway and exits before the HTTP server starts. A failed migration
fails the deploy, and the previous version keeps serving.

To stop the running service repeating that work on each wake-up, also set:

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
| JVM heap                 | up to 1.5 GB    |
| JVM metaspace            | 128 MB - 384 MB |
| Shared Flink MiniCluster | ~150 MB         |
| AOT cache (`app.aot`, mapped) | ~200 MB    |
| OS / overhead            | ~200 MB         |
| **Worst case**           | **~2.4 GB**     |

Measured: RSS about 1.1 GB after a cold start and two queries with the cache, about
0.8 GB without it (`docs/STARTUP.md`); Railway container memory 643 MB after queries
without the cache.

The JVM is configured with `-Xmx1536m -XX:+UseG1GC
-XX:MetaspaceSize=128m -XX:MaxMetaspaceSize=384m -XX:AOTCache=app.aot` (see `Dockerfile`; the
AOT cache is trained during the image build, see `docs/STARTUP.md`). There is no
`-Xms`, so the heap starts small and grows on demand. ZGC is avoided: it backs the
heap with a shared-memory file, so the committed heap is charged to the container
as `shmem` (about 800 MB at idle with the old `-Xms768m`). Provision the
platform with at least 3 GB for the `Dockerfile` image (2 GB is enough for the
`Dockerfile.runtime` image, which has no AOT cache); 4 GB gives headroom for concurrent
sessions.
