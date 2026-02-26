## 1. HTML Shell

- [x] 1.1 Create `src/main/resources/static/index.html` with semantic HTML structure: header with app title, main area with two editor containers (schema and query), a placeholder results div, and a control bar with "Run" button. Acceptance: page renders in browser with visible layout.
- [x] 1.2 Create `src/main/resources/static/css/style.css` with flexbox layout: side-by-side editor panels (50/50 split), results area below, control bar between editors and results. Acceptance: layout is responsive and editors fill available space.

## 2. Monaco Editor Integration

- [x] 2.1 Add Monaco Editor loader script tag from `cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/loader.js` to index.html. Acceptance: `require` global is available after page load.
- [x] 2.2 Create `src/main/resources/static/js/app.js` that initializes two Monaco editor instances with SQL language mode — one in the schema container and one in the query container. Acceptance: both editors render with SQL syntax highlighting.

## 3. Session Management

- [x] 3.1 On page load (`DOMContentLoaded`), call `POST /api/sessions` via `fetch()`, parse the JSON response, and store `sessionId` in a module-level variable. Acceptance: session ID is available for subsequent API calls.
- [x] 3.2 Handle session creation errors gracefully — display an alert if session limit is reached. Acceptance: user sees error message on 429 response.

## 4. SQL Execution

- [x] 4.1 Add click handler on "Run" button that reads schema editor content, sends it to `POST /api/sessions/{id}/execute` (if non-empty), then reads query editor content and sends it to the same endpoint. Acceptance: schema DDL is executed before query.
- [x] 4.2 Display raw JSON response in the results div as a placeholder until the results-and-controls change adds proper rendering. Acceptance: query results appear as JSON text.
