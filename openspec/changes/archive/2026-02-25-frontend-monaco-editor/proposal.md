## Why

The fiddle needs a browser-based SQL editor with syntax highlighting. Monaco Editor (the VS Code editor component) provides a production-grade editing experience from CDN with zero build tooling. The frontend must create a session on page load and send SQL to the backend on "Run." References blueprint section: "Frontend."

## What Changes

- Create `src/main/resources/static/index.html` as the single-page application shell
- Load Monaco Editor from CDN with SQL language mode
- Implement two editor panels: schema (DDL) and query (DQL/DML)
- On page load, create a session via `POST /api/sessions`
- On "Run" button click, send schema DDL then query to `POST /api/sessions/{id}/execute`
- Basic CSS layout with header, editor panels, and placeholder results area

## Capabilities

### New Capabilities
- `editor-ui`: HTML shell, Monaco Editor integration, session initialization, and SQL submission

### Modified Capabilities

## Impact

- **Code**: New `src/main/resources/static/index.html`, `static/css/style.css`, `static/js/app.js`
- **Dependencies**: Monaco Editor loaded from `cdn.jsdelivr.net` (no npm/build step)
- **UX**: Users can write and execute Flink SQL in the browser
