## Context

Flink SQL Fiddle is a vanilla JS frontend (no build system) that loads Monaco Editor from CDN. New users see a multi-panel interface with no guidance on the workflow: define schema DDL → build schema → write query → run query. Adding an interactive tour requires a lightweight, CDN-loadable library that matches the existing architecture pattern.

Key UI elements targeted by the tour (all present in index.html):
- `#schema-editor` — Monaco Editor for DDL
- `#query-editor` — Monaco Editor for queries
- `#build-schema-btn` — builds schema from DDL
- `#run-query-btn` — executes the query
- `#mode-select` — STREAMING / BATCH toggle
- `#example-select` — pre-built examples dropdown
- `#share-btn` — share fiddle button
- `#results-container` — query results panel
- `#schema-browser` — sidebar showing table metadata

## Goals / Non-Goals

**Goals:**
- Guide first-time users through the complete workflow (schema → build → query → run)
- Provide on-demand access to the tour via a header button
- Persist "don't show again" preference across sessions
- Keep implementation CDN-only with zero build changes

**Non-Goals:**
- Analytics or telemetry on tour completion
- Multi-page or multi-step tutorial (just a single linear tour)
- Customizing tour content per user or per session
- Supporting browsers without localStorage

## Decisions

### 1. Driver.js 1.4.0 via CDN

**Choice:** Load Driver.js from `cdn.jsdelivr.net/npm/driver.js@1.4.0/dist/driver.js.iife.js` and its CSS from the same CDN.

**Why:** Same CDN-loading pattern as Monaco Editor. Driver.js is ~5KB gzipped, has zero dependencies, provides highlight-and-popover tour functionality out of the box, and works with any DOM — no framework adapter needed.

**Alternatives considered:**
- **Intro.js** — heavier (~30KB), requires license for commercial use
- **Shepherd.js** — depends on Popper.js, more complex setup
- **Custom implementation** — unnecessary complexity for a standard walkthrough

### 2. Tour steps in app.js

**Choice:** Define tour step configuration as a function in `app.js` that returns the `driver()` options object with all steps.

**Why:** Tour steps reference the same DOM element IDs already used by the app. Keeping them in `app.js` means they stay near the elements they describe. A separate `tour.js` file would add a script tag for ~50 lines of config.

**Step sequence (matches the actual workflow):**
1. Welcome (no element — popover-only modal)
2. Schema Editor (`#schema-editor`)
3. Query Editor (`#query-editor`)
4. Mode Selector (`#mode-select`)
5. Examples Dropdown (`#example-select`)
6. Build Schema Button (`#build-schema-btn`)
7. Run Query Button (`#run-query-btn`)
8. Results Panel (`#results-container`)
9. Share Button (`#share-btn`)
10. Schema Browser (`#schema-browser`)

### 3. First-visit welcome dialog via Driver.js modal step

**Choice:** Use a Driver.js step with no `element` (renders as a centered popover) for the welcome dialog. Include a "Don't show again" checkbox by embedding an `<input type="checkbox">` in the step's `description` HTML.

**Why:** Avoids building a separate modal component. Driver.js already supports HTML in description fields and centered popovers when no element is specified. The checkbox state is read in the `onDestroyStarted` callback to persist the preference.

**Alternatives considered:**
- **Custom modal dialog** — more code to build, position, and style; would look different from tour popovers
- **Browser `confirm()` prompt** — no checkbox option, poor UX

### 4. localStorage key: `flink-fiddle-tour-dismissed`

**Choice:** Store a boolean (`"true"`) in `localStorage` under key `flink-fiddle-tour-dismissed`. On page load, check this key — if set, skip the first-visit prompt.

**Why:** Simple, no expiration needed. The Tour button in the header always allows re-triggering regardless of this preference.

### 5. Tour button in the header

**Choice:** Add a "Tour" button in the `<header>` element, styled as a subtle secondary button alongside the brand area.

**Why:** Always accessible, doesn't clutter the main toolbar. The header has space to the right of the brand/title.

## Risks / Trade-offs

- **CDN availability** — If jsdelivr is down, the tour won't load. → Mitigation: Tour is non-essential; the app works fine without it. Driver.js CSS/JS loading is async and non-blocking.
- **DOM element ID changes** — If element IDs are renamed, tour steps will silently skip. → Mitigation: IDs are stable and referenced throughout app.js; changes would break other things too.
- **Driver.js version updates** — Pinned to 1.4.0 to avoid breaking changes. → Mitigation: Same pinning strategy used for Monaco Editor.
- **localStorage cleared** — Tour prompt reappears if user clears browser data. → Acceptable; the prompt is non-intrusive.
