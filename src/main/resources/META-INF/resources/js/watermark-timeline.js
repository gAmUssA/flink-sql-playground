/*
 * Watermark timeline: draws the records of a query's watermarked source against the watermark,
 * from POST /api/sessions/{id}/timeline/stream (TimelineService on the backend).
 *
 * x = arrival order (left to right as records reached the operator), y = event time (up = later).
 * The rising step line is the watermark each record saw. With windows, each window is a band
 * across its event-time range; it fires when the watermark reaches its end (watermark >=
 * end - 1 ms, as Flink's window operators decide) and the band stops there. A record whose
 * windows had all fired when it arrived is dropped; one behind the watermark whose window was
 * still open is late but counted.
 *
 * Pure: analyze() is the model, render() returns an HTML string. Loaded as a classic script in
 * the browser (global WatermarkTimeline) and via require() in the Node unit tests.
 */
(function (root) {
  'use strict';

  const MAX_BANDS = 120; // more windows than this would be unreadable stripes; draw none

  /** The windows a record at event time t belongs to: [{ start, end }]. */
  function windowsFor(spec, t) {
    if (!spec) return [];
    const off = spec.offsetMs || 0;
    const floorTo = (x, unit) => Math.floor((x - off) / unit) * unit + off;
    if (spec.kind === 'HOP') {
      const out = [];
      for (let s = floorTo(t, spec.slideMs); s + spec.sizeMs > t; s -= spec.slideMs) out.push({ start: s, end: s + spec.sizeMs });
      return out.reverse();
    }
    if (spec.kind === 'CUMULATE') {
      const base = floorTo(t, spec.sizeMs);
      const out = [];
      for (let e = base + spec.stepMs; e <= base + spec.sizeMs; e += spec.stepMs) if (e > t) out.push({ start: base, end: e });
      return out;
    }
    const start = floorTo(t, spec.sizeMs);
    return [{ start, end: start + spec.sizeMs }];
  }

  const fired = (wm, end) => wm != null && wm >= end - 1;

  /**
   * meta: { table, rowtime, watermark, window }, ticks: [{ t, wm }] in arrival order.
   * Returns { points, windows, stats, range }.
   */
  function analyze(meta, ticks) {
    const spec = meta && meta.window;
    const windows = new Map(); // "start:end" → { start, end, kept, dropped, firedAt }
    const points = ticks.map((k, i) => {
      const own = windowsFor(spec, k.t);
      let missed = 0;
      for (const w of own) {
        const key = w.start + ':' + w.end;
        let win = windows.get(key);
        if (!win) windows.set(key, (win = { start: w.start, end: w.end, kept: 0, dropped: 0, firedAt: null }));
        if (fired(k.wm, w.end)) { win.dropped++; missed++; } else win.kept++;
      }
      let status = 'ok';
      if (own.length && missed === own.length) status = 'dropped';
      else if (missed) status = 'partial';
      else if (k.wm != null && k.t <= k.wm) status = 'late';
      return { i, t: k.t, wm: k.wm, status };
    });
    // A window fires at the first record whose watermark reaches its end.
    const sorted = [...windows.values()].sort((a, b) => a.end - b.end || a.start - b.start);
    for (const w of sorted) {
      const at = ticks.findIndex((k) => fired(k.wm, w.end));
      w.firedAt = at < 0 ? null : at;
    }
    const count = (s) => points.filter((p) => p.status === s).length;
    const lags = ticks.filter((k) => k.wm != null);
    let maxSeen = -Infinity;
    const delays = [];
    ticks.forEach((k) => { if (k.wm != null && maxSeen > -Infinity) delays.push(maxSeen - k.wm); maxSeen = Math.max(maxSeen, k.t); });
    const ts = ticks.flatMap((k) => (k.wm != null ? [k.t, k.wm] : [k.t]));
    return {
      points,
      windows: sorted,
      stats: {
        total: points.length,
        dropped: count('dropped'),
        partial: count('partial'),
        late: count('late'),
        firstWatermarkAt: lags.length ? ticks.indexOf(lags[0]) : null,
        lagMs: delays.length ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length) : null,
      },
      range: ts.length ? { min: Math.min(...ts), max: Math.max(...ts) } : null,
    };
  }

  function esc(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Wall-clock milliseconds → HH:MM:SS (the times are wall-clock values, so read as UTC). */
  function clock(ms) {
    return new Date(ms).toISOString().slice(11, 19);
  }

  function duration(ms) {
    if (ms % 3600000 === 0) return `${ms / 3600000} h`;
    if (ms % 60000 === 0) return `${ms / 60000} min`;
    if (ms % 1000 === 0) return `${ms / 1000} s`;
    return `${ms} ms`;
  }

  function describeWindow(spec) {
    if (!spec) return 'no windows';
    if (spec.kind === 'HOP') return `hopping ${duration(spec.sizeMs)} windows every ${duration(spec.slideMs)}`;
    if (spec.kind === 'CUMULATE') return `cumulating windows growing by ${duration(spec.stepMs)} up to ${duration(spec.sizeMs)}`;
    return `tumbling ${duration(spec.sizeMs)} windows`;
  }

  /** "nice" tick step for an event-time span, in ms. */
  function timeStep(span, slots) {
    const steps = [1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000, 900000, 1800000, 3600000];
    return steps.find((s) => span / s <= slots) || steps[steps.length - 1];
  }

  function chart(model, width, height) {
    const pad = { l: 62, r: 10, t: 10, b: 24 };
    const w = Math.max(width - pad.l - pad.r, 40);
    const h = Math.max(height - pad.t - pad.b, 40);
    const n = Math.max(model.points.length - 1, 1);
    const span = Math.max(model.range.max - model.range.min, 1000);
    const lo = model.range.min - span * 0.04;
    const hi = model.range.max + span * 0.04;
    const x = (i) => pad.l + (i / n) * w;
    const y = (t) => pad.t + h - ((t - lo) / (hi - lo)) * h;
    const f = (v) => Math.round(v * 10) / 10;
    let svg = '';

    // Window bands: across the event-time range; each ends where the window fired.
    const visible = model.windows.filter((wd) => wd.end > lo && wd.start < hi);
    if (visible.length <= MAX_BANDS) {
      visible.forEach((wd, k) => {
        const top = y(Math.min(wd.end, hi));
        const bottom = y(Math.max(wd.start, lo));
        const right = wd.firedAt == null ? pad.l + w : x(wd.firedAt);
        svg += `<rect class="wt-band${k % 2 ? ' alt' : ''}${wd.firedAt == null ? ' is-open' : ''}" x="${pad.l}" y="${f(top)}" width="${f(Math.max(right - pad.l, 1))}" height="${f(Math.max(bottom - top, 1))}"><title>${esc(`${clock(wd.start)}–${clock(wd.end)}: ${wd.kept} counted, ${wd.dropped} dropped${wd.firedAt == null ? ', not fired yet' : ''}`)}</title></rect>`;
        if (wd.firedAt != null) svg += `<line class="wt-fire" x1="${f(right)}" x2="${f(right)}" y1="${f(top)}" y2="${f(bottom)}"/>`;
      });
    }

    // Event-time grid and labels.
    const step = timeStep(hi - lo, Math.max(2, Math.floor(h / 34)));
    for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) {
      svg += `<line class="wt-grid" x1="${pad.l}" x2="${pad.l + w}" y1="${f(y(t))}" y2="${f(y(t))}"/>`;
      svg += `<text class="wt-axis" x="${pad.l - 6}" y="${f(y(t) + 3.5)}" text-anchor="end">${clock(t)}</text>`;
    }
    svg += `<text class="wt-axis" x="${pad.l + w}" y="${height - 6}" text-anchor="end">arrival order →</text>`;

    // Watermark as a step line through the watermark each record saw.
    let path = '';
    model.points.forEach((p) => {
      if (p.wm == null) return;
      path += path ? `H${f(x(p.i))}V${f(y(p.wm))}` : `M${f(x(p.i))} ${f(y(p.wm))}`;
    });
    if (path) svg += `<path class="wt-wm" d="${path}"/>`;

    // Records: dropped last so they sit on top.
    const order = { ok: 0, late: 1, partial: 2, dropped: 3 };
    [...model.points].sort((a, b) => order[a.status] - order[b.status]).forEach((p) => {
      svg += `<circle class="wt-dot is-${p.status}" cx="${f(x(p.i))}" cy="${f(y(p.t))}" r="2.6"/>`;
    });

    return `<svg class="wt-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Event time of each record against the watermark">${svg}</svg>`;
  }

  /**
   * HTML for the view. opts: { width, height, recording, truncated }.
   */
  function render(meta, ticks, opts) {
    const model = analyze(meta, ticks);
    const s = model.stats;
    const pct = (v) => (s.total ? Math.round((v / s.total) * 100) : 0);
    const spec = meta.window;
    const stats = [
      `<span class="wt-stat"><b>${s.total.toLocaleString('en-US')}</b> records${opts.recording ? ' so far' : ''}</span>`,
      spec ? `<span class="wt-stat is-dropped"><b>${s.dropped}</b> dropped (${pct(s.dropped)}%)</span>` : '',
      s.partial ? `<span class="wt-stat is-partial"><b>${s.partial}</b> missed some windows</span>` : '',
      `<span class="wt-stat is-late"><b>${s.late}</b> ${spec ? 'late but counted' : 'behind the watermark'}</span>`,
      s.lagMs != null ? `<span class="wt-stat">watermark trails by <b>${(s.lagMs / 1000).toFixed(1)} s</b></span>` : '',
    ].join('');
    const lead = `A sample of the <b>${esc(meta.table)}</b> stream by event time <code>${esc(meta.rowtime)}</code>, watermark <code>${esc(meta.watermark)}</code>, ${esc(describeWindow(spec))}.`;
    const body = model.range
      ? `<div class="wt-chart">${chart(model, opts.width || 640, opts.height || 280)}</div>`
      : `<p class="wt-wait">${opts.recording ? 'Waiting for the first records…' : 'The probe returned no records.'}</p>`;
    const legend = `<div class="wt-legend">
      <span><i class="wt-key is-ok"></i>on time</span>
      <span><i class="wt-key is-late"></i>${spec ? 'late, window still open' : 'behind the watermark'}</span>
      ${spec ? '<span><i class="wt-key is-dropped"></i>dropped: its window had fired</span><span><i class="wt-key wt-key-band"></i>window, until it fires</span>' : ''}
      <span><i class="wt-key wt-key-wm"></i>watermark</span>
    </div>`;
    const note = spec
      ? 'A window fires when the watermark reaches its end; records for it that arrive later are dropped. '
      : 'This query has no windows. Records behind the watermark are late: interval and temporal joins, OVER and MATCH_RECOGNIZE drop them. ';
    const sample = 'This is a sample of the stream, read by a second small job, not the rows of your run: a generated source (datagen, faker) makes new rows on every read, so the counts here differ from the results table while the pattern holds.';
    return `<div class="rv-timeline">
      <p class="wt-lead">${lead}</p>
      <div class="wt-stats">${stats}</div>
      ${body}
      ${legend}
      <p class="wt-note">${esc(note + sample)}${opts.truncated ? ' The recording stopped at the row or time limit.' : ''}</p>
    </div>`;
  }

  const WatermarkTimeline = { analyze, render, windowsFor, describeWindow, clock };
  if (typeof module !== 'undefined' && module.exports) module.exports = WatermarkTimeline;
  else root.WatermarkTimeline = WatermarkTimeline;
})(typeof globalThis !== 'undefined' ? globalThis : this);
