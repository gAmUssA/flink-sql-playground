## Why

The current dark theme reads "hacker terminal" — pure black surfaces, monospace everywhere, flat controls. Users comparing it to Confluent Cloud, Google BigQuery, Databricks, or Amazon Aurora instantly notice it doesn't feel like a professional data tool. A visual polish pass — shifting the color palette, adding proper typography hierarchy, toolbar grouping, and a status bar — closes that perception gap without adding features.

## What Changes

- **Color palette shift**: Pure-black surfaces (#0a0a0a) move to blue-gray tinted dark (#0d1117) matching GitHub/Databricks dark mode conventions
- **Border visibility**: Borders brighten from #1e1e1e to #30363d for clear panel delineation
- **Typography hierarchy**: UI chrome (headers, buttons, labels, selects) switches to sans-serif; monospace remains for code and data only
- **Green Run button**: Primary execution button shifts from blue to green (#238636), the universal "run/execute" color in BigQuery, Databricks, and Confluent
- **Toolbar grouping**: Buttons organized into logical groups with vertical dividers and inline SVG icons (play triangle, database, share)
- **Results table refinement**: 32px row height, row hover states, uppercase sans-serif headers, colored left-border accents on changelog rows
- **Status bar**: VS Code-style bottom bar showing session ID, execution mode, and row count
- **Select styling**: Custom chevron, taller height, focus glow ring
- **Schema browser**: Tree indentation guides, column-type badge pills
- **Polish**: Custom scrollbars, resize handle grip indicator, focus ring glow, subtle shadows for depth

## Capabilities

### New Capabilities
- `enterprise-chrome`: Sans-serif UI chrome, toolbar grouping with dividers and icons, header branding with SVG icon, status bar, custom select styling
- `enterprise-data-display`: Results table refinements (row height, hover, headers, changelog borders), custom scrollbars, schema browser visual upgrades

### Modified Capabilities
- `premium-theme`: Surface colors shift from pure-black to blue-gray tinted dark, borders brighten, border-radius increases to 6px, new green accent tokens and shadow tokens added
- `ui-animations`: Resize handle gains hover grip indicator via ::after pseudo-element, focus rings gain box-shadow glow

## Impact

- **Files**: `style.css` (bulk), `index.html` (header, toolbar, status bar HTML), `app.js` (~10 lines for status bar population)
- **No API changes**: Zero backend modifications
- **No feature changes**: All existing functionality preserved exactly
- **Monaco editors**: Unchanged — `vs-dark` theme, font, and options stay as-is
