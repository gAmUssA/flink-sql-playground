## 1. Design Token Foundation

- [x] 1.1 Define CSS custom properties on `:root` for all color tokens: near-black surface levels (`--bg-base: #0a0a0a`, `--bg-raised: #111`, `--bg-elevated: #161616`), text colors (`--text-primary: #e5e5e5`, `--text-secondary: #a0a0a0`, `--text-muted: #666`), accent colors (blue, green, red, amber, cyan), border color (`--border: #1e1e1e`), and muted changelog colors. Acceptance: all color values centralized in `:root`.
- [x] 1.2 Define CSS custom properties for monospace font stack (`--font-mono`), sans-serif font stack (`--font-sans`), spacing scale, border-radius (`--radius: 3px`), and transition timing (`--transition: 120ms ease-out`). Acceptance: typography, spacing, and timing values reference tokens.

## 2. Base and Layout Styles

- [x] 2.1 Rewrite base reset and body styles using tokens: `--bg-base` background, `--text-primary` color, `--font-mono` as default font, `100vh` flex column. Acceptance: page loads near-black with monospace text.
- [x] 2.2 Restyle header with `--bg-raised` background, title in `--font-sans` at 14px/600 weight, compact padding (6px 12px), 1px bottom border using `--border`. No shadow. Acceptance: header is compact, branded in sans-serif, everything else is monospace.
- [x] 2.3 Update `.editors` and `.editor-panel` styles: 1px right border using `--border` between panels, no other decorative borders. Acceptance: panels separated by barely-visible divider.

## 3. Panel Labels

- [x] 3.1 Restyle `.editor-panel h2` with `--bg-elevated` background, `--font-mono`, 11px size, 600 weight, `--text-secondary` color, uppercase, 1.5px letter-spacing, compact padding (3px 10px). Acceptance: labels read as monospace devtool section headers.
- [x] 3.2 Restyle `.results h2` to match editor panel label treatment. Acceptance: all section labels visually consistent.

## 4. Controls Toolbar

- [x] 4.1 Restyle `.controls` with `--bg-raised` background, compact padding (6px 12px), 1px top/bottom borders using `--border`. No shadows. Acceptance: toolbar appears flat and compact.
- [x] 4.2 Redesign `#run-btn`: accent blue background (`--accent-blue`), white monospace text, 3px radius, 5px 14px padding, 600 weight. Hover: lighten. Active: darken. Disabled: desaturated + `not-allowed`. Transition: `var(--transition)` on background-color. Acceptance: Run button is the clear primary action with crisp state transitions.
- [x] 4.3 Redesign `#share-btn`: `--bg-elevated` background, `--text-secondary` color, 1px border using `--border`, 3px radius, matching padding. Hover: lighten background. Acceptance: Share button is visually secondary.
- [x] 4.4 Restyle `#mode-select` and `#example-select`: `--bg-elevated` background, `--border` border, `--text-primary` color, `--font-mono`, 3px radius. Focus: `--accent-blue` border. Transition on border-color. Acceptance: selects match devtool aesthetic with accent focus.
- [x] 4.5 Restyle `#status-text` with `--text-muted` color and `--font-mono`. Acceptance: status text is subdued monospace.

## 5. Results Table

- [x] 5.1 Restyle `.results-table th`: `--bg-elevated` background, `--text-secondary` color, `--font-mono` 11px, compact padding (4px 8px), 1px bottom border. Acceptance: headers are distinct but not heavy.
- [x] 5.2 Restyle `.results-table td`: `--font-mono` 12px, `--text-primary` color, 3px 8px padding, bottom-border-only using `--border`. Alternating rows using `--bg-raised`. Acceptance: data is dense and scannable.
- [x] 5.3 Update changelog row colors to muted token variants: insert green, update-after amber, update-before cyan, delete red — all at reduced saturation. Acceptance: colors are semantic and distinguishable but not harsh.
- [x] 5.4 Restyle `.results-meta` with `--bg-raised` background, `--text-muted` color, compact padding. Acceptance: metadata bar is consistent with toolbar.
- [x] 5.5 Restyle `#results-container` with `--font-mono` and `--bg-base` background. Acceptance: results area uses monospace and matches base surface.

## 6. Animations and Transitions

- [x] 6.1 Add `@keyframes pulse-running` for `.running` class on `#run-btn` — subtle opacity oscillation (1.0 → 0.7 → 1.0) over 1.5s infinite. Acceptance: `.running` class triggers visible but non-distracting pulse.
- [x] 6.2 Add `.fade-in` class with `@keyframes fade-in` (opacity 0→1, 200ms ease-in). Acceptance: applying `.fade-in` causes smooth content reveal.
- [x] 6.3 Add `:focus-visible` styles for buttons and selects: 2px outline using `--accent-blue` with 2px offset. No `:focus` outline (only `:focus-visible`). Acceptance: Tab navigation shows accent focus rings, mouse clicks do not.

## 7. JavaScript Integration (Minimal)

- [x] 7.1 In `app.js`, toggle `.running` class on `#run-btn` when query execution starts/completes. Acceptance: Run button pulses during query execution.
- [x] 7.2 In `app.js`, add `.fade-in` class to results content when rendering new results (remove before re-adding to retrigger). Acceptance: results fade in after each query.

## 8. Verification

- [x] 8.1 Verify: all CSS values use custom properties (no orphaned hardcoded colors), all surfaces are near-black (not medium gray), all UI text except title is monospace, borders are barely visible, no shadows or gradients exist, transitions are 150ms or less, changelog colors are muted. Acceptance: visual QA confirms devtool aesthetic.
