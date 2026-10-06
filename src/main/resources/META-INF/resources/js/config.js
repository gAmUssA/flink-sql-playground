// Deployment config, loaded before app.js. The bundled app talks to its own origin, so
// API_BASE stays empty. The static GitHub Pages build replaces this file to point at the
// backend (see .github/workflows/pages.yml).
window.API_BASE = window.API_BASE || '';
