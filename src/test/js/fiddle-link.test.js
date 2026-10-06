'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const FiddleLink = require(path.join(__dirname, '../../main/resources/META-INF/resources/js/fiddle-link.js'));

const FIDDLE = {
  schema: "CREATE TABLE orders (id INT, amount DOUBLE) WITH ('connector' = 'datagen');",
  query: 'SELECT id, SUM(amount) FROM orders GROUP BY id',
  mode: 'STREAMING',
};

test('round-trips a fiddle through the fragment', async () => {
  const fragment = await FiddleLink.encode(FIDDLE);

  assert.ok(fragment.startsWith('f=v1.'));
  assert.match(fragment.slice('f=v1.'.length), /^[A-Za-z0-9_-]+$/, 'payload is base64url, safe in a URL');
  assert.deepEqual(await FiddleLink.decode('#' + fragment), FIDDLE);
  assert.deepEqual(await FiddleLink.decode(fragment), FIDDLE);
});

test('round-trips non-ASCII SQL', async () => {
  const fiddle = { schema: '-- данные 数据 ✓', query: "SELECT 'café' AS x", mode: 'BATCH' };
  assert.deepEqual(await FiddleLink.decode(await FiddleLink.encode(fiddle)), fiddle);
});

test('compresses repetitive SQL below its raw length', async () => {
  const query = 'SELECT a, b, c FROM t WHERE a > 1 UNION ALL '.repeat(50) + 'SELECT 1, 2, 3';
  const fragment = await FiddleLink.encode({ schema: 'CREATE TABLE t (a INT)', query, mode: 'BATCH' });
  assert.ok(fragment.length < query.length / 4, `fragment length ${fragment.length}`);
});

test('ignores fragments that are not fiddle links', async () => {
  assert.equal(await FiddleLink.decode(''), null);
  assert.equal(await FiddleLink.decode('#results'), null);
  assert.equal(await FiddleLink.decode(undefined), null);
});

test('rejects a corrupted payload', async () => {
  assert.equal(await FiddleLink.decode('#f=v1.not-valid-deflate'), null);
});

// Builds a v1 fragment from an arbitrary payload, bypassing encode()'s validation.
async function rawFragment(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const piped = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const deflated = Buffer.from(await new Response(piped).arrayBuffer());
  return 'f=v1.' + deflated.toString('base64url');
}

test('decode rejects a tampered link with an unknown mode', async () => {
  assert.deepEqual(await FiddleLink.decode(await rawFragment({ s: 'a', q: 'b', m: 'BATCH' })),
      { schema: 'a', query: 'b', mode: 'BATCH' });
  assert.equal(await FiddleLink.decode(await rawFragment({ s: 'a', q: 'b', m: 'DROP' })), null);
  assert.equal(await FiddleLink.decode(await rawFragment({ s: 1, q: 'b', m: 'BATCH' })), null);
});

test('encode rejects an unknown mode', async () => {
  await assert.rejects(FiddleLink.encode({ ...FIDDLE, mode: 'DROP' }), /mode BATCH or STREAMING/);
});

test('rejects fields over the backend limit', async () => {
  await assert.rejects(FiddleLink.encode({ ...FIDDLE, query: 'x'.repeat(50001) }));
});
