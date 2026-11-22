# 0006. Every preset states what its watermark does, and tests hold it to that

## Status

accepted

## Date

2026-11-22

## Context

The presets are how most people learn Flink SQL in the playground, so a preset that teaches the
wrong thing is worse than no preset. An audit of all 16 presets against Flink 2.3 semantics
(with the watermark timeline from ADR 0005 as the measuring tool) found:

- Every WATERMARK was valid syntax, and every event-time preset already did what its comments
  said. Measured with the timeline probe, the 15-second watermarks over 15 seconds of faker
  scatter lose nothing. "Late Data" (5 s over 15 s) drops about a quarter of its rows, and the
  "Watermark Timeline" preset (2 s over 10 s) about 40%.
- Three processing-time presets named their `PROCTIME()` column like an event time
  (`event_time AS PROCTIME()` in Tumbling Window and Brewmaster). That teaches the wrong model.
- Brewmaster joined first and grouped by `window_start, window_end` afterwards. That is not a
  window aggregation: Flink plans a plain `GroupAggregate` that updates forever and never
  frees state (the Job Graph tab shows `[I,UB,UA]`, "state grows with keys").
- With faker emitting a bounded table in about 100 ms, the watermark advances only twice. The
  loss in "Late Data" depends on that, which is real Flink behavior but easy to break by
  changing the generator.

Nothing stopped a future preset, or an edit to one, from quietly breaking any of this.

## Decision

- `src/test/resources/preset-watermarks.json` lists every preset that declares a WATERMARK and
  promises either `lossless` (the delay covers the generator's disorder, so no row is late) or
  `lossy` (the preset drops late rows on purpose). A watermarked preset without a promise, or
  a promise without a preset, fails the build.
- `src/test/js/preset-watermarks.test.js` checks the SQL text of every preset:
  - the watermark is on a `TIMESTAMP(3)` / `TIMESTAMP_LTZ(3)` column of the same table, as
    `col` or `col - INTERVAL 'n' UNIT`;
  - the delay keeps the promise against the generator's scatter, which it reads from faker
    `date.past` or datagen `max-past`;
  - window TVFs and MATCH_RECOGNIZE use a time attribute;
  - an event-time temporal join reads a versioned table (PRIMARY KEY and WATERMARK);
  - a `PROCTIME()` column is never named like an event time.
- `PresetWatermarkSmokeTest` checks the same promises on real Flink. It runs the timeline probe
  over each watermarked preset, ten times faster, with the scatter unchanged. A lossless preset
  may have no row behind the watermark; a lossy one must lose rows.
- Presets aggregate inside the window and enrich afterwards (Brewmaster now does). Processing-time
  presets name the column `proc_time` (or describe arrival, as in the interval join) and say
  in a comment that PROCTIME needs no WATERMARK.

## Consequences

- Easier: a new event-time preset has to say what its watermark is for, and the build checks
  the claim twice, once from the SQL and once by running it.
- Harder: a generator whose scatter the static test cannot read (anything other than faker
  `date.past` or datagen `max-past`) needs the test taught first.
- The lossy check on real Flink depends on how fast the generator emits relative to the
  watermark. If a Flink or connector upgrade changes that, the smoke test fails rather than
  the preset going quietly wrong.
