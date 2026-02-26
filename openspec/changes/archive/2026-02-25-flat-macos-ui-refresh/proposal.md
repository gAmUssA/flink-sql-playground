## Why

The current UI uses monospace fonts (`SF Mono`) for buttons, selects, status text, and panel labels — making the toolbar and chrome look like code rather than a native application. macOS apps use the system sans-serif font (`-apple-system`) for UI controls and reserve monospace for content areas like editors and results. The overall aesthetic should feel flat and native, like a macOS developer tool.

## What Changes

- Switch buttons, selects, status text, panel labels, header, and schema browser UI elements from `--font-mono` to `--font-sans`
- Keep monospace only where it belongs: editor containers, results table data, and results metadata
- Increase border-radius on buttons and selects to 6px for a macOS-native rounded feel
- Adjust button padding and font-weight to match macOS system button proportions (regular weight, not bold)

## Capabilities

### New Capabilities
- `macos-flat-theme`: CSS-only design refresh switching UI chrome from monospace to system sans-serif with macOS-inspired flat styling

### Modified Capabilities

## Impact

- **Modified files**: `style.css` only — pure CSS change, no HTML or JS modifications
- **No backend changes**
- **No behavioral changes** — all functionality remains identical
