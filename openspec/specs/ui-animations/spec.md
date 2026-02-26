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
All focusable interactive elements SHALL display a visible focus indicator when focused via keyboard navigation (`:focus-visible`). The focus ring SHALL use the primary accent color with a 2px solid outline and a supplemental glow effect (`box-shadow: 0 0 0 4px rgba(59,130,246,0.15)`). Mouse clicks SHALL NOT trigger the focus ring.

#### Scenario: Keyboard navigation shows focus with glow
- **WHEN** a user navigates to the Run button using Tab key
- **THEN** a visible outline SHALL appear using the accent blue color
- **AND** a subtle blue glow SHALL surround the outline

#### Scenario: Mouse click does not show focus ring
- **WHEN** a user clicks the Run button with a mouse
- **THEN** no focus ring or glow SHALL be displayed

### Requirement: Resize handle hover grip indicator
The resize handle between the toolbar and results pane SHALL display a centered grip indicator (32px wide, 3px tall, rounded, border-colored) that fades in on hover via a `::after` pseudo-element. The grip SHALL have `opacity: 0` by default and `opacity: 1` on `.resize-handle:hover`.

#### Scenario: Grip appears on hover
- **WHEN** a user hovers over the resize handle
- **THEN** a small centered horizontal bar SHALL fade in, indicating the handle is draggable

#### Scenario: Grip is invisible by default
- **WHEN** a user is not hovering over the resize handle
- **THEN** no grip indicator SHALL be visible
