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

test('isFiddleFragment recognises the whole #f= namespace', () => {
  assert.equal(FiddleLink.isFiddleFragment('#f=v1.abc'), true);
  assert.equal(FiddleLink.isFiddleFragment('#f=v2.abc'), true);
  assert.equal(FiddleLink.isFiddleFragment('#f=v1'), true);
  assert.equal(FiddleLink.isFiddleFragment('#results'), false);
  assert.equal(FiddleLink.isFiddleFragment(''), false);
});

test('decode rejects an unsupported version or a truncated link', async () => {
  assert.equal(await FiddleLink.decode('#f=v2.' + (await FiddleLink.encode(FIDDLE)).slice('f=v1.'.length)), null);
  assert.equal(await FiddleLink.decode('#f=v1'), null);
  assert.equal(await FiddleLink.decode('#f=v1.'), null);
});

test('decode stops inflating a decompression bomb before parsing it', async () => {
  // 50 MB of one repeated character compresses to a few dozen KB.
  const bomb = await rawFragment({ s: 'a'.repeat(50 * 1024 * 1024), q: 'b', m: 'BATCH' });
  assert.ok(bomb.length < 200000, `bomb fragment is ${bomb.length} chars`);
  const before = process.memoryUsage().arrayBuffers;
  assert.equal(await FiddleLink.decode(bomb), null);
  assert.ok(process.memoryUsage().arrayBuffers - before < 5 * 1024 * 1024, 'inflated bytes must be capped');
});

test('decode still accepts fields at the limit, including JSON escapes', async () => {
  const fiddle = { schema: '"'.repeat(50000), query: '\\'.repeat(25000), mode: 'BATCH' };
  assert.deepEqual(await FiddleLink.decode(await FiddleLink.encode(fiddle)), fiddle);
});

test('rejects fields over the backend limit', async () => {
  await assert.rejects(FiddleLink.encode({ ...FIDDLE, query: 'x'.repeat(50001) }));
});
