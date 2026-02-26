## Context

The app has a 30-second execution timeout (`SecurityConstants.EXECUTION_TIMEOUT_SECONDS`). Streaming window queries using PROCTIME() need wall-clock time to pass before windows close and emit results. The Cumulate example's 30-second max window hits the timeout boundary.

## Goals / Non-Goals

**Goals:**
- Cumulate example reliably produces results within ~10 seconds
- Hopping example produces results within ~5 seconds (down from ~10s)
- Examples remain pedagogically clear — intervals should be human-readable round numbers

**Non-Goals:**
- Changing the execution timeout
- Modifying the Tumbling Window example (already at 10s, works fine)
- Changing the datagen rows-per-second rates

## Decisions

**Decision 1: Cumulate intervals → 2s step / 10s max window**

First partial result at ~2s, full window at ~10s. Leaves 20s headroom before timeout. The 2s/10s ratio (5 cumulative expansions) still demonstrates the progressive aggregation concept clearly.

*Alternative: 3s step / 15s max* — works but leaves less headroom and 3s/15s is less intuitive than 2s/10s.

**Decision 2: Also fix Hopping intervals → 5s slide / 15s size**

The Hopping Window currently uses 10s slide / 30s size — first result at ~10s with the same timeout risk. Shrinking to 5s/15s puts first result at ~5s.

*Alternative: leave Hopping as-is* — it works today but is borderline. Fixing proactively avoids future reports.

## Risks / Trade-offs

- **[Faster output = less data per window]** → Acceptable; examples are for learning, not benchmarking. More frequent results are actually better for demonstrating streaming behavior.
