'use strict';
// Unit tests for js/watermark-timeline.js: which records a window drops, and the rendering.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const W = require(path.join(__dirname, '../../main/resources/META-INF/resources/js/watermark-timeline.js'));

const tumble = (size, offsetMs = 0) => ({ kind: 'TUMBLE', sizeMs: size, slideMs: size, stepMs: 0, offsetMs });
const meta = (window) => ({ table: 'clicks', rowtime: 'ts', watermark: 'ts - 2s', window });

test('windowsFor: tumbling, hopping and cumulating windows, with an offset', () => {
  assert.deepEqual(W.windowsFor(tumble(5000), 7000), [{ start: 5000, end: 10000 }]);
  assert.deepEqual(W.windowsFor(tumble(5000, 1000), 500), [{ start: -4000, end: 1000 }]);
  assert.deepEqual(W.windowsFor({ kind: 'HOP', sizeMs: 10000, slideMs: 5000, offsetMs: 0 }, 7000),
    [{ start: 0, end: 10000 }, { start: 5000, end: 15000 }]);
  assert.deepEqual(W.windowsFor({ kind: 'CUMULATE', sizeMs: 10000, slideMs: 10000, stepMs: 2000, offsetMs: 0 }, 5000),
    [{ start: 0, end: 6000 }, { start: 0, end: 8000 }, { start: 0, end: 10000 }]);
  assert.deepEqual(W.windowsFor(null, 5000), []);
});

test('a record is dropped once the watermark reaches its window end - 1 ms', () => {
  const ticks = [
    { t: 1000, wm: null },  // before any watermark: on time
    { t: 4000, wm: 4998 },  // window [0,5000) not fired yet (4998 < 4999), but behind the watermark: late
    { t: 3000, wm: 4999 },  // window [0,5000) fired: dropped
    { t: 6000, wm: 5000 },  // window [5000,10000) open, ahead of the watermark: on time
  ];
  const a = W.analyze(meta(tumble(5000)), ticks);
  assert.deepEqual(a.points.map((p) => p.status), ['ok', 'late', 'dropped', 'ok']);
  assert.deepEqual(a.windows.map((w) => [w.start, w.end, w.kept, w.dropped, w.firedAt]),
    [[0, 5000, 2, 1, 2], [5000, 10000, 1, 0, null]]);
  assert.equal(a.stats.dropped, 1);
  assert.equal(a.stats.late, 1);
  assert.equal(a.stats.firstWatermarkAt, 1);
});

test('a hopping record that misses only some of its windows is partial, not dropped', () => {
  const hop = { kind: 'HOP', sizeMs: 10000, slideMs: 5000, stepMs: 0, offsetMs: 0 };
  const a = W.analyze(meta(hop), [{ t: 7000, wm: 9999 }]); // [0,10000) fired, [5000,15000) open
  assert.equal(a.points[0].status, 'partial');
  assert.equal(a.stats.partial, 1);
  assert.equal(a.stats.dropped, 0);
});

test('without windows, records behind the watermark are late and nothing is dropped', () => {
  const a = W.analyze(meta(null), [{ t: 1000, wm: null }, { t: 500, wm: 900 }, { t: 2000, wm: 900 }]);
  assert.deepEqual(a.points.map((p) => p.status), ['ok', 'late', 'ok']);
  assert.equal(a.windows.length, 0);
});

test('the watermark lag is the average gap between the max event time seen and the watermark', () => {
  const a = W.analyze(meta(tumble(5000)), [{ t: 10000, wm: null }, { t: 9000, wm: 8000 }, { t: 12000, wm: 8000 }]);
  assert.equal(a.stats.lagMs, 2000);
});

test('render: stats, legend, the sample wording and one dot per record', () => {
  const ticks = [{ t: 1000, wm: null }, { t: 3000, wm: 4999 }, { t: 6000, wm: 5000 }];
  const html = W.render(meta(tumble(5000)), ticks, { width: 600, height: 240 });
  assert.equal((html.match(/<circle /g) || []).length, 3);
  assert.match(html, /<b>1<\/b> dropped \(33%\)/);
  assert.match(html, /A sample of the <b>clicks<\/b> stream/);
  assert.match(html, /not the rows of your run/);
  assert.match(html, /tumbling 5 s windows/);
  assert.match(html, /class="wt-wm"/);
  assert.match(html, /class="wt-band/);
  assert.match(html, /<svg class="wt-svg" width="600" height="240"/);
});

test('render: no windows means no dropped count or bands', () => {
  const html = W.render(meta(null), [{ t: 1000, wm: null }, { t: 500, wm: 900 }], { width: 400, height: 200 });
  assert.doesNotMatch(html, /dropped \(/);
  assert.doesNotMatch(html, /wt-band/);
  assert.match(html, /behind the watermark/);
});

test('render: waiting state before the first record', () => {
  assert.match(W.render(meta(tumble(5000)), [], { recording: true }), /Waiting for the first records/);
});

test('render escapes the table, rowtime and watermark text', () => {
  const html = W.render({ table: '<img src=x onerror=1>', rowtime: '<b>', watermark: '"><script>', window: null },
    [{ t: 1000, wm: null }], { width: 300, height: 200 });
  assert.doesNotMatch(html, /<img|<script/);
  assert.match(html, /<code>&lt;b&gt;<\/code>/);
  assert.match(html, /&lt;img src=x onerror=1&gt;/);
});

test('describeWindow and clock', () => {
  assert.equal(W.describeWindow({ kind: 'HOP', sizeMs: 60000, slideMs: 10000 }), 'hopping 1 min windows every 10 s');
  assert.equal(W.describeWindow({ kind: 'CUMULATE', sizeMs: 3600000, stepMs: 600000 }), 'cumulating windows growing by 10 min up to 1 h');
  assert.equal(W.clock(Date.UTC(2026, 0, 1, 9, 5, 7)), '09:05:07');
});
