## ADDED Requirements

### Requirement: Fast crisp transitions on interactive elements
All interactive elements (buttons, selects) SHALL have CSS transitions on background-color, border-color, and opacity. Transition duration SHALL be between 100ms and 150ms with an ease-out timing function. Transitions SHALL feel instant and crisp — not floaty or slow.

#### Scenario: Button hover transition
- **WHEN** a user moves the mouse over the Run button
- **THEN** the background color change SHALL animate smoothly
- **AND** the transition SHALL complete within 150ms

#### Scenario: Select focus transition
- **WHEN** a user focuses a select dropdown
- **THEN** the border color change SHALL animate smoothly within 150ms

### Requirement: Loading state on Run button
The Run button SHALL display a visual loading indicator when a query is executing. This SHALL be implemented via a CSS class (`.running`) toggled by JavaScript. The indicator SHALL be a subtle pulse or brightness oscillation — not a spinner or progress bar.

#### Scenario: Query execution starts
- **WHEN** a user clicks Run and a query begins executing
- **THEN** the Run button SHALL display a pulsing animation indicating processing

#### Scenario: Query execution completes
- **WHEN** the query finishes executing
- **THEN** the animation SHALL stop immediately and the button SHALL return to default state

### Requirement: Results content reveal
When query results appear in the results container, they SHALL transition in rather than appearing instantly. The reveal SHALL be a fast opacity transition (150–200ms).

#### Scenario: Results appear after query
- **WHEN** results are rendered into the results container
- **THEN** the content SHALL animate from transparent to fully opaque within 200ms

### Requirement: Focus-visible ring styling
All focusable interactive elements SHALL display a visible focus indicator when focused via keyboard navigation (`:focus-visible`). The focus ring SHALL use the primary accent color. Mouse clicks SHALL NOT trigger the focus ring.

#### Scenario: Keyboard navigation shows focus
- **WHEN** a user navigates to the Run button using Tab key
- **THEN** a visible outline or ring SHALL appear using the accent blue color

#### Scenario: Mouse click does not show focus ring
- **WHEN** a user clicks the Run button with a mouse
- **THEN** no focus ring SHALL be displayed
