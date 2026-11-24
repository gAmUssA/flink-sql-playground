'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { median } = require('../../../scripts/lighthouse-check.js');

test('median of an odd count is the middle value', () => {
  assert.strictEqual(median([81, 85, 83]), 83);
});

test('median of an even count is the mean of the two middle values', () => {
  assert.strictEqual(median([80, 84]), 82);
  assert.strictEqual(median([90, 70, 80, 100]), 85);
});

test('median of a single value is that value', () => {
  assert.strictEqual(median([87]), 87);
});

test('median does not depend on input order and leaves the input alone', () => {
  const input = [90, 10, 50, 30, 70];
  assert.strictEqual(median(input), 50);
  assert.deepStrictEqual(input, [90, 10, 50, 30, 70]);
});

test('one outlier run does not decide the score', () => {
  assert.strictEqual(median([82, 62, 83]), 82);
  assert.strictEqual(median([82, 99, 83]), 83);
});

test('median of nothing is an error', () => {
  assert.throws(() => median([]), /empty/);
});
