## Requirements

### Requirement: Results table row height and padding
The results table SHALL use 32px row height with cell padding of `6px 12px`. Column headers SHALL use padding of `8px 12px` with a 2px bottom border for strong header separation.

#### Scenario: Row height is comfortable for scanning
- **WHEN** a user views query results
- **THEN** each row SHALL be 32px tall with consistent padding

#### Scenario: Column headers have strong visual separation
- **WHEN** a user views the results table header
- **THEN** the header row SHALL be separated from data rows by a 2px bottom border

### Requirement: Results table row hover state
The results table body rows SHALL highlight on hover with a subtle background (`--bg-hover`: `rgba(136, 198, 255, 0.04)`). The hover state SHALL apply to the entire row (all `td` elements).

#### Scenario: Row highlights on hover
- **WHEN** a user moves the mouse over a results table row
- **THEN** the row background SHALL subtly brighten
- **AND** the highlight SHALL span all columns

### Requirement: Results table column headers styled as uppercase sans-serif
The results table `th` elements SHALL use sans-serif font at 11px, uppercase text-transform, letter-spacing of 0.5px, and `--text-secondary` color on `--bg-elevated` background. Headers SHALL be sticky at `top: 0` with `z-index: 1`.

#### Scenario: Headers appear distinct from data
- **WHEN** a user views the results table
- **THEN** column headers SHALL be uppercase, sans-serif, and visually distinct from the monospace data rows

### Requirement: Changelog left-border accents
Changelog rows (insert, update-after, update-before, delete) SHALL display a 3px colored left border on the first `td` cell in addition to the existing text color. Border colors: insert `--border-insert` (#238636), update-after `--border-update-after` (#9e6a03), update-before `--border-update-before` (#1b6d85), delete `--border-delete` (#da3633).

#### Scenario: Insert row shows green left border
- **WHEN** streaming results display a +I (insert) row
- **THEN** the first cell SHALL have a 3px green left border
- **AND** the row text SHALL remain green-tinted

#### Scenario: Delete row shows red left border
- **WHEN** streaming results display a -D (delete) row
- **THEN** the first cell SHALL have a 3px red left border

### Requirement: Custom scrollbars
The `#results-container` element SHALL display custom scrollbars: 8px wide, rounded thumb (`border-radius: 4px`), transparent track, `--border` colored thumb. The `.schema-browser-content` element SHALL have 6px wide custom scrollbars. This applies to WebKit browsers; other browsers SHALL fall back to native scrollbars.

#### Scenario: Results scrollbar is styled
- **WHEN** results overflow and a scrollbar appears in Chrome/Safari/Edge
- **THEN** the scrollbar SHALL be thin (8px), with a rounded dark thumb on a transparent track

### Requirement: Schema browser tree indentation guides
The `.schema-columns` container (expanded column list under a table) SHALL display a 1px left border using `--border-subtle` as a vertical indentation guide line, similar to VS Code tree views.

#### Scenario: Expanded table shows indentation line
- **WHEN** a user expands a table in the schema browser
- **THEN** the column list SHALL have a subtle vertical line on the left connecting it visually to the parent table name

### Requirement: Schema browser column type badges
Column type text in the schema browser SHALL render as small badge pills: `font-size: 10px`, `padding: 0 5px`, `background: var(--bg-elevated)`, `border: 1px solid var(--border-subtle)`, `border-radius: 3px`. This makes types (INT, STRING, TIMESTAMP) visually distinct from column names.

#### Scenario: Column types render as badges
- **WHEN** a user expands a table in the schema browser
- **THEN** each column's type (e.g., "STRING", "INT") SHALL appear as a small rounded badge next to the column name
