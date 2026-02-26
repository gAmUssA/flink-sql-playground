## Context

The frontend already has Monaco editors and session management (from `frontend-monaco-editor` change). This change adds the interactive controls and result visualization that complete the user experience.

## Goals / Non-Goals

**Goals:**
- HTML table rendering of query results with column headers
- Color-coded changelog rows for streaming mode
- Batch/streaming toggle that sets the execution mode
- Share button that saves and generates a shareable URL
- URL routing to load fiddles from `/f/{shortCode}` paths

**Non-Goals:**
- Charts or visualization beyond tabular data (post-MVP)
- Result pagination (1000 row limit is sufficient)
- Download/export of results

## Decisions

### 1. Dynamic HTML table for results
**Choice**: Build `<table>` elements dynamically in JavaScript from the API response.
**Rationale**: Simple, no dependency. Results are always tabular with known column structure.

### 2. CSS class-based color coding
**Choice**: Assign CSS classes per RowKind: `.row-insert` (green), `.row-update-after` (blue), `.row-update-before` / `.row-delete` (red).
**Rationale**: Clean separation of styling from logic. Easy to adjust colors.

### 3. History API for URL routing
**Choice**: Use `window.location.pathname` to detect `/f/{shortCode}` and `history.pushState()` for share URLs.
**Rationale**: Clean URLs, no hash fragments. Spring Boot needs a catch-all route to serve `index.html` for these paths.

### 4. Spring Boot catch-all route
**Choice**: Add a `@Controller` that forwards `/f/**` to `index.html` so the SPA handles routing.
**Rationale**: Required for client-side routing with clean URLs.

## Risks / Trade-offs

- **[Large result tables]** → 1000 rows in a DOM table may be slow to render. Acceptable for MVP; could add virtual scrolling later.
- **[Clipboard API for share]** → `navigator.clipboard.writeText()` requires HTTPS or localhost. Works in development, needs HTTPS in production.
