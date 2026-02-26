## MODIFIED Requirements

### Requirement: Near-black surface palette
The application SHALL use a blue-gray tinted dark color palette for all surfaces:
- Base background: `#0d1117` (blue-gray tinted, not pure black)
- Raised surfaces (header, toolbar, meta bars): `#161b22`
- Elevated surfaces (panel labels, active controls): `#1c2128`

The palette SHALL NOT use pure black (`#000000` to `#0a0a0a`) or medium grays (`#252526`, `#2d2d2d`) as primary surface colors. The blue-gray tint SHALL be consistent across all surface levels.

#### Scenario: Page loads with blue-gray dark background
- **WHEN** a user loads the application
- **THEN** the page background SHALL appear dark with a subtle blue-gray tint (not pure black and not neutral gray)
- **AND** surface elements SHALL be subtly distinguishable from the base

### Requirement: Monospace-forward UI typography
The application SHALL use the system sans-serif font stack for all UI chrome: buttons, panel labels, select options, status text, metadata, toolbar text, and the page title. Monospace SHALL be used for code editor containers, results table data cells, schema browser column names, and the results container.

The monospace stack SHALL prioritize developer-focused fonts: `'SF Mono', 'Cascadia Code', 'JetBrains Mono', 'Fira Code', Menlo, Monaco, 'Courier New', monospace`.

#### Scenario: UI labels render in sans-serif
- **WHEN** a user views the panel headers ("Schema (DDL)", "Query", "Results")
- **THEN** the text SHALL render in the system sans-serif font

#### Scenario: Button text renders in sans-serif
- **WHEN** a user views the Run Query, Build Schema, and Share buttons
- **THEN** the button labels SHALL render in the system sans-serif font

#### Scenario: Code and data render in monospace
- **WHEN** a user views the SQL editors or results table data cells
- **THEN** the content SHALL render in the monospace font stack

### Requirement: Flat surfaces with subtle depth
The application SHALL use subtle box-shadows (`--shadow-sm`) on the header for depth. All other separation SHALL come from: (a) background color differences between surface levels, and/or (b) 1px borders using visible border tokens (`#30363d`).

#### Scenario: Header has subtle shadow
- **WHEN** a developer inspects the header element
- **THEN** a subtle `box-shadow` SHALL be applied for depth perception

#### Scenario: Borders are clearly visible
- **WHEN** a user views border lines between panels
- **THEN** the borders SHALL be clearly visible (`#30363d` range) — defining structure without overwhelming content

### Requirement: Syntax-colored semantic accents
The application SHALL use colors inspired by syntax highlighting for semantic meaning:
- Primary execution action (Run button): green, approximately `#238636`
- Secondary navigation action: blue, approximately `#3b82f6`
- Success / insert rows: green, approximately `#34d399`
- Error / delete rows: red, approximately `#f87171`
- Warning / update rows: amber, approximately `#fbbf24`
- Info / update-before rows: cyan, approximately `#22d3ee`

Changelog row colors SHALL use muted variants (reduced opacity or saturation) to avoid visual noise in dense tables.

#### Scenario: Run button uses green accent
- **WHEN** the Run Query button is in its default enabled state
- **THEN** it SHALL display a green background with white text

#### Scenario: Changelog colors map to semantic meaning
- **WHEN** streaming mode results display with changelog annotations
- **THEN** insert rows SHALL be green-tinted, update-after rows amber-tinted, update-before rows cyan-tinted, and delete rows red-tinted
- **AND** the colors SHALL be muted (not fully saturated)

### Requirement: Compact control styling
Buttons, selects, and toolbar elements SHALL use moderately compact padding with 6px border-radius. Button padding SHALL be approximately 6px 16px. Toolbar height SHALL be 44px with padding of 8px 16px.

#### Scenario: Controls appear polished and consistent
- **WHEN** a user views the toolbar area
- **THEN** controls SHALL have consistent 6px border-radius
- **AND** the toolbar SHALL be 44px tall with comfortable spacing

### Requirement: Devtool-styled buttons
The Run Query button SHALL be the primary action (green background, white sans-serif text, play icon). Build Schema and Share SHALL be secondary (surface-colored background, secondary text, subtle border). All buttons SHALL display inline SVG icons. All SHALL have hover, active, disabled, and focus states.

#### Scenario: Disabled run button
- **WHEN** a query is running and the Run button is disabled
- **THEN** the button SHALL display a desaturated background and `cursor: not-allowed`

#### Scenario: Share button appears secondary
- **WHEN** a user views the Share button next to the Run Query button
- **THEN** the Share button SHALL be visually less prominent with a surface-colored background

### Requirement: Devtool-styled selects
The mode selector and example selector SHALL use `appearance: none` with a custom SVG chevron, 32px height, sans-serif text, and visible focus states including a blue glow ring.

#### Scenario: Select focus state
- **WHEN** a user focuses a select dropdown
- **THEN** an accent blue border AND a subtle blue glow ring SHALL appear

#### Scenario: Select shows custom chevron
- **WHEN** a user views a select element
- **THEN** a custom down-arrow SVG SHALL replace the native browser dropdown indicator

### Requirement: Refined header branding
The page header SHALL display an inline SVG brand icon alongside "Flink SQL Fiddle" in sans-serif. The header SHALL be 44px tall with a raised surface background, a subtle bottom shadow for depth, and `z-index: 10`.

#### Scenario: Header is branded and elevated
- **WHEN** a user loads the page
- **THEN** the header SHALL show a blue icon + title at 44px height with a subtle shadow
