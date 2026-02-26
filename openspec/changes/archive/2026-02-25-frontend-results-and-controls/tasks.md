## 1. Results Table

- [x] 1.1 Implement `renderResults(response)` function in app.js that builds an HTML `<table>` from the API response: `<thead>` with column names, `<tbody>` with row data. Replace the results div content. Acceptance: query results render as a styled table.
- [x] 1.2 Add CSS classes for the results table: borders, padding, alternating row colors, header styling. Acceptance: table is readable and professional.

## 2. Changelog Color Coding

- [x] 2.1 When rendering rows, add CSS class based on rowKind: `row-insert` (+I, green), `row-update-after` (+U, blue), `row-update-before` (-U, red), `row-delete` (-D, red). Prepend a RowKind column to the table. Acceptance: streaming results have colored rows.
- [x] 2.2 Add CSS rules for color classes: `.row-insert`, `.row-update-after`, `.row-update-before`, `.row-delete`. Acceptance: colors are visible and distinguishable.

## 3. Mode Toggle

- [x] 3.1 Add select for BATCH/STREAMING mode selection in the control bar, defaulting to STREAMING. Acceptance: toggle renders and reflects selection.
- [x] 3.2 Include selected mode in the execute request body as `"mode": "BATCH"` or `"mode": "STREAMING"`. Acceptance: mode is sent with each execution request.

## 4. Execution Metadata

- [x] 4.1 Display row count and execution time below the results table (e.g., "50 rows in 2.3s"). Show truncation warning if `truncated` is true. Acceptance: metadata appears after each execution.

## 5. Share Button

- [x] 5.1 Add "Share" button to control bar. On click, send `POST /api/fiddles` with current schema, query, and mode. Construct URL `/f/{shortCode}` and copy to clipboard via `navigator.clipboard.writeText()`. Show confirmation tooltip. Acceptance: clicking Share copies a URL.

## 6. URL Routing

- [x] 6.1 On page load, check `window.location.pathname` for `/f/{shortCode}` pattern. If matched, call `GET /api/fiddles/{shortCode}` and populate editors with the response. Acceptance: navigating to `/f/abc123` loads the fiddle.
- [x] 6.2 Add a Spring Boot `@Controller` forwarding `/f/**` to `index.html` for SPA routing. Acceptance: `/f/abc123` serves the HTML page instead of 404.
