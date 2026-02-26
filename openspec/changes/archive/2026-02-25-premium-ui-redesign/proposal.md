## Why

The current UI uses a generic VS Code-inspired dark theme that doesn't feel like a purpose-built developer tool. Modern devtools (Linear, Vercel, Warp, Railway) have established a distinct aesthetic: monospace-forward typography, near-black backgrounds with high-contrast text, razor-sharp borders, compact density, and intentional color only for status and actions. The Flink SQL Fiddle should feel like it belongs alongside these tools — crisp, information-dense, and keyboard-native.

## What Changes

- Replace the generic dark theme with a devtool-native aesthetic: near-black base (`#0a0a0a`–`#111`), high-contrast white text, and minimal chrome
- Adopt monospace typography for UI labels, status text, and metadata — not just the code editors — to reinforce the developer tool identity
- Use flat, borderless surfaces with generous spacing for visual separation instead of shadows and gradients
- Apply syntax-highlighting-inspired accent colors: green for success/insert, red for errors/delete, blue for primary actions, amber for warnings/updates
- Add compact, information-dense control styling — smaller padding, tighter spacing, no rounded pill shapes
- Improve the results table for data-density: tighter rows, monospace values, minimal grid lines
- Add subtle CSS transitions (120–150ms) on interactive states — fast and crisp, not floaty

## Capabilities

### New Capabilities
- `devtool-theme`: Complete CSS redesign with devtool-native dark theme — near-black surfaces, monospace-forward typography, syntax-colored accents, compact density, and flat crisp component styles
- `ui-animations`: Fast CSS transitions on interactive elements — button states, focus rings, loading indicator, results reveal

### Modified Capabilities

## Impact

- **Files changed**: `style.css` (full rewrite), `index.html` (no changes or minimal class additions)
- **No backend changes**: Purely frontend CSS modifications
- **No JS logic changes**: Existing `app.js` and `examples.js` remain unchanged — at most toggling a CSS class for loading state
- **No new dependencies**: All styling via vanilla CSS (custom properties, transitions)
- **Browser compatibility**: Modern browsers (CSS custom properties, `:focus-visible`)
