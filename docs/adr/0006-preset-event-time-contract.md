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
- `src/test/js/preset-watermarks.test.js` checks what only the SQL text can tell:
  - every promise is exactly `lossless` or `lossy`;
  - the watermark is on a `TIMESTAMP(3)` / `TIMESTAMP_LTZ(3)` column of the same table, as
    `col` or `col - INTERVAL 'n' UNIT`; any other shape fails loudly instead of being skipped;
  - the delay keeps the promise against the generator's scatter, which it reads from faker
    `date.past` or datagen `max-past`;
  - a `PROCTIME()` column is never named like an event time.
- Whether the SQL is valid Flink is the planner's job, not a regex's: `ExplainSmokeTest` plans
  every preset, and the planner refuses a window on a non-time column, a temporal join without a
  versioned table or a key equality, and a MATCH_RECOGNIZE ordered by anything but time. (A first
  version checked those with regular expressions; Copilot's review showed it both missed invalid
  SQL and rejected valid SQL, such as a deduplicated versioned view.)
- `PresetWatermarkSmokeTest` checks the promises on real Flink with the timeline probe, sources
  ten times faster with the scatter unchanged. Every recording must end cleanly: not truncated,
  every row seen, and at least one watermark. A lossless preset has each of its watermarked
  tables probed on its own (both inputs of the temporal join), and no row may arrive behind its
  watermark, which holds at any pace. A lossy preset must have a row that missed at least one of
  its windows (partial losses in HOP or CUMULATE count).
- Streaming jobs that fail mid-stream now report the failure instead of ending as if every row
  had arrived; the smoke test relies on that, and so does the results view.
- Presets aggregate inside the window and enrich afterwards (Brewmaster now does, and says that
  the joins after the window still keep state). Processing-time presets name the column
  `proc_time` (or describe arrival, as in the interval join, which now matches each shipment to
  its own order) and say in a comment that PROCTIME needs no WATERMARK.
- The temporal join reads a versioned view built the way Flink documents for an append-only
  stream (latest row per key by event time with ROW_NUMBER), not a PRIMARY KEY declared on an
  insert-only faker table. It is a LEFT JOIN, so a transaction older than its currency's first
  rate keeps a NULL rate instead of vanishing. The editor's autocomplete now reads view columns.
- The lossy "Late Data" preset is paced at 50 rows per second, so its loss comes from many
  periodic watermarks rather than from where one timer tick happens to fall, and its comments
  separate a late row (behind the watermark, still counted) from a dropped one (its window had
  fired).

## Consequences

- Easier: a new event-time preset has to say what its watermark is for, and the build checks
  the claim twice, once from the SQL and once by running it.
- Deferred: the E-Commerce and Brewmaster "dimension" tables declare PRIMARY KEYs on insert-only
  faker data too, so regular joins treat duplicate inserts as unique keys. That is not about
  event time; it is tracked as bean flink-sql-playground-nhqw.
- Harder: a generator whose scatter the static test cannot read (anything other than faker
  `date.past` or datagen `max-past`) needs the test taught first.
- The lossy check on real Flink depends on how fast the generator emits relative to the
  watermark. If a Flink or connector upgrade changes that, the smoke test fails rather than
  the preset going quietly wrong.
