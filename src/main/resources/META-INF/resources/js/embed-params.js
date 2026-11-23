/*
 * Embed mode: URL params for embed.html, and the <iframe> snippet the Share menu copies.
 * Everything here is pure string work, so the Node unit tests cover it.
 *
 * Params are untrusted input (anyone can write the URL): each one is checked against a
 * fixed list and anything else is ignored, never echoed into the page.
 *
 * Loaded as a classic script in the browser (global EmbedParams) and via require() in the tests.
 */
(function (root) {
  'use strict';

  const TABS = ['table', 'changelog', 'graph', 'timeline'];
  const THEMES = ['nebula', 'carbon', 'cobalt'];
  // Default iframe box for the snippet: wide enough for the results table, tall enough for
  // the editor and a few rows. The embedder can change both.
  const DEFAULT_WIDTH = '100%';
  const DEFAULT_HEIGHT = 480;

  /** Reads ?autorun=1&tab=changelog&theme=cobalt. Unknown values are dropped. */
  function parse(search) {
    const params = new URLSearchParams(String(search || ''));
    const tab = (params.get('tab') || '').toLowerCase();
    const theme = (params.get('theme') || '').toLowerCase();
    return {
      autorun: params.get('autorun') === '1',
      tab: TABS.includes(tab) ? tab : null,
      theme: THEMES.includes(theme) ? theme : null,
    };
  }

  /** The query string for an embed link: only what differs from the defaults. */
  function toQuery({ autorun = false, tab = null, theme = null } = {}) {
    const params = new URLSearchParams();
    if (autorun) params.set('autorun', '1');
    if (TABS.includes(tab) && tab !== 'table') params.set('tab', tab);
    if (THEMES.includes(theme)) params.set('theme', theme);
    const text = params.toString();
    return text ? `?${text}` : '';
  }

  /** embed.html next to the page at `baseUrl`, carrying the fiddle fragment ("f=v1.…", no '#'). */
  function embedUrl(baseUrl, fragment, options) {
    const url = new URL('embed.html', baseUrl);
    return url.origin + url.pathname + toQuery(options) + (fragment ? `#${fragment}` : '');
  }

  /** The full app next to the page at `baseUrl`, with the same fragment. */
  function playgroundUrl(baseUrl, fragment) {
    const url = new URL('./', baseUrl);
    return url.origin + url.pathname + (fragment ? `#${fragment}` : '');
  }

  function escapeAttr(text) {
    return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** The snippet to paste into a blog post or a slide. */
  function iframeSnippet(src, { width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT, title = 'Flink SQL fiddle' } = {}) {
    return `<iframe src="${escapeAttr(src)}" title="${escapeAttr(title)}" width="${escapeAttr(width)}" height="${escapeAttr(height)}" `
      + 'loading="lazy" style="border:1px solid #8884;border-radius:8px" referrerpolicy="strict-origin-when-cross-origin" '
      + 'allow="clipboard-write"></iframe>';
  }

  const EmbedParams = { parse, toQuery, embedUrl, playgroundUrl, iframeSnippet, TABS, THEMES, DEFAULT_HEIGHT };
  if (typeof module !== 'undefined' && module.exports) module.exports = EmbedParams;
  else root.EmbedParams = EmbedParams;
})(typeof globalThis !== 'undefined' ? globalThis : this);
