'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const E = require(path.join(__dirname, '../../main/resources/META-INF/resources/js/embed-params.js'));

test('parse reads autorun, tab and theme', () => {
  assert.deepEqual(E.parse('?autorun=1&tab=changelog&theme=cobalt'), { autorun: true, tab: 'changelog', theme: 'cobalt' });
  assert.deepEqual(E.parse(''), { autorun: false, tab: null, theme: null });
});

test('parse only accepts autorun=1', () => {
  for (const v of ['0', 'true', 'yes', '', '2', '1 ']) assert.equal(E.parse(`?autorun=${v}`).autorun, false, v);
});

test('parse drops unknown tabs and themes, so params never reach the page as text', () => {
  const hostile = E.parse('?tab=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E&theme=__proto__');
  assert.deepEqual(hostile, { autorun: false, tab: null, theme: null });
  assert.equal(E.parse('?tab=constructor').tab, null);
  assert.equal(E.parse('?tab=CHANGELOG').tab, 'changelog');
});

test('toQuery leaves out defaults and invalid values', () => {
  assert.equal(E.toQuery({}), '');
  assert.equal(E.toQuery({ tab: 'table' }), '');
  assert.equal(E.toQuery({ autorun: true, tab: 'graph' }), '?autorun=1&tab=graph');
  assert.equal(E.toQuery({ tab: 'nope', theme: 'nope' }), '');
});

test('embedUrl sits next to the page, under a subpath too', () => {
  assert.equal(E.embedUrl('https://x.github.io/flink-sql-playground/', 'f=v1.abc'), 'https://x.github.io/flink-sql-playground/embed.html#f=v1.abc');
  assert.equal(E.embedUrl('https://app.example.com/f/abc123', 'f=v1.abc', { autorun: true }), 'https://app.example.com/f/embed.html?autorun=1#f=v1.abc');
  assert.equal(E.embedUrl('https://app.example.com/', 'f=v1.abc'), 'https://app.example.com/embed.html#f=v1.abc');
});

test('embedUrl and playgroundUrl drop whatever query and fragment the current page has', () => {
  assert.equal(E.embedUrl('https://app.example.com/?x=1#f=v1.old', 'f=v1.new'), 'https://app.example.com/embed.html#f=v1.new');
  assert.equal(E.playgroundUrl('https://app.example.com/embed.html?autorun=1#f=v1.old', 'f=v1.new'), 'https://app.example.com/#f=v1.new');
  assert.equal(E.playgroundUrl('https://x.github.io/flink-sql-playground/embed.html', 'f=v1.abc'), 'https://x.github.io/flink-sql-playground/#f=v1.abc');
});

test('iframeSnippet is lazy, sized, titled, and escapes the src', () => {
  const html = E.iframeSnippet('https://a.example/embed.html?autorun=1&tab=graph#f=v1.x"onload="y');
  assert.match(html, /^<iframe src="https:\/\/a\.example\/embed\.html\?autorun=1&amp;tab=graph#f=v1\.x&quot;onload=&quot;y"/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /width="100%" height="480"/);
  assert.match(html, /title="Flink SQL fiddle"/);
  assert.equal((html.match(/ onload=/g) || []).length, 0);
});
