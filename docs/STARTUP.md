# Startup & cold-start performance

Goal: reduce backend startup so the service is viable for **serverless / scale-to-zero**
deployment (instances spin up on demand). This document records the baseline and the
optimization options.

## Why not GraalVM native image?

A native image was the first idea but it is **not feasible** for this backend. Flink SQL
uses **runtime code generation**: `org.apache.flink.table.runtime.generated.CompileUtils`
compiles generated Java *source* into new classes at runtime via **Janino**
(`compile(ClassLoader, name, code)`, `compileExpression(...)`), bundled inside
`flink-table-runtime`. GraalVM native image is a **closed world** — it cannot define new
classes at runtime — so a native build would succeed but crash on the first real query.
Because the playground runs arbitrary user SQL, this codegen is inherent and unavoidable.
(Native is only possible if Flink is evicted from the process, e.g. an external Flink SQL
Gateway — a separate re-architecture.)

So the startup work targets the **JVM**: AppCDS, JVM tuning, and possibly CRaC.

## Baseline

Measured with [`scripts/measure-coldstart.py`](../scripts/measure-coldstart.py) on the
packaged fast-jar, using the production JVM flags from the `Dockerfile`
(`-Xms768m -Xmx1536m -XX:+UseZGC -XX:+ZGenerational -XX:MetaspaceSize=128m -XX:MaxMetaspaceSize=384m`).
Environment: Apple Silicon, JDK 25 (Temurin), warm disk, median of 3 runs.

| Phase | Median |
|---|---|
| Quarkus boot (self-reported `started in`) | **1.39 s** |
| Process start → HTTP ready (`/api/build-info` 200) | **1.53 s** |
| **Cold first query** (lazy MiniCluster init + first Janino codegen) | **2.69 s** |
| **Total: process start → first query result** | **5.13 s** |
| Warm query (same query, second time) | 0.96 s |
| Idle RSS | **~954 MB** |

### Reading the baseline

- **Boot (~1.4 s) is the minority of cold start.** The dominant cost is the **first
  query (~2.7 s)** — Flink MiniCluster startup (Pekko/Netty) plus Janino runtime
  compilation of the generated operators. Total cold-start-to-first-result ≈ **5.1 s**.
- **Implication for optimization:**
  - **AppCDS** speeds class loading during boot → helps the ~1.4 s boot slice; limited
    effect on the ~2.7 s first-query cost. Expect a modest cut to *total* cold start.
  - The big serverless lever is the **first-query Flink init**, which only a *warm*
    checkpoint/restore (**CRaC**) would eliminate — but that is experimental with Flink's
    sockets/threads.
- **Footprint:** idle RSS ≈ 954 MB is driven partly by `-Xms768m` pre-committing heap;
  lowering `-Xms` is a separate cost/footprint lever for memory-priced serverless.

### Caveats

These are **JVM-level cold starts on a warm disk**. A real serverless cold start also pays
container image pull, cold page cache, and (often) slower/throttled vCPU, so absolute
numbers will be higher in production. Treat this table as a **relative baseline** for
measuring the delta from each optimization, not as a production SLA.

## Reproduce

```bash
./gradlew quarkusBuild                       # build the fast-jar (JDK 25)
python3 scripts/measure-coldstart.py         # baseline (3 runs)
python3 scripts/measure-coldstart.py --label appcds   # after enabling AppCDS, compare
```

## Next steps

1. **AppCDS** — enable Quarkus AppCDS generation, re-measure, compare to this baseline.
2. Consider JVM-tuning levers (`-Xms`, tiered compilation) for cold start vs footprint.
3. Evaluate **CRaC** as the aggressive experiment if first-query latency must approach zero.
