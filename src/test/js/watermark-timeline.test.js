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

test('a spec with thousands of windows per record is treated as windowless, quickly', () => {
  const hop = { kind: 'HOP', sizeMs: 3600000, slideMs: 1, stepMs: 0, offsetMs: 0 };
  const ticks = Array.from({ length: 2000 }, (_, i) => ({ t: 1000 + i, wm: i ? 900 + i : null }));
  const started = Date.now();
  const a = W.analyze(meta(hop), ticks);
  assert.ok(Date.now() - started < 500, 'analyze stays fast');
  assert.equal(a.windowsSkipped, true);
  assert.equal(a.windows.length, 0);
  const html = W.render(meta(hop), ticks.slice(0, 5), { width: 400, height: 200 });
  assert.match(html, /too many windows to draw/);
  assert.doesNotMatch(html, /dropped \(/);
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
  assert.equal((html.match(/class="wt-dot /g) || []).length, 3);
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

test('zoom: in, out, pan and reset keep the view inside the recording', () => {
  const n = 500;
  let v = W.zoom(null, n, 'in');
  assert.deepEqual(v, { from: 124.75, to: 374.25 });
  v = W.zoom(v, n, 'left');
  assert.equal(v.from, 0);
  v = W.zoom(v, n, 'right');
  assert.ok(v.from > 0 && v.to < n);
  assert.equal(W.zoom(v, n, 'out'), null, 'zooming out past everything is the full view');
  assert.equal(W.zoom({ from: 10, to: 20 }, n, 'reset'), null);
  // Zooming in around a record keeps that record under the pointer.
  const at = W.zoom({ from: 0, to: 100 }, n, 'in', 80);
  assert.ok(Math.abs((80 - at.from) / (at.to - at.from) - 0.8) < 1e-9);
  // The deepest zoom still shows a few records.
  let deep = null;
  for (let k = 0; k < 20; k++) deep = W.zoom(deep, n, 'in', 250);
  assert.ok(deep.to - deep.from >= 6);
});

test('zoomed in, each watermark advance is marked and labelled with its jump', () => {
  const ticks = Array.from({ length: 40 }, (_, i) => ({ t: 10000 + i * 250, wm: i < 2 ? null : 8000 + Math.floor(i / 4) * 1000 }));
  const a = W.analyze(meta(tumble(5000)), ticks);
  assert.equal(a.stats.advances, 10);
  assert.deepEqual(a.advances.slice(0, 2), [{ i: 2, wm: 8000, by: null }, { i: 4, wm: 9000, by: 1000 }]);
  const html = W.render(meta(tumble(5000)), ticks, { width: 900, height: 300, view: { from: 0, to: 39 } });
  assert.equal((html.match(/class="wt-wm-step"/g) || []).length, 10);
  assert.match(html, /class="wt-wm-label"[^>]*>\+1\.0 s</);
  assert.match(html, /it advanced <b>10<\/b> times, every ~4 records/);
  const zoomed = W.render(meta(tumble(5000)), ticks, { width: 900, height: 300, view: { from: 10, to: 16 } });
  assert.match(zoomed, /records 11–17 of 40/);
  assert.equal((zoomed.match(/class="wt-dot /g) || []).length, 7);
  // Records 20 ms apart: the event-time axis is labelled in milliseconds.
  const fast = Array.from({ length: 30 }, (_, i) => ({ t: 10000 + i * 20, wm: 9000 + i * 20 }));
  const ms = W.render(meta(tumble(5000)), fast, { width: 900, height: 300, view: { from: 0, to: 8 } });
  assert.match(ms, /\d\d:\d\d:\d\d\.\d{3}<\/text>/);
});

test('the zoom bar disables what cannot be done', () => {
  const ticks = Array.from({ length: 50 }, (_, i) => ({ t: i * 100, wm: null }));
  const full = W.render(meta(null), ticks, { width: 600, height: 240 });
  assert.match(full, /data-wt-zoom="out"[^>]*disabled/);
  assert.match(full, /data-wt-zoom="reset"[^>]*disabled/);
  assert.doesNotMatch(full, /data-wt-zoom="in"[^>]*disabled/);
  const left = W.render(meta(null), ticks, { width: 600, height: 240, view: { from: 0, to: 20 } });
  assert.match(left, /data-wt-zoom="left"[^>]*disabled/);
  assert.doesNotMatch(left, /data-wt-zoom="right"[^>]*disabled/);
});

test('the visible range label names the records actually drawn, for fractional bounds too', () => {
  const ticks = Array.from({ length: 40 }, (_, i) => ({ t: 1000 + i * 100, wm: null }));
  const html = W.render(meta(null), ticks, { width: 600, height: 240, view: { from: 10.2, to: 20.8 } });
  assert.match(html, /records 12–21 of 40/);
  assert.equal((html.match(/class="wt-dot /g) || []).length, 10);
});

test('identical event times still get a time-axis label', () => {
  const ticks = Array.from({ length: 20 }, () => ({ t: 10005, wm: 9000 }));
  const html = W.render(meta(null), ticks, { width: 600, height: 240, view: { from: 2, to: 9 } });
  assert.ok((html.match(/class="wt-axis" x="\d+(\.\d)?" y="[\d.]+" text-anchor="end">\d\d:\d\d:\d\d/g) || []).length >= 1);
});

test('fire times are found by binary search on the watermark, and zooming reuses the analysis', () => {
  const hop = { kind: 'HOP', sizeMs: 64000, slideMs: 1000, stepMs: 0, offsetMs: 0 };
  const ticks = Array.from({ length: 1000 }, (_, i) => ({ t: i * 997, wm: i ? i * 997 - 5000 : null }));
  let started = Date.now();
  W.render(meta(hop), ticks, { width: 800, height: 300 });
  const first = Date.now() - started;
  started = Date.now();
  for (let k = 0; k < 20; k++) W.render(meta(hop), ticks, { width: 800, height: 300, view: { from: k * 10, to: k * 10 + 80 } });
  const zooms = Date.now() - started;
  assert.ok(first < 1500, `first render ${first} ms`);
  assert.ok(zooms < first * 20, `20 zoomed renders took ${zooms} ms`);
  const a = W.analyze(meta(hop), ticks);
  for (const w of a.windows.slice(0, 200)) {
    const expected = ticks.findIndex((k) => k.wm != null && k.wm >= w.end - 1);
    assert.equal(w.firedAt, expected < 0 ? null : expected);
  }
});
