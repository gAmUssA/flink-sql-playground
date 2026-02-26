## ADDED Requirements

### Requirement: Design token system via CSS custom properties
The application SHALL define all visual constants (colors, spacing, borders, radii, transitions) as CSS custom properties on `:root`. No hardcoded color or spacing values SHALL appear outside the `:root` block.

#### Scenario: Token consistency
- **WHEN** a developer inspects any styled element
- **THEN** all color, border, spacing, and transition values reference CSS custom properties (e.g., `var(--bg-base)`, `var(--text-primary)`)

#### Scenario: Theme adjustment
- **WHEN** a developer changes a single custom property value in `:root`
- **THEN** all elements using that token update consistently

### Requirement: Near-black surface palette
The application SHALL use a near-black color palette for all surfaces:
- Base background: approximately `#0a0a0a` to `#0d0d0d`
- Raised surfaces (header, toolbar, meta bars): approximately `#111111` to `#141414`
- Elevated surfaces (panel labels, active controls): approximately `#161616` to `#1a1a1a`

The palette SHALL NOT use medium grays (e.g., `#252526`, `#2d2d2d`) as primary surface colors.

#### Scenario: Page loads with near-black background
- **WHEN** a user loads the application
- **THEN** the page background SHALL appear near-black (not dark gray)
- **AND** surface elements SHALL be subtly distinguishable from the base

### Requirement: Monospace-forward UI typography
The application SHALL use a monospace font stack for all UI text EXCEPT the page title. This includes: panel labels, button text, select options, status text, results table content, and metadata. The page title ("Flink SQL Fiddle") SHALL use the system sans-serif stack.

The monospace stack SHALL prioritize developer-focused fonts: `'SF Mono', 'Cascadia Code', 'JetBrains Mono', 'Fira Code', Menlo, Monaco, 'Courier New', monospace`.

#### Scenario: UI labels render in monospace
- **WHEN** a user views the panel headers ("Schema (DDL)", "Query", "Results")
- **THEN** the text SHALL render in a monospace font

#### Scenario: Button text renders in monospace
- **WHEN** a user views the Run and Share buttons
- **THEN** the button labels SHALL render in a monospace font

#### Scenario: Page title renders in sans-serif
- **WHEN** a user views the header
- **THEN** "Flink SQL Fiddle" SHALL render in the system sans-serif stack

### Requirement: High-contrast text hierarchy
The application SHALL use high-contrast text against the near-black backgrounds:
- Primary text: approximately `#e5e5e5` (headings, active content, button labels)
- Secondary text: approximately `#a0a0a0` (panel labels, metadata)
- Muted text: approximately `#666666` (status text, inactive elements)

#### Scenario: Primary text is highly readable
- **WHEN** a user reads result table data or button labels
- **THEN** the text SHALL appear bright and clearly legible against the near-black background

#### Scenario: Muted text is subdued but readable
- **WHEN** a user reads status text or panel labels
- **THEN** the text SHALL appear noticeably dimmer than primary text but still legible

### Requirement: Flat surfaces with minimal borders
The application SHALL NOT use box-shadows or gradients for visual separation. Separation SHALL come from: (a) background color differences between surface levels, and/or (b) 1px borders using very dark border tokens (approximately `#1e1e1e` to `#252525`).

#### Scenario: No shadows present
- **WHEN** a developer inspects any element
- **THEN** no `box-shadow` property SHALL be applied (except for focus rings on interactive elements)

#### Scenario: Borders are barely visible
- **WHEN** a user views border lines between panels
- **THEN** the borders SHALL be subtle — just enough to define structure without drawing attention

### Requirement: Syntax-colored semantic accents
The application SHALL use colors inspired by syntax highlighting for semantic meaning:
- Primary action (Run button): blue, approximately `#3b82f6`
- Success / insert rows: green, approximately `#22c55e`
- Error / delete rows: red, approximately `#ef4444`
- Warning / update rows: amber, approximately `#f59e0b`
- Info / update-before rows: cyan, approximately `#06b6d4`

Changelog row colors SHALL use muted variants (reduced opacity or saturation) to avoid visual noise in dense tables.

#### Scenario: Run button uses blue accent
- **WHEN** the Run button is in its default enabled state
- **THEN** it SHALL display an accent blue background with white text

#### Scenario: Changelog colors map to semantic meaning
- **WHEN** streaming mode results display with changelog annotations
- **THEN** insert rows SHALL be green-tinted, update-after rows amber-tinted, update-before rows cyan-tinted, and delete rows red-tinted
- **AND** the colors SHALL be muted (not fully saturated)

### Requirement: Compact control styling
Buttons, selects, and toolbar elements SHALL use compact padding and sharp (not rounded) styling. Border-radius SHALL be 3px maximum. Button padding SHALL be approximately 5px 14px. Toolbar padding SHALL be approximately 6px 12px.

#### Scenario: Controls appear compact and precise
- **WHEN** a user views the toolbar area
- **THEN** controls SHALL appear tightly spaced and sharp-edged
- **AND** the toolbar SHALL NOT appear spacious or rounded

### Requirement: Devtool-styled buttons
The Run button SHALL be the primary action (accent blue background, white monospace text). The Share button SHALL be secondary (transparent or surface-colored background, muted text, subtle border). Both SHALL have hover, active, disabled, and focus states.

#### Scenario: Disabled run button
- **WHEN** a query is running and the Run button is disabled
- **THEN** the button SHALL display a desaturated background and `cursor: not-allowed`

#### Scenario: Share button appears secondary
- **WHEN** a user views the Share button next to the Run button
- **THEN** the Share button SHALL be visually less prominent than the Run button

### Requirement: Devtool-styled selects
The mode selector and example selector SHALL have dark backgrounds matching surface tokens, subtle borders, monospace text, and visible focus states.

#### Scenario: Select focus state
- **WHEN** a user focuses a select dropdown
- **THEN** a border color change or outline SHALL appear using the accent color

### Requirement: Information-dense results table
The results table SHALL use compact styling: monospace font, tight cell padding (3px 8px), minimal grid lines (bottom borders only or very subtle full grid), and subtle alternating row backgrounds. Column headers SHALL be visually distinct but not heavy.

#### Scenario: Results table feels data-dense
- **WHEN** a user views query results
- **THEN** the table SHALL display data compactly with monospace font
- **AND** more rows SHALL be visible compared to the current styling

### Requirement: Refined header branding
The page header SHALL display "Flink SQL Fiddle" in sans-serif with appropriate weight and spacing. The header background SHALL use a raised surface color. The overall header SHALL be compact — just enough to identify the app without wasting vertical space.

#### Scenario: Header is compact and branded
- **WHEN** a user loads the page
- **THEN** the header SHALL be visually minimal and compact
- **AND** the title SHALL be the only element using sans-serif font
