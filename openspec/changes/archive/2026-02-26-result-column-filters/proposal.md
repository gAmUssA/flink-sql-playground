## Why

Query results often return many rows (up to 1000), making it hard to find specific data. Users need a way to quickly filter the visible rows by column values without re-running queries. This is especially useful for streaming results where changelog operations (`+I`, `-U`, `+U`, `-D`) mix together.

## What Changes

- Add a filter input row below the results table header, with one text input per column
- Typing in a filter input instantly hides rows that don't contain the filter text (case-insensitive substring match)
- The "op" column filter enables filtering by row kind (e.g., typing `+I` shows only inserts)
- Filtered row count updates in the metadata bar (e.g., "showing 12 of 50 rows")
- Clearing all filters restores the full result set
- Filters are purely client-side — no backend changes

## Capabilities

### New Capabilities
- `result-column-filters`: Per-column text filter inputs in the results table that narrow visible rows via client-side substring matching

### Modified Capabilities
- `results-controls`: Updates metadata display to show filtered vs total row count

## Impact

- `src/main/resources/static/js/app.js` — modify `renderResults()` to add filter row and filtering logic
- `src/main/resources/static/css/style.css` — add styles for filter inputs in the table header
- No backend changes, no new dependencies
