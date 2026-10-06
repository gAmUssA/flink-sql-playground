'use strict';
// Which layout the page is rendering, read from the DOM, plus the phone criterion as the app
// and the stylesheet each define it. Used by the landscape and layout-criterion specs.
const { stubApi } = require('./stub-api');

async function openApp(page) {
  await stubApi(page);
  await page.goto('/');
  await page.waitForFunction(() => window.FlinkEditor && document.querySelectorAll('.cm-editor').length === 2);
}

/** What the phone criterion says, and what the page actually shows. */
async function layoutState(page) {
  return page.evaluate(() => {
    const box = (s) => document.querySelector(s).getBoundingClientRect();
    const shown = (s) => getComputedStyle(document.querySelector(s)).display !== 'none';
    // The stylesheet's phone block is the media rule that shows the view switcher.
    // Cross-origin sheets (Google Fonts) refuse cssRules with a SecurityError; anything else is a bug.
    const readable = [...document.styleSheets].flatMap((s) => {
      try { return [...s.cssRules]; } catch (e) { if (e.name !== 'SecurityError') throw e; return []; }
    });
    const phoneRule = readable.find((r) => r instanceof CSSMediaRule
      && [...r.cssRules].some((c) => c.selectorText === '.m-views' && c.style.display === 'flex'));
    const sidebar = box('#schema-browser');
    return {
      jsQuery: matchMedia(PHONE_QUERY).media,
      cssQuery: phoneRule ? phoneRule.media.mediaText : null,
      jsPhone: matchMedia(PHONE_QUERY).matches,
      tabs: shown('.m-views'),
      drawerButton: shown('#tables-drawer-btn'),
      // A docked sidebar sits in the flow beside the editors; the drawer is fixed and off-screen.
      dockedSidebar: getComputedStyle(document.getElementById('schema-browser')).position !== 'fixed'
        && sidebar.width > 0 && sidebar.right > 1,
      sideBySideEditors: shown('#schema-panel') && shown('#query-panel')
        && Math.abs(box('#schema-panel').top - box('#query-panel').top) < 1,
      panelsAreTabpanels: document.getElementById('query-panel').getAttribute('role') === 'tabpanel',
      sidebarInert: document.getElementById('schema-browser').inert,
    };
  });
}

const PHONE = { jsPhone: true, tabs: true, drawerButton: true, dockedSidebar: false, sideBySideEditors: false, panelsAreTabpanels: true };
const DESKTOP = { jsPhone: false, tabs: false, drawerButton: false, dockedSidebar: true, sideBySideEditors: true, panelsAreTabpanels: false };

/** Picks the layout fields PHONE / DESKTOP describe, so a mismatch names the field. */
function layoutOf(state) {
  return Object.fromEntries(Object.keys(PHONE).map((k) => [k, state[k]]));
}

module.exports = { openApp, layoutState, layoutOf, PHONE, DESKTOP };
