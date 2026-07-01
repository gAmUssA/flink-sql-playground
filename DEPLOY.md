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
2. **Memory**: set the service to **at least 2 GB** (Flink MiniCluster). 4 GB is
   comfortable. The container caps the JVM at `-Xmx1536m`.
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
fly scale memory 2048
fly deploy
```

The app listens on `$PORT` (falls back to 9090). Configure in `fly.toml`:

```toml
[http_service]
  internal_port = 9090
```

## Hetzner VPS

1. Provision a VPS with at least 2 GB RAM (CX21 or higher)
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

### Docker Example

```bash
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

| Component              | Memory          |
|------------------------|-----------------|
| JVM heap               | 768 MB - 1.5 GB |
| JVM metaspace          | 128 MB - 384 MB |
| Flink MiniCluster (x5) | ~500 MB         |
| OS / overhead          | ~200 MB         |
| **Total**              | **~2 GB**       |

The JVM is configured with `-Xms768m -Xmx1536m -XX:+UseZGC -XX:+ZGenerational
-XX:MetaspaceSize=128m -XX:MaxMetaspaceSize=384m` (see `Dockerfile`). Provision
the platform with at least 2 GB; 4 GB gives headroom for concurrent sessions.
