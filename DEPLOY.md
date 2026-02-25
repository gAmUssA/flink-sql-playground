# Deployment Guide

## Local Docker

```bash
docker compose up --build
```

Application will be available at `http://localhost:9090`.

## Fly.io

```bash
fly launch --no-deploy
fly scale memory 2048
fly deploy
```

The app listens on port 9090. Configure in `fly.toml`:

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

## Koyeb

1. Install the [Koyeb CLI](https://www.koyeb.com/docs/build-and-deploy/cli/installation):
   ```bash
   curl -fsSL https://raw.githubusercontent.com/koyeb/koyeb-cli/master/install.sh | sh
   koyeb login
   ```

2. Create the app and deploy from your GitHub repo:
   ```bash
   koyeb app create flink-sql-fiddle
   koyeb service create flink-sql-fiddle \
     --app flink-sql-fiddle \
     --git github.com/<your-org>/flink-sql-playground \
     --git-branch main \
     --git-builder docker \
     --instance-type eco-medium \
     --ports 9090:http \
     --checks 9090:http:/ \
     --checks-grace-period 0=60
   ```

**Instance type**: `eco-medium` provides 2 GB RAM / 1 vCPU ($0.0144/hr). Use `medium` (2 GB / 2 vCPU, $0.0288/hr) for better CPU if needed.

**Health check**: The `--checks 9090:http:/` configures an HTTP health check on port 9090. The 60-second grace period allows time for the JVM and Flink MiniCluster to start.

**Note**: Koyeb may cold-start instances after inactivity on lower-tier plans, causing a ~30–60s delay on first request. This is acceptable for a playground/demo deployment.

## Memory Budget

| Component              | Memory  |
|------------------------|---------|
| JVM heap               | 512 MB - 1.5 GB |
| JVM metaspace          | 128 MB  |
| Flink MiniCluster (x5) | ~500 MB |
| OS / overhead          | ~200 MB |
| **Total**              | **~2 GB** |

The JVM is configured with `-Xms512m -Xmx1536m -XX:+UseSerialGC -XX:MaxMetaspaceSize=128m`. SerialGC minimizes memory overhead for a single-user playground.
