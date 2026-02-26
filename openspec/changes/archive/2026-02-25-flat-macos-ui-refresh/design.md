## Context

The app has two font variables: `--font-mono` (SF Mono stack) and `--font-sans` (-apple-system stack). Currently almost everything uses `--font-mono`, including buttons, selects, labels, and status text. macOS developer tools (Xcode, Terminal preferences, Instruments) use the system sans-serif for chrome and reserve monospace for code/data content.

## Goals / Non-Goals

**Goals:**
- UI chrome (buttons, selects, labels, header, status, schema browser labels) uses `--font-sans`
- Content areas (editor, results table, results meta) keep `--font-mono`
- Buttons get macOS-style proportions: 6px radius, `font-weight: 500`, slightly more padding
- Flat, minimal look — no gradients, no shadows, no visual noise

**Non-Goals:**
- Color palette changes (keep existing dark theme tokens)
- Layout changes (keep existing structure)
- Light mode support
- Any HTML or JavaScript changes

## Decisions

### 1. Font boundary: sans for chrome, mono for content

**Decision**: Every `font-family: var(--font-mono)` on UI chrome elements becomes `var(--font-sans)`. Mono stays on: `.editor-container`, `.results-table`, `.results-table th`, `.results-table td`, `#results-container`, `.results-meta`, `.schema-column`, `.schema-column-type`.

**Rationale**: This matches macOS conventions. Buttons should never be in monospace.

### 2. Border-radius: 6px for interactive elements

**Decision**: Update `--radius` from `3px` to `6px`.

**Rationale**: macOS Big Sur+ uses generously rounded corners on buttons and inputs. 6px is subtle but noticeably softer than 3px.

### 3. Button font-weight: 500 (medium) instead of 600 (semi-bold)

**Decision**: Reduce `font-weight` on `.btn-primary`, `.btn-secondary`, `#share-btn` from `600` to `500`.

**Rationale**: macOS system buttons use medium weight with `-apple-system`. Semi-bold feels heavy in sans-serif.

## Risks / Trade-offs

- **[Font size may render differently]** → Sans-serif at 12px may appear slightly larger than mono at 12px. Mitigate: visually verify, may need 12px → 11px for some elements.
- **[Minimal change]** → This is intentionally a small, low-risk CSS-only change.
