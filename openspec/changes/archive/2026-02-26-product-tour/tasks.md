## 1. CDN Integration

- [x] 1.1 Add Driver.js CSS (`driver.css`) link to `<head>` in `index.html` — verify it loads alongside Monaco Editor styles
- [x] 1.2 Add Driver.js script (`driver.js.iife.js`) tag in `index.html` before `app.js` — verify `window.driver.js.driver` is accessible

## 2. Tour Button

- [x] 2.1 Add a "Tour" button element in the `<header>` of `index.html`, positioned after the brand title
- [x] 2.2 Add CSS styles for the Tour button in `style.css` — subtle secondary styling matching header visual language

## 3. Tour Step Definitions

- [x] 3.1 Add a `getTourConfig()` function in `app.js` that returns the Driver.js options object with all 10 steps (welcome modal, schema-editor, query-editor, mode-select, example-select, build-schema-btn, run-query-btn, results-container, share-btn, schema-browser) — each step has a title and workflow description

## 4. First-Visit Logic

- [x] 4.1 Add first-visit check on DOMContentLoaded: if `localStorage.getItem('flink-fiddle-tour-dismissed')` is null, auto-start the tour
- [x] 4.2 Add "Don't show again" checkbox HTML in the welcome step's description — on tour destroy, persist preference to localStorage if checked

## 5. On-Demand Trigger

- [x] 5.1 Wire the Tour button click handler to start the tour via `driver(getTourConfig()).drive()` — button remains functional regardless of localStorage preference

## 6. Browser Verification

- [x] 6.1 Start the app, verify first-visit prompt appears, complete the tour, check "Don't show again", reload and confirm tour does not auto-start, then click Tour button and verify on-demand tour works
