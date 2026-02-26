## 1. Design Tokens

- [x] 1.1 Update surface tokens in `:root` — `--bg-base` to `#0d1117`, `--bg-raised` to `#161b22`, `--bg-elevated` to `#1c2128`. Acceptance: all panels show blue-gray tint, not pure black.
- [x] 1.2 Update border tokens — `--border` to `#30363d`, `--border-subtle` to `#21262d`. Acceptance: panel borders are clearly visible.
- [x] 1.3 Update `--radius` from `3px` to `6px`. Acceptance: buttons and selects have 6px rounded corners.
- [x] 1.4 Add new tokens: `--accent-green` (#238636), `--accent-green-hover` (#2ea043), `--accent-green-active` (#1a7f37), `--shadow-sm`, `--bg-hover`, `--border-insert`, `--border-update-after`, `--border-update-before`, `--border-delete`. Acceptance: tokens defined in `:root`, referenced by rules added in later tasks.

## 2. Typography Hierarchy

- [x] 2.1 Switch `body` font-family from `var(--font-mono)` to `var(--font-sans)`. Acceptance: all UI chrome (buttons, labels, selects, headers) renders in sans-serif.
- [x] 2.2 Ensure monospace is explicitly set on `.editor-container`, `.results-table td`, `.schema-column`, `#results-container`, `.schema-table-name`. Acceptance: code and data still render in monospace.
- [x] 2.3 Switch `.editor-panel h2`, `.results h2`, `.schema-browser-title`, `.results-meta` to `font-family: var(--font-sans)`. Increase panel label padding to `6px 12px`. Acceptance: all panel headers are sans-serif uppercase.

## 3. Header Uplift

- [x] 3.1 In `index.html`, wrap header content in `.header-brand` div with inline SVG icon (20x20 data-layers motif). Acceptance: header shows blue icon + title.
- [x] 3.2 In `style.css`, set header to `height: 44px`, `padding: 0 16px`, `display: flex`, `align-items: center`, `box-shadow: var(--shadow-sm)`, `z-index: 10`. Style `.header-brand` as flex row with gap. Acceptance: header is 44px with subtle shadow.

## 4. Toolbar Restructuring

- [x] 4.1 In `index.html`, wrap toolbar controls in `.control-group` divs with `.toolbar-divider` elements between groups. Groups: (Build Schema + Run Query), (mode select + example select), (Share). Acceptance: toolbar shows 3 logical groups separated by vertical lines.
- [x] 4.2 Add inline SVG icons to buttons — play triangle for Run Query, stacked-lines for Build Schema, share-network for Share. Acceptance: all 3 buttons show icons left of text.
- [x] 4.3 In `style.css`, set `.controls` to `height: 44px`, `padding: 8px 16px`. Add `.control-group` (flex, gap 8px) and `.toolbar-divider` (1px wide, 20px tall). Add `.btn-icon` (flex-shrink: 0, opacity: 0.9). Acceptance: toolbar is 44px, groups are visually separated.

## 5. Green Run Button

- [x] 5.1 Update `.btn-primary` — background from `--accent-blue` to `--accent-green`, text to `#ffffff`, add `display: inline-flex; align-items: center; gap: 6px`, font-family to sans-serif, border `1px solid rgba(240,246,252,0.1)`, `box-shadow: var(--shadow-sm)`. Update hover/active states to green variants. Acceptance: Run Query button is green with white text.
- [x] 5.2 Update `.btn-secondary` — add `display: inline-flex; align-items: center; gap: 6px`, font-family to sans-serif, padding `6px 16px`. Add hover border brightening (`#444c56`). Acceptance: Build Schema and Share buttons match secondary style.
- [x] 5.3 Remove the separate `#share-btn` CSS rule block (redundant with `.btn-secondary`). Acceptance: no duplicate styling, share button inherits from `.btn-secondary`.

## 6. Select Styling

- [x] 6.1 Update `#mode-select, #example-select` — `appearance: none`, custom SVG chevron via `background-image` data URI, `height: 32px`, `padding: 6px 28px 6px 10px`, `font-family: var(--font-sans)`, `font-size: 13px`, `cursor: pointer`. Add hover state (`border-color: #444c56`). Acceptance: selects show custom chevron, no native arrow.
- [x] 6.2 Update select focus state — add `box-shadow: 0 0 0 2px rgba(59,130,246,0.15)` alongside accent border. Acceptance: focus shows blue glow ring.

## 7. Results Table Refinements

- [x] 7.1 Update `.results-table th` — `font-family: var(--font-sans)`, `text-transform: uppercase`, `letter-spacing: 0.5px`, padding `8px 12px`, `border-bottom: 2px solid var(--border)`, add `z-index: 1`. Acceptance: headers are uppercase sans-serif with strong bottom border.
- [x] 7.2 Update `.results-table td` — padding `6px 12px`, `height: 32px`. Acceptance: rows are 32px tall.
- [x] 7.3 Add `.results-table tbody tr:hover td { background: var(--bg-hover); }`. Acceptance: rows highlight on hover.
- [x] 7.4 Add changelog left-border accents — `.row-insert td:first-child { border-left: 3px solid var(--border-insert); }` and same for update-after, update-before, delete. Keep existing text colors. Acceptance: changelog rows show colored left border on first cell.

## 8. Schema Browser Visual Upgrades

- [x] 8.1 Update `.schema-columns` — add `border-left: 1px solid var(--border-subtle)`, adjust padding/margin for tree indentation guide. Acceptance: expanded columns show vertical guide line.
- [x] 8.2 Update `.schema-column-type` — render as badge pill (`display: inline-block`, `padding: 0 5px`, `margin-left: 4px`, `font-size: 10px`, `background: var(--bg-elevated)`, `border: 1px solid var(--border-subtle)`, `border-radius: 3px`). Acceptance: column types appear as small rounded badges.
- [x] 8.3 Update `.schema-browser-header` padding to `6px 10px`, height to `32px`. Acceptance: schema browser header has consistent spacing.

## 9. Status Bar

- [x] 9.1 In `index.html`, add `<footer class="status-bar">` before `</main>` with spans for session ID, mode, and row count. Acceptance: status bar element present in DOM.
- [x] 9.2 In `style.css`, add `.status-bar` rules — `height: 24px`, `background: var(--bg-elevated)`, `font-family: var(--font-sans)`, `font-size: 11px`, `color: var(--text-muted)`, `border-top: 1px solid var(--border)`, flex layout. Add `.status-bar-item` and `.status-bar-right` (margin-left auto). Acceptance: status bar renders at bottom of viewport.
- [x] 9.3 In `app.js`, update `createSession()` to populate `#status-session` with truncated session ID. Acceptance: status bar shows "Session: a3f8c2d1" after session creation.
- [x] 9.4 In `app.js`, add mode-select change listener in `DOMContentLoaded` to sync `#status-mode`. Acceptance: status bar updates when mode changes.
- [x] 9.5 In `app.js`, update `renderResults()` to populate `#status-rows` with row count. Acceptance: status bar shows "42 rows" after query execution.

## 10. Polish

- [x] 10.1 Update `.resize-handle` — change to `flex: 0 0 5px`, add `::after` pseudo-element (32x3px centered grip bar, border-colored, opacity 0 → 1 on hover). Acceptance: grip indicator fades in on hover.
- [x] 10.2 Update focus rings — add `box-shadow: 0 0 0 4px rgba(59,130,246,0.15)` to all `:focus-visible` rules, change `outline-offset` to `1px`. Acceptance: keyboard focus shows blue glow behind outline.
- [x] 10.3 Add custom scrollbar styles for `#results-container` (8px wide) and `.schema-browser-content` (6px wide) — rounded thumb, transparent track, `--border` colored. Acceptance: scrollbars are thin and styled in Chrome/Safari/Edge.
- [x] 10.4 Update `.results-meta` — font-family to sans-serif, padding to `6px 12px`. Acceptance: metadata bar matches the enterprise chrome style.

## 11. Verification

- [x] 11.1 Load the app — verify blue-gray surfaces, sans-serif UI chrome, green Run button, toolbar grouping with dividers and icons, custom selects, status bar, styled scrollbars. Monaco editors remain unchanged (vs-dark, monospace).
- [x] 11.2 Execute a streaming query — verify 32px result rows, row hover, uppercase headers, changelog left-border accents, metadata bar, status bar row count.
- [x] 11.3 Expand schema browser table — verify indentation guide line, column type badges, sans-serif header.
- [x] 11.4 Keyboard-navigate through controls — verify focus glow rings on all buttons and selects.
- [x] 11.5 Drag resize handle — verify grip indicator on hover, resize still works correctly.
