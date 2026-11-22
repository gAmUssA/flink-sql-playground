# 0005. Record the watermark timeline with a separate probe job

## Status

accepted

## Date

2026-11-22

## Context

Watermarks are where Flink SQL users most often go wrong. A watermark that is too tight drops
late records without any error, and before this change the playground could only say so in
SQL comments. The Timeline tab should show, for each record, its event time against the
watermark at the moment the record arrived, which windows had already fired, and so which
records were dropped.

The data has to come from Flink. Flink exposes the watermark per record through
`CURRENT_WATERMARK(rowtime)`, which returns the watermark of the operator evaluating it. Options
considered:

- **Rewrite the user's query** to carry `CURRENT_WATERMARK` alongside its results. Most
  queries aggregate or join, so the per-record values do not survive to the output, and a
  rewritten query is no longer the query the user wrote and learns from.
- **Instrument the user's job** (a side output, a metrics reporter). The SQL API does not
  expose per-record watermarks that way.
- **Run a separate probe job** over the query's watermarked source:
  `SELECT rowtime, CURRENT_WATERMARK(rowtime) FROM table`. The probe applies the table's own
  WATERMARK definition, so each record is judged against the same watermark a window over
  that table sees: the probe's projection sits where the window's input would, behind the
  same watermark assigner, at parallelism 1.

## Decision

- `POST /api/sessions/{id}/timeline/stream` (NDJSON, streaming mode only) plans the user's query
  with `/explain` (ADR 0004), so validation, the forbidden-SQL checks and 400 errors are the
  same. It walks the plan's source scans in plan order (left input first) and takes the first
  table whose catalog schema declares a WATERMARK. The rowtime column and the watermark
  expression come from the catalog (`ResolvedSchema#getWatermarkSpecs`), not from the plan
  text: a source with watermark push-down prints no `WatermarkAssigner` node.
- The windows come from the plan: the `window` attribute of a window aggregate, join, rank,
  dedup or TVF node (`TUMBLE(... size=[10 s])`, `HOP`, `CUMULATE`, and legacy
  `TumblingGroupWindow`). SESSION windows have no fixed bounds and are drawn without bands.
  Offsets may be negative. A spec that puts one record in more than 64 windows (a 1 h HOP
  sliding every second is 3,600) is drawn as windowless with a note, since classifying it
  would cost millions of steps per redraw in the browser.
- The probe identifiers are quoted from the catalog path, never taken from user text. The
  probe runs under the same limits as a query stream (row cap, wall-clock cap, cancel on
  disconnect) through `SqlExecutionService#streamRows`.
- Times are sent as epoch milliseconds of the wall-clock value Flink windows by: a TIMESTAMP
  as is, and a TIMESTAMP_LTZ converted into the session time zone. Window starts are aligned
  to the size (plus any offset) on that clock, which is how Flink aligns them.
- The browser (`js/watermark-timeline.js`) decides each record's fate the way Flink's window
  operators do. A window has fired when `watermark >= window_end - 1 ms`. A record whose
  windows had all fired when it arrived is **dropped**. One whose windows only partly fired
  (HOP, CUMULATE) **missed some windows**: Flink 2.3's slice-based window aggregation drops a
  record only once its last window has fired, and otherwise keeps it for the windows still
  open, so the fired ones simply lack it (checked against the packaged
  `SliceSharedSyncStateWindowAggProcessor` in Copilot's review). One behind the watermark whose window was still
  open is **late but counted**. Without windows, a record behind the watermark is **late**.
- **The probe reads its own sample of the stream.** Generated sources (datagen, faker) produce
  new rows on every read, so the timeline's records and counts are not the rows of the user's
  run. The pattern, how far the watermark trails and what share is dropped, is the same. The
  UI says "a sample of the stream" in its first line and explains why the numbers differ.
- **The probe runs only when someone is looking.** It starts when a streaming run starts with
  the Timeline tab open, when the tab is opened during a run, or with the tab's "Record
  timeline" button. Stop, a new Run, leaving the tab, switching to batch mode and loading a
  preset all stop it. A run on any other tab starts no probe, so the extra job, and its
  MiniCluster slot, are spent only while someone views the timeline. On the server, a client
  that leaves after the probe was submitted but before the first frame gets the job cancelled
  as well; after that, `streamRows` cancels it on disconnect, row cap or deadline.
- The chart zooms on a range of records (drag across it, the zoom buttons, or a trackpad
  pinch), with event time refitted to what is visible. Every point where the watermark
  advances is marked; zoomed in to 90 records or fewer, each step is labelled with how far it
  jumped, and window fire lines with how many rows the window counted. With periodic watermarks
  the steps are what Flink actually emits: a fast bounded faker table may see only two.
- The tab is always visible. Without event time it explains why there is no timeline (400
  `NO_EVENT_TIME`); in batch mode it says watermarks belong to streaming mode.
- A canonical preset, "Watermark Timeline: who misses the window", ships with it: datagen
  clicks that arrive up to 10 s after their event time, a 2 s watermark and 5 s tumbling
  windows. `TimelineSmokeTest` runs it and checks that the 2 s watermark drops clicks and an
  11 s one drops none.

## Consequences

- Easier: the playground shows the latency-versus-completeness trade-off directly: a red dot
  for every record the window never counted.
- Harder: a timeline costs a second job and a slot for as long as it records. Its counts never
  match the results table exactly for generated data; anyone demoing it should call it a
  sample of the stream.
- The record-by-record match relies on the probe's projection seeing the watermarks in the
  same order as the user's window operator. That holds at parallelism 1, which the
  playground uses. With parallel sources, watermarks would be per subtask and the probe would
  show one subtask's view.
- Later work: a deterministic source (or seeded datagen) would let the timeline trace the
  user's own run, record for record.
