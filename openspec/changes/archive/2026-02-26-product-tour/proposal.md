## Why

New users landing on Flink SQL Fiddle face a blank interface with multiple panels (Schema DDL, Query, mode selector, examples dropdown, results) and no guidance on the workflow: build schema first, then run query. An interactive walkthrough tour reduces time-to-first-query by highlighting each UI element in sequence. Using Driver.js (lightweight, no-dependency library) keeps the implementation simple and CDN-loadable like Monaco Editor.

## What Changes

- Add Driver.js via CDN and create a guided tour highlighting: schema editor, query editor, mode selector, examples dropdown, Build Schema button, Run Query button, Share button, results panel, and schema browser
- On first visit, show a welcome dialog asking if the user wants a guided tour, with a "Don't show again" checkbox that persists the preference in localStorage
- Add a "Tour" button in the header for on-demand access to the walkthrough at any time
- Store the "don't ask again" preference in localStorage so it survives page reloads

## Capabilities

### New Capabilities
- `product-tour`: Interactive walkthrough tour using Driver.js that guides new users through the UI, with first-visit prompt and on-demand trigger

### Modified Capabilities
_(none — this is purely additive UI, no existing spec requirements change)_

## Impact

- `src/main/resources/static/index.html` — add Driver.js CDN link, add Tour button in header
- `src/main/resources/static/js/app.js` — add tour step definitions, first-visit logic, localStorage preference handling
- `src/main/resources/static/css/style.css` — add styles for Tour button and welcome dialog
- No backend changes, no new server dependencies (Driver.js loaded from CDN)
