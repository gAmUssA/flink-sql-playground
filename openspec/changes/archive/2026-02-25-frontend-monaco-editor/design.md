## Context

The frontend is a single-page application served as static files from Spring Boot's `src/main/resources/static/` directory. No build tooling (webpack, npm) is needed — Monaco Editor is loaded from CDN. The UI follows SQL Fiddle's two-panel layout: schema on the left, query on the right.

## Goals / Non-Goals

**Goals:**
- Single HTML file with CSS and JS loaded from static resources
- Monaco Editor with SQL syntax highlighting in two panels
- Session creation on page load
- SQL submission on "Run" button click (schema DDL first, then query)

**Non-Goals:**
- Auto-completion or Flink-specific language support (post-MVP)
- Build tooling, bundling, or TypeScript (keep it simple)
- Results display (handled by `frontend-results-and-controls` change)

## Decisions

### 1. Monaco Editor from CDN
**Choice**: Load Monaco via `https://cdn.jsdelivr.net/npm/monaco-editor@latest/min/vs/loader.js`.
**Rationale**: Zero build step. Reliable CDN. SQL language mode is built-in. ~2 MB download cached by browser.
**Alternatives**: CodeMirror 6 — lighter (~200 KB) but less feature-rich. Custom `<textarea>` — no syntax highlighting.

### 2. Vanilla JavaScript (no framework)
**Choice**: Plain JS in a single `app.js` file.
**Rationale**: The UI is simple enough that a framework adds complexity without benefit. Easy to understand and modify.

### 3. Sequential DDL-then-query execution
**Choice**: On "Run", first send all schema DDL lines, then send the query.
**Rationale**: Tables must exist before queries reference them. Sequential execution ensures correct order.

## Risks / Trade-offs

- **[CDN dependency]** → Monaco loads from external CDN. If CDN is down, editor won't load. Acceptable for MVP; could vendor the files later.
- **[No offline support]** → Requires internet for CDN resources. Acceptable for a web-based tool.
