'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const { createServer, acceptsGzip } = require(path.join(__dirname, '../../../scripts/serve-static.js'));

test('acceptsGzip reads the gzip quality value', () => {
  assert.equal(acceptsGzip('gzip, deflate, br'), true);
  assert.equal(acceptsGzip('br;q=1.0, gzip;q=0.8'), true);
  assert.equal(acceptsGzip('identity, gzip;q=0'), false);
  assert.equal(acceptsGzip('gzip; q=0.000'), false);
  assert.equal(acceptsGzip('GZIP'), true);
  assert.equal(acceptsGzip('x-gzip'), true);
  assert.equal(acceptsGzip('*'), true);
  assert.equal(acceptsGzip('*;q=0'), false);
  assert.equal(acceptsGzip('gzip;q=0, *'), false); // gzip's own entry wins over *
  assert.equal(acceptsGzip('identity'), false);
  assert.equal(acceptsGzip(''), false);
  assert.equal(acceptsGzip(undefined), false);
});

/** Status and Content-Encoding of GET / with `encoding` as Accept-Encoding. */
function get(port, encoding) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: '/', headers: { 'Accept-Encoding': encoding } }, (res) => {
      res.resume();
      res.on('end', () => resolve([res.statusCode, res.headers['content-encoding'] || null]));
    }).on('error', reject);
  });
}

test('the static server skips gzip when the client gives it q=0', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'serve-static-'));
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>t</title>');
  const server = createServer(root);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    assert.deepEqual(await get(port, 'gzip'), [200, 'gzip']);
    assert.deepEqual(await get(port, 'identity, gzip;q=0'), [200, null]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
