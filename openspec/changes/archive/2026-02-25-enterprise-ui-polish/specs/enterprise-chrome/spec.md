## ADDED Requirements

### Requirement: Sans-serif UI chrome typography
The application SHALL use the system sans-serif font stack (`--font-sans`) for all non-code UI elements: header, panel labels, button text, select text, toolbar text, status bar, results metadata, and schema browser headers. Monospace SHALL remain explicitly set on editor containers, results table cells, schema browser column names, and `#results-container`.

#### Scenario: Buttons render in sans-serif
- **WHEN** a user views the Build Schema, Run Query, or Share buttons
- **THEN** the button labels SHALL render in the system sans-serif font

#### Scenario: Panel labels render in sans-serif
- **WHEN** a user views the panel headers ("Schema (DDL)", "Query", "Results")
- **THEN** the labels SHALL render in sans-serif with uppercase letter-spacing

#### Scenario: Results data renders in monospace
- **WHEN** a user views query result rows
- **THEN** the cell data SHALL render in the monospace font stack

### Requirement: Header with brand icon
The header SHALL display an inline SVG icon (data-layers motif) alongside the "Flink SQL Fiddle" title. The icon SHALL be 20x20px, use the accent blue color, and sit to the left of the title in a flex row. The header SHALL be 44px tall with horizontal padding of 16px, a bottom shadow (`--shadow-sm`), and `z-index: 10`.

#### Scenario: Header displays icon and title
- **WHEN** a user loads the page
- **THEN** the header SHALL show a blue SVG icon to the left of "Flink SQL Fiddle"
- **AND** the header height SHALL be 44px

#### Scenario: Header has subtle depth
- **WHEN** a user scrolls the editor content
- **THEN** the header SHALL appear elevated above content via a subtle bottom shadow

### Requirement: Toolbar control grouping with dividers
The toolbar SHALL organize controls into logical groups wrapped in `.control-group` flex containers. Vertical dividers (`.toolbar-divider`: 1px wide, 20px tall, border-colored) SHALL separate each group. The toolbar SHALL be 44px tall with padding of 8px 16px.

Groups:
1. Build Schema + Run Query buttons
2. Mode select + Example select
3. Share button

The status text (`#status-text`) SHALL remain outside groups, pushed right via `margin-left: auto`.

#### Scenario: Toolbar shows visual grouping
- **WHEN** a user views the toolbar
- **THEN** buttons and selects SHALL be organized into distinct groups separated by thin vertical lines
- **AND** the toolbar height SHALL be 44px

### Requirement: Inline SVG icons on buttons
The Run Query button SHALL display a play triangle icon (12x12px) to the left of the text. The Build Schema button SHALL display a stacked-lines/database icon (14x14px). The Share button SHALL display a share-network icon (12x12px). Icons SHALL be inline SVGs using `fill="currentColor"` and positioned via `display: inline-flex; align-items: center; gap: 6px` on the button.

#### Scenario: Run button shows play icon
- **WHEN** a user views the Run Query button
- **THEN** a play triangle icon SHALL appear to the left of "Run Query"

#### Scenario: Icons inherit button text color
- **WHEN** a button is disabled
- **THEN** the icon color SHALL match the dimmed text color

### Requirement: Green primary action button
The `.btn-primary` class SHALL use a green background (`--accent-green`: #238636) instead of blue. Hover SHALL use `--accent-green-hover` (#2ea043), active SHALL use `--accent-green-active` (#1a7f37). Text SHALL be white (#ffffff). The button SHALL have a subtle border (`1px solid rgba(240,246,252,0.1)`) and shadow (`--shadow-sm`) for depth.

#### Scenario: Run button is green
- **WHEN** the Run Query button is in its default enabled state
- **THEN** it SHALL display a green background with white text

#### Scenario: Run button hover darkens
- **WHEN** a user hovers over the enabled Run Query button
- **THEN** the background SHALL transition to a slightly lighter green

### Requirement: Custom select styling
The mode and example select elements SHALL use `appearance: none` with a custom SVG chevron (down-arrow) as `background-image`. Height SHALL be 32px, padding `6px 28px 6px 10px`, sans-serif font at 13px. Focus state SHALL display a blue glow ring (`box-shadow: 0 0 0 2px rgba(59,130,246,0.15)`) in addition to the accent border color. Hover SHALL brighten the border to `#444c56`.

#### Scenario: Selects show custom chevron
- **WHEN** a user views the mode or example dropdown
- **THEN** a custom down-arrow icon SHALL appear on the right side (not the native browser arrow)

#### Scenario: Select focus shows glow ring
- **WHEN** a user focuses a select via keyboard
- **THEN** the border SHALL turn accent blue AND a subtle blue glow ring SHALL appear around the element

### Requirement: Status bar
A 24px-tall footer element SHALL appear at the bottom of the viewport displaying persistent context: truncated session ID, current execution mode (Streaming/Batch), and row count from the last query. The status bar SHALL use sans-serif font at 11px, `--bg-elevated` background, `--text-muted` color, and a top border.

#### Scenario: Status bar shows session info
- **WHEN** a session is created
- **THEN** the status bar SHALL display "Session: " followed by the first 8 characters of the session ID

#### Scenario: Status bar reflects mode changes
- **WHEN** a user changes the mode select from Streaming to Batch
- **THEN** the status bar mode indicator SHALL update to "Batch"

#### Scenario: Status bar shows row count after query
- **WHEN** query results are rendered
- **THEN** the status bar SHALL display the row count (e.g., "42 rows")
