## Context

The app serves `index.html` from Spring Boot static resources. Browsers auto-request `/favicon.ico`, which currently returns a 404 and pollutes logs. The frontend is a single HTML file with inline CSS/JS references.

## Goals / Non-Goals

**Goals:**
- Eliminate favicon 404 log noise
- Show a recognizable icon in browser tabs
- Zero new files — embed everything inline

**Non-Goals:**
- Apple touch icons, web manifest, or PWA metadata
- Multiple favicon sizes or formats
- Dynamic or themeable favicons

## Decisions

**Decision 1: Inline SVG data URI vs. static `.ico` file**

Use an inline SVG data URI in a `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,...">` tag.

- *Alternative: static `favicon.ico` file* — Requires a binary file in the repo, an image editor to create, and adds a separate HTTP request. Rejected for unnecessary complexity.
- *Alternative: static `favicon.svg` file* — Simpler than `.ico` but still adds a file and request. Rejected since inline is even simpler.
- *Rationale*: Inline SVG is the simplest approach — one line in `index.html`, no new files, no extra requests, supported by all modern browsers.

**Decision 2: Icon design**

A `>_` SQL prompt symbol in Flink blue (`#E6526F` — Apache Flink brand pink) on a transparent background. Simple, recognizable, and relevant to a SQL playground.

## Risks / Trade-offs

- **[IE11 incompatibility]** → Not a concern; this app targets modern browsers only (Monaco Editor already requires ES2015+)
- **[Data URI size]** → SVG is ~200 bytes inline; negligible impact on HTML payload
