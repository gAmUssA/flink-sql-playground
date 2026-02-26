## Context

The blueprint specifies a 2-4 GB RAM budget for the container. Eclipse Temurin JRE 17 is the recommended base image. JVM tuning flags are critical — SerialGC reduces thread overhead, and explicit heap limits prevent OOM kills.

## Goals / Non-Goals

**Goals:**
- Multi-stage Dockerfile: build with Gradle, run with JRE only
- docker-compose.yml for local development
- JVM memory tuning for 2 GB container
- Deployment notes for Fly.io and Hetzner

**Non-Goals:**
- Kubernetes manifests (post-MVP)
- CI/CD pipeline (post-MVP)
- SSL/TLS termination (handled by reverse proxy in production)
- Container-per-query isolation (post-MVP, ClickHouse Fiddle model)

## Decisions

### 1. Multi-stage Dockerfile
**Choice**: Stage 1 uses `eclipse-temurin:21-jdk` for Gradle build, stage 2 uses `eclipse-temurin:21-jre` for runtime.
**Rationale**: Smaller final image (~300 MB vs ~600 MB). No build tools in production image.

### 2. JVM flags
**Choice**: `-Xms512m -Xmx1536m -XX:+UseSerialGC -XX:MaxMetaspaceSize=128m`
**Rationale**: Per blueprint. SerialGC avoids GC thread overhead. 1536m max heap leaves room for native memory in a 2 GB container. 128m metaspace cap prevents unbounded class loading.

### 3. docker-compose for local dev
**Choice**: Single-service compose file exposing port 8080.
**Rationale**: Simplifies local testing. No external dependencies needed for MVP.

### 4. Deployment documentation
**Choice**: `DEPLOY.md` with instructions for Fly.io (`fly launch`) and Hetzner VPS (Docker install + docker-compose).
**Rationale**: Blueprint identifies these as best-value platforms. Keep instructions minimal and actionable.

## Risks / Trade-offs

- **[2 GB may be tight with 5 sessions]** → Budget assumes ~200 MB per active session. 5 sessions = 1 GB + 500 MB overhead ≈ 1.5 GB. Fits within 1536m max heap.
- **[JRE-only image lacks debugging tools]** → Acceptable for production. Use JDK image for debugging if needed.
