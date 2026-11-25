---
# flink-sql-playground-yz6o
title: 'Horizontal scale: sessions must stay on one replica (pinning or stateless sessions)'
status: draft
type: feature
priority: low
created_at: 2026-11-25T08:22:46Z
updated_at: 2026-11-25T08:22:46Z
---

Today the service runs one replica (`.railway/railway.ts`, `replicas: 1`). Sessions (Caffeine, planner thread per session), the shared MiniCluster and the rate-limit buckets (ADR 0010) are per JVM, so a second replica answers `SESSION_NOT_FOUND` for sessions it did not create.

Options to decide in an ADR:
1. Pin a session to a replica: encode the replica in the session id and route at the edge. Check whether Railway offers sticky routing before choosing this.
2. Stateless sessions: the SPA recreates the session on a 404 and replays its DDL. Only DDL state is lost, and jobs are short.
3. Shared rate limits (Redis or similar) once more than one replica runs.

Until then scale up: raise `FLINK_MAX_SESSIONS`, heap and the container limit.

## Acceptance
- ADR with the chosen option and its failure modes.
- Two replicas serve a session end to end in a test.
