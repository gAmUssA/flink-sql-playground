## Context

The Flink SQL Fiddle frontend uses a vanilla HTML/CSS/JS stack with Monaco Editor. The current dark theme uses pure-black surfaces and monospace typography everywhere, giving it a "terminal" aesthetic. Enterprise data tools (Confluent Cloud, BigQuery, Databricks, Aurora/Cloudscape) use blue-gray tinted dark surfaces, sans-serif UI chrome, green execution buttons, toolbar grouping, and status bars. This change aligns the visual language to match those conventions. All changes are frontend-only — no backend modifications.

Current files:
- `src/main/resources/static/css/style.css` (467 lines, CSS custom properties + rules)
- `src/main/resources/static/index.html` (65 lines, semantic HTML)
- `src/main/resources/static/js/app.js` (425 lines, vanilla JS)

## Goals / Non-Goals

**Goals:**
- Shift perception from "hobby terminal tool" to "enterprise data platform"
- Match the visual conventions of Confluent Cloud, BigQuery, Databricks, Aurora
- Maintain all existing functionality without regression
- Keep changes within the existing vanilla HTML/CSS/JS stack

**Non-Goals:**
- Adding new features (column sorting, drag-to-reorder, etc.)
- Replacing Monaco's built-in `vs-dark` theme with a custom theme
- Adding a CSS framework or build tooling
- Supporting light mode
- Responsive/mobile layout changes

## Decisions

### 1. Blue-gray tinted surfaces instead of pure black
**Choice**: Shift `--bg-base` from `#0a0a0a` to `#0d1117`, `--bg-raised` to `#161b22`, `--bg-elevated` to `#1c2128`.
**Rationale**: GitHub Primer dark mode, Databricks, and BigQuery all use blue-gray tinted dark backgrounds. Pure black reads as OLED-optimized mobile, not desktop enterprise. The blue-gray tint adds visual warmth and perceived depth.
**Alternative considered**: Neutral gray tint (#121212, #1a1a1a). Rejected because every reference tool uses a blue undertone, not neutral gray.

### 2. Sans-serif for UI chrome, monospace only for code/data
**Choice**: Body font switches to `--font-sans`. Monospace explicitly set on `.editor-container`, `.results-table`, `.schema-column`, `.results-meta`, `#results-container`.
**Rationale**: All four reference tools use sans-serif for buttons, labels, headers, and controls. Monospace is reserved for code and data cells. This is the single highest-impact change for "enterprise" feel.
**Alternative considered**: Keep monospace everywhere. Rejected because it's the primary visual signal that makes the tool look like a terminal rather than a product.

### 3. Green Run button
**Choice**: `.btn-primary` changes from `--accent-blue` to `--accent-green` (#238636).
**Rationale**: BigQuery, Databricks, and Confluent all use green for execution/run actions. Blue is reserved for navigation and links. Green universally signals "go/execute" in data tools.
**Alternative considered**: Keep blue, add play icon only. Rejected because the green color is the strongest single signal of "this is a data execution tool."

### 4. Toolbar grouping with dividers
**Choice**: Wrap buttons/selects in `.control-group` divs separated by `.toolbar-divider` elements (1px vertical lines).
**Rationale**: Databricks and BigQuery both group toolbar controls into logical clusters. This reduces cognitive load and adds visual structure without adding features.

### 5. Status bar at bottom
**Choice**: Add a 24px footer showing session ID, execution mode, and row count.
**Rationale**: VS Code, Databricks, and BigQuery all have persistent status bars. This is one of the strongest "IDE/platform" signals. The existing `#status-text` in the toolbar remains for transient messages; the status bar shows persistent context.

### 6. Inline SVG icons on buttons
**Choice**: Play triangle for Run, stacked-lines for Build Schema, share-network for Share. All inline SVGs, no external icon library.
**Rationale**: Every reference tool uses icons alongside button text. Inline SVGs keep the zero-dependency approach. Icons are 12-14px, visually subordinate to text.

### 7. Results table refinements
**Choice**: 32px row height, row hover states, 2px header border, changelog left-border accents.
**Rationale**: BigQuery and Databricks use ~32px rows for comfortable scanning. Hover states are universal in enterprise data tables. The colored left-border on changelog rows (instead of full-row text color) is how Confluent visualizes change streams.

### 8. Custom select styling
**Choice**: `appearance: none` + SVG chevron data URI.
**Rationale**: Native select dropdowns look inconsistent across browsers. Custom chevron matches the polished feel. The dropdown popup itself stays native (acceptable — even BigQuery does this).

## Risks / Trade-offs

**[Monaco theme mismatch]** → The `vs-dark` Monaco theme uses `#1e1e1e` background, which will contrast slightly with the new `#0d1117` base. This is acceptable — most enterprise editors have a slightly different shade for the code area. If jarring, a custom Monaco theme can be added as a follow-up.

**[Browser scrollbar inconsistency]** → WebKit scrollbar styling only works in Chrome/Safari/Edge. Firefox falls back to native scrollbars. Acceptable trade-off — matches what GitHub and VS Code do.

**[Select popup native styling]** → `appearance: none` removes the dropdown arrow but the option list popup remains native. This is the standard trade-off — custom popups require significant JS. All reference tools accept this.

**[Status bar vertical space]** → The 24px status bar reduces available results area. Mitigated by the resizable results pane — users can drag to compensate.
