---
# flink-sql-playground-5c4k
title: 'Builder instructions: one Bash command per call, no chaining, curl or rm'
status: completed
type: task
priority: normal
created_at: 2026-11-24T22:55:50Z
updated_at: 2026-11-24T22:55:50Z
---

Three factory builders (d7p7, moya, y0tz) wrote BLOCKED: because the dontAsk allow-list refuses chained commands, curl and rm. y0tz finished once told to run one ./gradlew command per call. The rule now lives in factory/agents/builder.md.

- [x] Add a Shell commands paragraph to builder.md
- [x] A refused call is retried as a single plain command before BLOCKED:
