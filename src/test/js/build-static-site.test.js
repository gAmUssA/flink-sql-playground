'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const site = require(path.join(__dirname, '../../../scripts/build-static-site.js'));

const API = 'https://api.example.com';
const HEADER_CSP = "default-src 'self'; frame-ancestors 'none'; script-src 'self' https://cdn.jsdelivr.net; connect-src 'self' https://cdn.jsdelivr.net";

test('meta CSP adds the api origin to connect-src and drops frame-ancestors', () => {
  assert.equal(site.metaCsp(HEADER_CSP, API),
    "default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; connect-src 'self' https://cdn.jsdelivr.net https://api.example.com");
});

test('meta CSP adds connect-src when the header has none', () => {
  assert.equal(site.metaCsp("default-src 'self'", API), "default-src 'self'; connect-src 'self' https://api.example.com");
});

test('readCsp finds the header value in application.properties', () => {
  const text = 'a=b\nquarkus.http.header."Content-Security-Policy".value=default-src \'self\'\nc=d';
  assert.equal(site.readCsp(text), "default-src 'self'");
  assert.throws(() => site.readCsp('a=b'), /No quarkus.http.header/);
});

test('validateArgs accepts a subpath and a bare https origin', () => {
  site.validateArgs('/flink-sql-playground/', API);
  site.validateArgs('/', API);
});

test('validateArgs rejects malformed base paths and origins', () => {
  assert.throws(() => site.validateArgs('flink-sql-playground', API), /base-path/);
  assert.throws(() => site.validateArgs('/x', API), /base-path/);
  assert.throws(() => site.validateArgs('/x/', 'http://api.example.com'), /https origin/);
  assert.throws(() => site.validateArgs('/x/', 'https://api.example.com/path'), /https origin/);
  assert.throws(() => site.validateArgs('/x/', 'not a url'), /not a URL/);
});

test('transformIndex rewrites the base tag and refuses a page without one', () => {
  const out = site.transformIndex('<head>\n    <base href="/" />\n</head>', '/sub/', "default-src 'self'");
  assert.match(out, /<base href="\/sub\/" \/>/);
  assert.ok(out.includes(`<meta http-equiv="Content-Security-Policy" content="default-src 'self'" />`), out);
  assert.throws(() => site.transformIndex('<head></head>', '/sub/', 'x'), /no <base href/);
});

test('build produces a site with base, config, CSP and 404 fallback', () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'static-site-')), 'site');
  try {
    const result = site.build(out, '/flink-sql-playground/', API);

    assert.ok(result.files.includes('index.html'));
    assert.ok(result.files.includes('404.html'));
    assert.ok(result.files.includes('js/app.js'));
    const index = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    assert.match(index, /<base href="\/flink-sql-playground\/" \/>/);
    assert.ok(result.files.includes('js/editor.bundle.js'));
    assert.match(index, /connect-src 'self' https:\/\/api\.example\.com/);
    assert.doesNotMatch(index, /jsdelivr/);
    assert.doesNotMatch(index, /frame-ancestors/);
    assert.equal(fs.readFileSync(path.join(out, '404.html'), 'utf8'), index);
    assert.equal(fs.readFileSync(path.join(out, 'js/config.js'), 'utf8').trim().split('\n').pop(),
      'window.API_BASE = "https://api.example.com";');
    assert.throws(() => site.build(out, '/flink-sql-playground/', API), /already exists/);
  } finally {
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
  }
});

test('build refuses a source without the editor bundle', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'static-site-'));
  const source = path.join(tmp, 'src');
  fs.mkdirSync(path.join(source, 'js'), { recursive: true });
  fs.writeFileSync(path.join(source, 'index.html'), '<head>\n    <base href="/" />\n</head>');
  try {
    assert.throws(() => site.build(path.join(tmp, 'site'), '/sub/', API, source), /editor\.bundle\.js is missing/);
    assert.equal(fs.existsSync(path.join(tmp, 'site')), false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
