## 1. Example Data

- [x] 1.1 Create `src/main/resources/static/js/examples.js` exporting an array of example objects, each with `title`, `schema`, `query`, and `mode` fields. Acceptance: JavaScript file loads without errors.
- [x] 1.2 Write example 1 — "Simple Aggregation": datagen table with user_id and amount fields, `SELECT user_id, SUM(amount) GROUP BY user_id`. Acceptance: executes in under 10 seconds.
- [x] 1.3 Write example 2 — "Tumbling Window": datagen table with PROCTIME() and `TUMBLE(event_time, INTERVAL '10' SECOND)`. Acceptance: produces windowed results.
- [x] 1.4 Write example 3 — "Hopping Window": similar to tumbling but with `HOP(click_time, INTERVAL '10' SECOND, INTERVAL '30' SECOND)`. Acceptance: produces overlapping window results.
- [x] 1.5 Write example 4 — "Cumulate Window": `CUMULATE(view_time, INTERVAL '5' SECOND, INTERVAL '30' SECOND)`. Acceptance: produces progressive aggregation results.
- [x] 1.6 Write example 5 — "Interval Join": two datagen tables joined by key with time constraint. Acceptance: join produces results.
- [x] 1.7 Write example 6 — "Batch vs Streaming": same query with a comment explaining different behavior in batch (final results) vs streaming (changelog). Default mode set to STREAMING. Acceptance: running in both modes shows different output patterns.

## 2. Frontend Integration

- [x] 2.1 Add `<select>` dropdown in the control bar listing all example titles plus a "Custom" option. Acceptance: dropdown renders with all titles.
- [x] 2.2 Add change handler on dropdown that populates schema and query editors with the selected example's content. Acceptance: selecting an example fills both editors.
- [x] 2.3 On page load (when no `/f/` path), auto-select and load the first example. Acceptance: fresh page shows example 1 in editors.
