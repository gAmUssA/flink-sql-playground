# 0002. Train a JDK AOT cache in the runtime image

## Status

accepted

## Date

2026-10-06

## Context

With Railway app sleeping, every wake is a cold JVM start, and visitors wait for it.
JDK 25's AOT cache (JEP 483/514/515) stores classes the app loaded and linked in a training
run. A cache only loads with the same JVM build, the same jar files and compatible flags.

Options considered:

- Quarkus-recorded cache (`quarkus.package.jar.aot.*`, `phase=build`): rejected at runtime
  with "shared class paths mismatch" (a jar changed after recording), silently ignored.
- Quarkus integration-test training (`phase=integration-tests`): needs
  `@QuarkusIntegrationTest` suites, which the project does not have, and still records
  outside the runtime image.
- Train in the runtime image: run the packaged app there through startup and two queries.
- No cache.

## Decision

The `Dockerfile` runtime stage runs `scripts/aot-train.sh` against the copied fast-jar with
the `ENTRYPOINT`'s JVM flags, and `ENTRYPOINT` adds `-XX:AOTCache=app.aot`.
`--build-arg AOT_CACHE=false` skips training. `Dockerfile.runtime` (the multi-arch GHCR
image) is unchanged.

## Consequences

- Easier: process start to first result measured 3.53 s to 2.37 s locally with the shared
  MiniCluster, and 3.67 s to 1.74 s without it (`docs/STARTUP.md`).
- Harder: about 180-200 MB larger image and about 300 MB more RSS while awake; about 15 s longer image builds;
  the training JVM flags must stay in step with `ENTRYPOINT`, and any change of base image
  or jars invalidates and rebuilds the cache.
- Later work must honour: the cache is tied to the exact JVM build of the runtime image, so
  it must be trained in that image, never copied from another stage or machine.
