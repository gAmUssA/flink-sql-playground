## 1. Design Tokens

- [x] 1.1 Update `--radius` from `3px` to `6px` in `:root`. Acceptance: all buttons and selects render with 6px corners.

## 2. Font Swap — Chrome to Sans-Serif

- [x] 2.1 Change `body` font-family from `var(--font-mono)` to `var(--font-sans)`. Acceptance: base UI text renders in system sans-serif.
- [x] 2.2 Change `.btn-primary`, `.btn-secondary`, `#share-btn` font-family from `var(--font-mono)` to `var(--font-sans)` and font-weight from `600` to `500`. Acceptance: buttons render in sans-serif at medium weight.
- [x] 2.3 Change `#mode-select, #example-select` font-family from `var(--font-mono)` to `var(--font-sans)`. Acceptance: dropdowns render in sans-serif.
- [x] 2.4 Change `#status-text` font-family from `var(--font-mono)` to `var(--font-sans)`. Acceptance: status text renders in sans-serif.
- [x] 2.5 Change `.editor-panel h2`, `.results h2`, `.schema-browser-title` font-family from `var(--font-mono)` to `var(--font-sans)`. Acceptance: panel labels render in sans-serif.
- [x] 2.6 Change `.schema-browser-empty` font-family from `var(--font-mono)` to `var(--font-sans)`. Acceptance: empty state text renders in sans-serif.
- [x] 2.7 Verify monospace stays on: `.results-table`, `.results-table th`, `#results-container`, `.results-meta`, `.schema-table-name`, `.schema-column`. Acceptance: code/data content remains monospace.
