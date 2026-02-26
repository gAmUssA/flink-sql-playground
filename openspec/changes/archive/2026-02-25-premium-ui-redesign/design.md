## Context

The Flink SQL Fiddle frontend is a vanilla HTML/CSS/JS single-page app with Monaco Editor for SQL editing. The current `style.css` (193 lines) implements a generic VS Code-inspired dark theme with flat gray surfaces (#1e1e1e background, #252526 panels, #3c3c3c borders). No CSS preprocessors, frameworks, or build tools — styles are served as a static CSS file from Spring Boot's `resources/static/css/`.

The target aesthetic is **devtool-native**: the visual language of Linear, Vercel dashboard, Warp terminal, and Railway. Key characteristics: near-black backgrounds, monospace UI typography, high-contrast text, flat surfaces with razor-sharp 1px borders (or no borders at all — spacing does the work), syntax-highlighting palette for semantic color, and compact information density.

## Goals / Non-Goals

**Goals:**
- Achieve a devtool-native look: near-black, monospace-forward, information-dense, crisp
- Use CSS custom properties as design tokens for all visual values
- Make the interface feel like a purpose-built developer tool, not a VS Code skin
- Fast, crisp transitions (120–150ms) — no floaty animations
- Maintain all existing layout structure and functionality

**Non-Goals:**
- Adding CSS frameworks or build pipelines
- Changing JS logic or backend behavior
- Responsive/mobile layout (desktop devtool)
- Light theme or theme switching
- Custom web fonts — use system monospace stack (`'SF Mono', 'Cascadia Code', 'JetBrains Mono', 'Fira Code', Menlo, Monaco, 'Courier New', monospace`) and system sans-serif as fallback
- Gradients, shadows, glass effects, or any "premium luxury" aesthetic

## Decisions

### 1. CSS Custom Properties as Token System

**Decision**: Centralize all colors, spacing, borders, and transitions as `:root` variables.

**Rationale**: Single source of truth, easy to adjust, zero build step. The current file has ~20 unique hardcoded color values scattered throughout.

### 2. Near-Black Color Palette (Not Gray)

**Decision**: Base background at `#0a0a0a` (near-black), surfaces at `#111111` and `#161616`. Text at `#e5e5e5` (primary) and `#666666` (muted). Borders at `#1e1e1e` or `#252525` — barely visible, just enough structure.

**Rationale**: The current `#1e1e1e` base looks like VS Code. Near-black backgrounds with high-contrast white text are the defining visual of modern devtools (Linear uses `#0a0a0a`, Vercel uses `#000000`). The shift from "dark gray" to "near-black" is subtle but completely changes the character.

**Alternative considered**: Keeping the current #1e1e1e palette — rejected because it reads as "generic IDE theme" regardless of other changes.

### 3. Monospace-Forward Typography

**Decision**: Use a monospace font stack for panel labels, status text, toolbar metadata, button text, select options — everything except the page title. The page title uses the system sans-serif stack at a slightly larger size as the one non-monospace element.

**Rationale**: This is the single strongest signal of "developer tool." Linear, Vercel, and Warp all use monospace for UI chrome. When everything is monospace, the tool feels code-native rather than web-app-native. Monaco Editor already uses monospace for the code; extending it to the surrounding UI creates visual unity.

**Alternative considered**: Keep system sans-serif for all UI text (current approach) — rejected because it makes the tool feel like a generic web app that happens to contain code editors.

### 4. Flat Surfaces, No Elevation

**Decision**: No box-shadows, no gradients, no backdrop-filter. Separation comes from: (a) background color differences between near-black levels, and (b) 1px borders using very dark border tokens. Some surfaces use no border at all — spacing alone provides separation.

**Rationale**: Devtools feel flat and precise. Shadows and gradients signal "consumer app" or "Material Design." The crispness comes from precision: exact 1px borders, consistent spacing, intentional color.

**Alternative considered**: 3-level elevation system with shadows — rejected as too Material Design / consumer-app feeling.

### 5. Syntax-Colored Semantic Accents

**Decision**: Use colors inspired by syntax highlighting themes for semantic meaning:
- **Blue** (`#3b82f6`) — primary action (Run button)
- **Green** (`#22c55e`) — success, insert rows
- **Red** (`#ef4444`) — error, delete rows
- **Amber** (`#f59e0b`) — warning, update rows
- **Cyan** (`#06b6d4`) — info, update-before rows

All at ~70% saturation in their muted variants for the changelog rows. Full saturation only for primary actions and critical states.

**Rationale**: Developers already associate these colors with meaning from their editors. Using the same palette in the UI creates instant recognition. The changelog row colors map directly to the mental model of a diff (green = added, red = removed, amber = changed).

### 6. Compact Density

**Decision**: Reduce padding throughout. Panel labels at 3px 10px, toolbar at 6px 12px, table cells at 3px 8px, buttons at 5px 14px. Border-radius at 3px maximum — sharp but not jagged.

**Rationale**: Devtools pack information tightly. The current padding (8px 16px on toolbar, 6px 20px on buttons) is a bit spacious for this aesthetic. Tighter spacing = more code visible, more data rows visible, more "tool" and less "app."

### 7. Minimal HTML Changes

**Decision**: Zero structural HTML changes. At most, toggle a `.running` CSS class on `#run-btn` via existing JS during query execution.

**Rationale**: The HTML structure is already clean and sufficient. All visual changes happen in CSS.

## Risks / Trade-offs

- **Readability at low brightness**: Near-black backgrounds with muted text could be hard to read on low-quality displays. → Mitigation: Keep primary text at `#e5e5e5` (not lower), maintain WCAG AA contrast ratios.
- **Monospace readability for non-code text**: Some users find monospace harder to read for natural language. → Mitigation: The only natural language is the app title (stays sans-serif) and example names. Everything else is short labels that read fine in monospace.
- **Monaco Editor border alignment**: Monaco renders its own borders and backgrounds. → Mitigation: Don't restyle Monaco internals. Match surrounding panel colors to blend seamlessly with Monaco's dark theme.
- **CSS file size increase**: ~193 lines → ~300–350 lines. → Mitigation: Well-organized with token section, still a single file with no build step.
