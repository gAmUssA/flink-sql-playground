## ADDED Requirements

### Requirement: UI chrome uses system sans-serif font
All interactive UI elements (buttons, selects, status text, panel labels, header, schema browser labels) SHALL use the `--font-sans` system font stack. Monospace (`--font-mono`) SHALL only be used for code/data content: editor containers, results table cells, and results metadata.

#### Scenario: Buttons use sans-serif
- **WHEN** the user views any button (Build Schema, Run Query, Share)
- **THEN** the button text SHALL render in the system sans-serif font (`-apple-system`)

#### Scenario: Editor content stays monospace
- **WHEN** the user views the Monaco editor or results table
- **THEN** the content SHALL render in the monospace font stack (`SF Mono`)

### Requirement: macOS-style border radius
Interactive elements (buttons, selects) SHALL use a 6px border-radius for a macOS-native rounded appearance.

#### Scenario: Rounded buttons
- **WHEN** the user views any button
- **THEN** the button SHALL have a 6px border-radius

### Requirement: macOS-style font weight on buttons
Buttons SHALL use `font-weight: 500` (medium) instead of `600` (semi-bold) for a lighter, macOS-native feel.

#### Scenario: Button weight
- **WHEN** the user views any button
- **THEN** the button text SHALL render at medium (500) weight
