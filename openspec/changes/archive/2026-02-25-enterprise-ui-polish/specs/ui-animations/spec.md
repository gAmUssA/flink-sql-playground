## MODIFIED Requirements

### Requirement: Focus-visible ring styling
All focusable interactive elements SHALL display a visible focus indicator when focused via keyboard navigation (`:focus-visible`). The focus ring SHALL use the primary accent color with a 2px solid outline and a supplemental glow effect (`box-shadow: 0 0 0 4px rgba(59,130,246,0.15)`). Mouse clicks SHALL NOT trigger the focus ring.

#### Scenario: Keyboard navigation shows focus with glow
- **WHEN** a user navigates to the Run button using Tab key
- **THEN** a visible outline SHALL appear using the accent blue color
- **AND** a subtle blue glow SHALL surround the outline

#### Scenario: Mouse click does not show focus ring
- **WHEN** a user clicks the Run button with a mouse
- **THEN** no focus ring or glow SHALL be displayed

## ADDED Requirements

### Requirement: Resize handle hover grip indicator
The resize handle between the toolbar and results pane SHALL display a centered grip indicator (32px wide, 3px tall, rounded, border-colored) that fades in on hover via a `::after` pseudo-element. The grip SHALL have `opacity: 0` by default and `opacity: 1` on `.resize-handle:hover`.

#### Scenario: Grip appears on hover
- **WHEN** a user hovers over the resize handle
- **THEN** a small centered horizontal bar SHALL fade in, indicating the handle is draggable

#### Scenario: Grip is invisible by default
- **WHEN** a user is not hovering over the resize handle
- **THEN** no grip indicator SHALL be visible
