## ADDED Requirements

### Requirement: Driver.js CDN integration
The system SHALL load Driver.js 1.4.0 CSS and JavaScript from the jsdelivr CDN. The Driver.js assets MUST be loaded in the HTML head (CSS) and before app.js (script) so the `window.driver.js.driver` global is available when the app initializes.

#### Scenario: Driver.js loads successfully
- **WHEN** the page loads with a working internet connection
- **THEN** `window.driver.js` is defined and the `driver` constructor function is available

#### Scenario: Driver.js CDN unavailable
- **WHEN** the jsdelivr CDN is unreachable
- **THEN** the app functions normally without the tour; the Tour button does nothing or is hidden

### Requirement: Guided tour step sequence
The system SHALL provide a guided tour with steps highlighting UI elements in this order: welcome modal (no element), schema editor, query editor, mode selector, examples dropdown, Build Schema button, Run Query button, results panel, Share button, schema browser. Each step SHALL have a title and description explaining what the element does and how it fits the workflow.

#### Scenario: Full tour walkthrough
- **WHEN** the user starts the tour
- **THEN** Driver.js highlights each element in sequence with a popover containing a title and description
- **AND** the user can navigate forward and backward through steps using Next/Previous buttons

#### Scenario: Welcome step is a centered modal
- **WHEN** the tour starts
- **THEN** the first step is a centered popover (no element highlighted) welcoming the user and explaining the workflow overview

#### Scenario: User dismisses tour early
- **WHEN** the user clicks the close button or presses Escape during any step
- **THEN** the tour ends immediately and all highlights are removed

### Requirement: First-visit welcome prompt
On the user's first visit (no `flink-fiddle-tour-dismissed` key in localStorage), the system SHALL automatically show the welcome tour step with a "Don't show again" checkbox. If the user checks the box, the preference MUST be persisted to localStorage under key `flink-fiddle-tour-dismissed` when the tour ends or is dismissed.

#### Scenario: First visit triggers tour prompt
- **WHEN** the page loads and `localStorage.getItem('flink-fiddle-tour-dismissed')` is null
- **THEN** the tour starts automatically from the welcome step

#### Scenario: User checks "Don't show again"
- **WHEN** the user checks the "Don't show again" checkbox and then closes or completes the tour
- **THEN** `localStorage.setItem('flink-fiddle-tour-dismissed', 'true')` is called

#### Scenario: Returning user with preference set
- **WHEN** the page loads and `localStorage.getItem('flink-fiddle-tour-dismissed')` returns `'true'`
- **THEN** the tour does NOT start automatically

#### Scenario: User does not check the box
- **WHEN** the user dismisses the tour without checking "Don't show again"
- **THEN** the tour will auto-start again on the next page load

### Requirement: On-demand Tour button
The system SHALL display a "Tour" button in the page header that triggers the guided tour on click. This button MUST be visible at all times regardless of the localStorage preference.

#### Scenario: Tour button triggers tour
- **WHEN** the user clicks the Tour button in the header
- **THEN** the guided tour starts from the welcome step

#### Scenario: Tour button visible for returning users
- **WHEN** the page loads with `flink-fiddle-tour-dismissed` set to `'true'`
- **THEN** the Tour button is still visible and functional in the header

### Requirement: Tour button styling
The Tour button SHALL be styled as a subtle secondary element in the header, visually consistent with the existing header brand area. It SHALL include an icon (or text label "Tour") and not clutter the main controls toolbar.

#### Scenario: Tour button appearance
- **WHEN** the page renders
- **THEN** the Tour button appears in the header area, right-aligned or after the brand title, with styling that matches the header's visual language
