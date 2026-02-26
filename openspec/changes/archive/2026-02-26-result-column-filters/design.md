## Context

The results table in `app.js` (`renderResults()`) builds an HTML `<table>` with a `<thead>` header row and `<tbody>` data rows. The table includes an "op" column for row kinds plus one column per result column. Results can contain up to 1000 rows. The metadata bar below shows row count and execution time. All rendering is client-side — the backend returns JSON with `columns`, `rows`, `rowKinds`, `rowCount`, `truncated`, and `executionTimeMs`.

## Goals / Non-Goals

**Goals:**
- Users can type in per-column filter inputs to narrow visible rows instantly
- Filtering is case-insensitive substring matching
- The "op" column is filterable too (e.g., filter to `+I` only)
- Metadata updates to show "showing N of M rows" when filters are active
- Filters are fast enough for 1000 rows with no perceptible lag

**Non-Goals:**
- Regex or advanced query syntax in filters
- Column sorting (separate feature)
- Persisting filters across query executions
- Server-side filtering or pagination

## Decisions

**Decision 1: Filter row in `<thead>` below column headers**

Add a second `<tr>` inside `<thead>` containing `<input type="text">` elements, one per column (including "op"). This keeps filters visually attached to headers and sticky when scrolling.

*Alternative: Filter bar above the table* — Separates filters from the columns they apply to. Harder to match visually.

**Decision 2: Event-driven filtering with `input` event**

Each filter input listens for the `input` event. On every keystroke, iterate all `<tbody>` rows and toggle `display: none` based on whether the row's cell text contains the filter string (case-insensitive). Store the filter values in a simple array.

*Alternative: Debounced filtering* — Unnecessary for 1000 rows; `input` event is fast enough.

**Decision 3: Row visibility via `display` style, not DOM removal**

Hide non-matching rows with `style.display = 'none'` rather than removing them from the DOM. This preserves row ordering and makes clearing filters instant.

**Decision 4: Update metadata bar with visible count**

After each filter pass, count visible rows and update the metadata text. When filters are active: `"showing 12 of 50 rows in 234ms"`. When cleared: revert to original `"50 rows in 234ms"`.

**Decision 5: Clear-all button**

Add a small "x" button in the filter row that clears all filter inputs and restores all rows. Appears only when at least one filter is active.

## Risks / Trade-offs

- **[Performance with 1000 rows]** → Iterating 1000 rows × N columns on each keystroke. At ~12 columns max, this is ~12K string comparisons — negligible for modern browsers. No mitigation needed.
- **[Filter inputs consume vertical space]** → The filter row adds ~30px to the header area. Acceptable trade-off for discoverability. Inputs use compact styling to minimize impact.
- **[Filters reset on new query]** → By design. Stale filters on new results would confuse users.
