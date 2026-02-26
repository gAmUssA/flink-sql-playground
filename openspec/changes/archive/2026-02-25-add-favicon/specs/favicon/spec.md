## ADDED Requirements

### Requirement: Inline SVG favicon in HTML
The `index.html` page SHALL include a `<link rel="icon" type="image/svg+xml">` tag in the `<head>` section with an inline SVG data URI.

#### Scenario: Browser tab shows favicon
- **WHEN** a user navigates to the application in a modern browser
- **THEN** the browser tab SHALL display a recognizable icon (not a blank/default icon)

#### Scenario: No favicon 404 logged
- **WHEN** the browser requests a favicon for the page
- **THEN** no 404 error SHALL be logged by the server for `/favicon.ico`

#### Scenario: No external file dependency
- **WHEN** the favicon is rendered
- **THEN** it SHALL be served entirely from the inline data URI with zero additional HTTP requests
