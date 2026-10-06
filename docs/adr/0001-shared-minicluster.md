# 0001. Run queries on one shared Flink MiniCluster

## Status

accepted

## Date

2026-10-06

## Context

Each query ran through Flink's local executor, which starts a MiniCluster (Pekko RPC,
blob server, Netty shuffle, REST endpoint) for the job and tears it down afterwards. On
the scale-to-zero Railway deployment that start-up sat on the request path of every
query: a warm `SELECT` took about 0.7 s, and the first query after boot about 2 s.

Options considered:

- Keep the per-job cluster: no idle cost, but every query pays the cluster start.
- One long-lived MiniCluster, with each `TableEnvironment` submitting to it through
  `execution.target=remote` on a loopback REST endpoint.
- Submit through Flink's test utilities (`MiniClusterPipelineExecutorServiceLoader`):
  needs a test-scoped dependency in production code.

## Decision

Start one `SharedMiniCluster` in the background at boot and point every session's
`TableEnvironment` at its REST endpoint, bound to `127.0.0.1` on an ephemeral port. The
cluster gets two task slots per session by default (BATCH and STREAMING), 64 MB of
network buffers, and the configured managed memory per slot. `flink.shared-cluster=false`
restores the per-job executor.

## Consequences

- Easier: queries skip cluster start-up. Measured locally: warm query 0.68 s to 0.44 s,
  cold first query 2.02 s to 1.34 s (`docs/STARTUP.md`).
- Harder: the app holds about 140 MB more while awake, and all sessions share one
  cluster, so a job that exhausts its slot's managed memory or blocks a slot affects
  other sessions' scheduling.
- Later work must honour: slot count tracks `flink.max-sessions` (two per session); a
  change to session limits or to running more than one job per environment at once has
  to revisit `flink.cluster-slots`. The REST endpoint must stay on loopback.
