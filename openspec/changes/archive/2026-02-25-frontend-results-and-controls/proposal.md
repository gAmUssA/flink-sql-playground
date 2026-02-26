## Why

Users need to see query results in a table, toggle between batch and streaming modes, share fiddles via URL, and load shared fiddles. This change adds the results display, control bar, and URL routing that complete the interactive experience. References blueprint sections: "Frontend" and "Architecture — shareable link system."

## What Changes

- Render query results in an HTML table with column headers and row data
- Color-code streaming changelog rows: green for `+I`, red for `-D`/`-U`, blue for `+U`
- Add batch/streaming toggle control
- Add "Share" button that saves the fiddle and copies the URL
- Implement URL routing: detect `/f/{shortCode}` paths, load fiddle content into editors
- Show execution metadata: row count, execution time, truncation warning

## Capabilities

### New Capabilities
- `results-controls`: Results table rendering, changelog color coding, mode toggle, share button, and URL routing for fiddle loading

### Modified Capabilities

## Impact

- **Code**: Modifications to `static/js/app.js` and `static/css/style.css`
- **UX**: Complete interactive loop — write, run, see results, share
