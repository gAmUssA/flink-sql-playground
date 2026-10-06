# 0003. Bundle a CodeMirror 6 editor instead of loading Monaco from a CDN

## Status

accepted

## Date

2026-10-06

## Context

The SQL editors were Monaco 0.52.2, loaded at runtime from jsDelivr through its AMD loader.
On a phone the first load fetched about 1 MB of editor code from a third-party origin, the
CSP had to allow jsDelivr for scripts, styles, fonts, XHR and blob workers, and Lighthouse
mobile Performance scored 55. Monaco also has weak touch support.

Options considered:

- Keep Monaco, self-hosted: removes the CDN, but keeps the size and the touch problems.
- A plain `<textarea>` with no highlighting: smallest, but loses autocomplete and highlighting.
- CodeMirror 6 with `@codemirror/lang-sql`: modular, built for touch and screen readers, about
  140 KB gzipped for what the playground uses, with a SQL dialect and schema-aware completion.

## Decision

Use CodeMirror 6 with a Flink SQL dialect (`src/main/frontend/editor.js`). esbuild bundles it
into `js/editor.bundle.js` at build time; the bundle is generated, not committed. Every build
path bundles it first: the Gradle `bundleEditor` task (before `processResources`), a Node stage
in the Dockerfile, and the Pages and browser-test workflows. The CSP drops jsDelivr and
`worker-src blob:`.

The editors take their colours and font from the theme's CSS variables, so theme changes
need no editor call. Autocomplete offers keywords plus the session's table and column names.

## Consequences

- Easier: one origin for all scripts; first-load transfer of about 240 KiB; mobile
  Performance 90; touch selection and the soft keyboard work natively.
- Harder: building the backend now needs Node 22.19+ and `npm ci --omit=dev` first, and the
  Docker build has an extra Node stage.
- Later work must keep the editor surface in `editor.js` (`getValue`, `setValue`,
  `setTables`, `layout`, `focus`) when changing the editor, and must keep `editor.bundle.js`
  out of version control. The static-site build refuses to run without the bundle.
