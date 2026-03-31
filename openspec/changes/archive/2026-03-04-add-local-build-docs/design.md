## Context

The Flink SQL Playground has no README. The project already has a working Gradle build (`build.gradle.kts`), a multi-stage `Dockerfile`, and a `docker-compose.yml`. All the infrastructure exists — it just needs to be documented in a single entry point.

## Goals / Non-Goals

**Goals:**
- Provide a single `README.md` that lets a new developer build and run the project within minutes
- Cover both Java (Gradle) and Docker workflows
- Document prerequisites clearly

**Non-Goals:**
- Architecture documentation (already in `docs/flink-sql-fiddle-blueprint.md`)
- Deployment/CI documentation
- Contributing guidelines or code of conduct

## Decisions

### Single README vs docs/ folder
**Decision**: Single `README.md` at project root.
**Rationale**: The scope is small (build/run instructions). A docs/ folder already exists for the blueprint. A README is the conventional entry point on GitHub.

### Section structure
**Decision**: Overview → Prerequisites → Local Java Build → Docker Build → Running Tests → Links
**Rationale**: Follows the natural developer journey: understand → set up → build → run → test.

## Risks / Trade-offs

- [Docs become stale] → Minimal risk since build tooling (Gradle, Docker) changes infrequently. Port number (9090) and Java version (21) are pinned in config files.
- [Duplication with blueprint] → README links to the blueprint for architecture details rather than duplicating content.
