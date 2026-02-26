## Why

The fiddle needs to be deployable as a single container for production use. A multi-stage Dockerfile produces a minimal image, and docker-compose simplifies local development. JVM tuning flags ensure the application runs within the 2 GB memory budget. References blueprint sections: "Deployment needs at least 2 GB RAM" and "Dockerfile."

## What Changes

- Create multi-stage `Dockerfile` using `eclipse-temurin:21-jre` base
- Create `docker-compose.yml` for local development
- Configure JVM flags: `-Xms512m -Xmx1536m -XX:+UseSerialGC -XX:MaxMetaspaceSize=128m`
- Add deployment notes for Fly.io and Hetzner VPS

## Capabilities

### New Capabilities
- `containerization`: Dockerfile, docker-compose, JVM tuning, and deployment documentation

### Modified Capabilities

## Impact

- **Files**: New `Dockerfile`, `docker-compose.yml`, and `DEPLOY.md`
- **Deployment**: Application deployable via `docker build` and `docker run`
- **Resources**: Container requires minimum 2 GB RAM allocation
