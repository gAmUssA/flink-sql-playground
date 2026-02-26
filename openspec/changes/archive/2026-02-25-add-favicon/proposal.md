## Why

Browsers request `/favicon.ico` on every page load. Without one, Spring Boot logs a `NoHandlerFoundException` or returns a Whitelabel error page for the missing resource, cluttering server logs with 404 noise. Adding a simple SVG favicon eliminates these errors and gives the app a polished identity in browser tabs.

## What Changes

- Add an inline SVG favicon using a `<link rel="icon">` tag in `index.html` — no external file needed
- The favicon will use a simple Flink-inspired design (a ">" SQL prompt icon)
- Zero new dependencies, zero new files beyond the HTML edit

## Capabilities

### New Capabilities

- `favicon`: Inline SVG favicon served via the HTML `<link>` tag

### Modified Capabilities

None — no existing spec requirements change.

## Impact

- **File modified**: `src/main/resources/static/index.html` (add `<link rel="icon">` to `<head>`)
- **No new dependencies**
- **No API changes**
- Eliminates favicon 404 log noise in development and production
