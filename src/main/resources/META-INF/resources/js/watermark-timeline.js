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
  // A record belongs to size/slide HOP windows (size/step CUMULATE ones). Past this many per
  // record (a 1 h window sliding every second is 3600) the model would cost millions of steps
  // per redraw, so such specs are treated as windowless and the view says why.
  const MAX_WINDOWS_PER_RECORD = 64;

  function windowsPerRecord(spec) {
    if (!spec) return 0;
    if (spec.kind === 'HOP') return spec.slideMs > 0 ? Math.ceil(spec.sizeMs / spec.slideMs) : Infinity;
    if (spec.kind === 'CUMULATE') return spec.stepMs > 0 ? Math.ceil(spec.sizeMs / spec.stepMs) : Infinity;
    return spec.sizeMs > 0 ? 1 : Infinity;
  }

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
  let cache = null;
  /** analyze() for render(): recomputed only when the recording changes, not on every zoom. */
  function analyzeCached(meta, ticks) {
    if (cache && cache.meta === meta && cache.ticks === ticks && cache.n === ticks.length) return cache.model;
    const model = analyze(meta, ticks);
    cache = { meta, ticks, n: ticks.length, model };
    return model;
  }

  function analyze(meta, ticks) {
    const requested = meta && meta.window;
    const tooMany = windowsPerRecord(requested) > MAX_WINDOWS_PER_RECORD;
    const spec = tooMany ? null : requested;
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
    // A window fires at the first record whose watermark reaches its end. The watermark a record
    // sees never goes down (null before the first), so that record is found by binary search.
    const sorted = [...windows.values()].sort((a, b) => a.end - b.end || a.start - b.start);
    const wmAt = (i) => (ticks[i].wm == null ? -Infinity : ticks[i].wm);
    for (const w of sorted) {
      let lo = 0, hi = ticks.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (wmAt(mid) >= w.end - 1) hi = mid; else lo = mid + 1; }
      w.firedAt = lo < ticks.length ? lo : null;
    }
    const count = (s) => points.filter((p) => p.status === s).length;
    const lags = ticks.filter((k) => k.wm != null);
    let maxSeen = -Infinity;
    const delays = [];
    ticks.forEach((k) => { if (k.wm != null && maxSeen > -Infinity) delays.push(maxSeen - k.wm); maxSeen = Math.max(maxSeen, k.t); });
    // Each time the watermark moves forward: the steps the zoomed view labels.
    const advances = [];
    let lastWm = null;
    ticks.forEach((k, i) => {
      if (k.wm != null && (lastWm == null || k.wm > lastWm)) { advances.push({ i, wm: k.wm, by: lastWm == null ? null : k.wm - lastWm }); lastWm = k.wm; }
    });
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
        advances: advances.length,
      },
      advances,
      range: ts.length ? { min: ts.reduce((a, b) => Math.min(a, b)), max: ts.reduce((a, b) => Math.max(a, b)) } : null,
      windowsSkipped: tooMany,
    };
  }

  function esc(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Wall-clock milliseconds → HH:MM:SS (the times are wall-clock values, so read as UTC). */
  function clock(ms, withMillis) {
    return new Date(ms).toISOString().slice(11, withMillis ? 23 : 19);
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

  const MIN_SPAN = 6; // records: the deepest zoom

  /** The visible record range: the whole recording unless a view is set. */
  function clampView(view, n) {
    const last = Math.max(n - 1, 0);
    if (!view || n < 2) return { from: 0, to: last, zoomed: false };
    let from = Math.max(0, Math.min(view.from, last));
    let to = Math.max(0, Math.min(view.to, last));
    if (to - from < MIN_SPAN) {
      const mid = (from + to) / 2;
      from = Math.max(0, Math.min(mid - MIN_SPAN / 2, last - MIN_SPAN));
      to = Math.min(last, from + MIN_SPAN);
    }
    return { from, to, zoomed: from > 0 || to < last };
  }

  /**
   * The next view for a zoom action: 'in' / 'out' halve or double the span around its centre
   * (or around `at`, a record index), 'left' / 'right' pan by half a span, 'reset' shows all.
   * Returns null for the full view.
   */
  function zoom(view, n, action, at) {
    if (action === 'reset' || n < 2) return null;
    const cur = clampView(view, n);
    const span = cur.to - cur.from;
    const centre = at == null ? (cur.from + cur.to) / 2 : at;
    let next;
    if (action === 'in' || action === 'out') {
      const s = action === 'in' ? Math.max(span / 2, MIN_SPAN) : span * 2;
      const share = span ? (centre - cur.from) / span : 0.5; // keep `at` under the pointer
      next = { from: centre - s * share, to: centre - s * share + s };
    } else {
      const shift = (action === 'left' ? -1 : 1) * span / 2;
      next = { from: cur.from + shift, to: cur.to + shift };
    }
    const width = next.to - next.from;
    if (next.from < 0) next = { from: 0, to: width };
    if (next.to > n - 1) next = { from: Math.max(0, n - 1 - width), to: n - 1 };
    const out = clampView(next, n);
    return out.zoomed ? { from: out.from, to: out.to } : null;
  }

  /** "nice" tick step for an event-time span, in ms. */
  function timeStep(span, slots) {
    const steps = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000, 900000, 1800000, 3600000];
    return steps.find((s) => span / s <= slots) || steps[steps.length - 1];
  }

  function chart(model, width, height, view) {
    const pad = { l: 78, r: 10, t: 16, b: 24 };
    const w = Math.max(width - pad.l - pad.r, 40);
    const h = Math.max(height - pad.t - pad.b, 40);
    const v = clampView(view, model.points.length);
    const visible = model.points.filter((p) => p.i >= v.from && p.i <= v.to);
    const ts = visible.flatMap((p) => (p.wm != null ? [p.t, p.wm] : [p.t]));
    const minT = ts.length ? ts.reduce((a, b) => Math.min(a, b)) : model.range.min;
    const maxT = ts.length ? ts.reduce((a, b) => Math.max(a, b)) : model.range.max;
    // At least 50 ms (zoomed) or 1 s of event time, centred on the data, so identical timestamps
    // still get a time-axis label.
    const span = Math.max(maxT - minT, v.zoomed ? 50 : 1000);
    const mid = (minT + maxT) / 2;
    const lo = mid - span * 0.56;
    const hi = mid + span * 0.56;
    const xspan = Math.max(v.to - v.from, 1);
    const x = (i) => pad.l + ((i - v.from) / xspan) * w;
    const y = (t) => pad.t + h - ((t - lo) / (hi - lo)) * h;
    const f = (val) => Math.round(val * 10) / 10;
    const detail = visible.length <= 90; // zoomed in far enough to label each watermark step
    // A label beside a mark at x: to its right, or to its left near the chart's right edge.
    const beside = (px, room) => (px + room > pad.l + w ? `x="${f(px - 4)}" text-anchor="end"` : `x="${f(px + 4)}"`);
    let svg = `<defs><clipPath id="wt-clip"><rect x="${pad.l}" y="${pad.t}" width="${f(w)}" height="${f(h)}"/></clipPath></defs><g clip-path="url(#wt-clip)">`;

    // Window bands: across the event-time range; each ends where the window fired.
    const bands = model.windows.filter((wd) => wd.end > lo && wd.start < hi && (wd.firedAt == null || wd.firedAt >= v.from));
    if (bands.length <= MAX_BANDS) {
      bands.forEach((wd, k) => {
        const top = y(Math.min(wd.end, hi));
        const bottom = y(Math.max(wd.start, lo));
        const right = wd.firedAt == null ? pad.l + w : Math.min(x(wd.firedAt), pad.l + w);
        svg += `<rect class="wt-band${k % 2 ? ' alt' : ''}${wd.firedAt == null ? ' is-open' : ''}" x="${pad.l}" y="${f(top)}" width="${f(Math.max(right - pad.l, 1))}" height="${f(Math.max(bottom - top, 1))}"><title>${esc(`${clock(wd.start)}–${clock(wd.end)}: ${wd.kept} counted, ${wd.dropped} dropped${wd.firedAt == null ? ', not fired yet' : ''}`)}</title></rect>`;
        if (wd.firedAt != null && wd.firedAt <= v.to) {
          svg += `<line class="wt-fire" x1="${f(right)}" x2="${f(right)}" y1="${f(top)}" y2="${f(bottom)}"/>`;
          if (detail) svg += `<text class="wt-fire-label" ${beside(right, 72)} y="${f(Math.max(top + 10, pad.t + 10))}">fires: ${wd.kept} in</text>`;
        }
      });
    }

    // Watermark as a step line through the watermark each record saw, entering from the left
    // edge with the watermark in force before the view.
    let path = '';
    let before = null;
    for (const p of model.points) { if (p.i >= v.from) break; if (p.wm != null) before = p.wm; }
    if (before != null) path = `M${pad.l} ${f(y(before))}`;
    visible.forEach((p) => {
      if (p.wm == null) return;
      path += path ? `H${f(x(p.i))}V${f(y(p.wm))}` : `M${f(x(p.i))} ${f(y(p.wm))}`;
    });
    if (path) svg += `<path class="wt-wm" d="${path}H${f(pad.l + w)}"/>`;

    // Each watermark advance: a marker, and when zoomed in, how far it jumped.
    let lastLabel = -Infinity;
    model.advances.filter((a) => a.i >= v.from && a.i <= v.to).forEach((a) => {
      svg += `<circle class="wt-wm-step" cx="${f(x(a.i))}" cy="${f(y(a.wm))}" r="${detail ? 3.2 : 2}"><title>${esc(`watermark ${clock(a.wm, true)}${a.by == null ? ' (first)' : `, +${(a.by / 1000).toFixed(3)} s`}`)}</title></circle>`;
      if (detail && x(a.i) - lastLabel >= 52) {
        lastLabel = x(a.i);
        svg += `<text class="wt-wm-label" ${beside(x(a.i), 56)} y="${f(y(a.wm) - 6)}">${esc(a.by == null ? 'first' : `+${(a.by / 1000).toFixed(a.by < 1000 ? 3 : 1)} s`)}</text>`;
      }
    });

    // Records: dropped last so they sit on top.
    const order = { ok: 0, late: 1, partial: 2, dropped: 3 };
    [...visible].sort((a, b) => order[a.status] - order[b.status]).forEach((p) => {
      svg += `<circle class="wt-dot is-${p.status}" cx="${f(x(p.i))}" cy="${f(y(p.t))}" r="${detail ? 3.4 : 2.6}"><title>${esc(`record ${p.i + 1}: event time ${clock(p.t, true)}, watermark ${p.wm == null ? 'none yet' : clock(p.wm, true)}`)}</title></circle>`;
    });
    svg += '</g>';

    // Event-time grid and labels (milliseconds once a step is under a second).
    const step = timeStep(hi - lo, Math.max(2, Math.floor(h / 34)));
    let grid = '';
    for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) {
      grid += `<line class="wt-grid" x1="${pad.l}" x2="${pad.l + w}" y1="${f(y(t))}" y2="${f(y(t))}"/>`;
      grid += `<text class="wt-axis" x="${pad.l - 6}" y="${f(y(t) + 3.5)}" text-anchor="end">${clock(t, step < 1000)}</text>`;
    }
    const range = v.zoomed && visible.length
      ? `records ${visible[0].i + 1}–${visible[visible.length - 1].i + 1} of ${model.points.length}` : 'arrival order';
    grid += `<text class="wt-axis" x="${pad.l + w}" y="${height - 6}" text-anchor="end">${range} →</text>`;

    return `<svg class="wt-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Event time of each record against the watermark" data-from="${v.from}" data-to="${v.to}" data-pl="${pad.l}" data-w="${f(w)}" data-n="${model.points.length}">${grid}${svg}</svg>`;
  }

  function zoomBar(model, view) {
    const n = model.points.length;
    const v = clampView(view, n);
    const btn = (action, label, text, disabled) =>
      `<button class="wt-zoom-btn" type="button" data-wt-zoom="${action}" aria-label="${label}" title="${label}"${disabled ? ' disabled' : ''}>${text}</button>`;
    return `<div class="wt-zoom" role="group" aria-label="Zoom the timeline">
      ${btn('in', 'Zoom in', '+', n < 2 || v.to - v.from <= MIN_SPAN)}${btn('out', 'Zoom out', '−', !v.zoomed)}
      ${btn('left', 'Earlier records', '◀', !v.zoomed || v.from <= 0)}${btn('right', 'Later records', '▶', !v.zoomed || v.to >= n - 1)}
      ${btn('reset', 'Show all records', 'All', !v.zoomed)}
      <span class="wt-zoom-hint">Drag across the chart to zoom into the watermark's steps.</span>
    </div>`;
  }

  /**
   * HTML for the view. opts: { width, height, recording, truncated }.
   */
  function render(meta, ticks, opts) {
    const model = analyzeCached(meta, ticks);
    const s = model.stats;
    const pct = (v) => (s.total ? Math.round((v / s.total) * 100) : 0);
    const spec = model.windowsSkipped ? null : meta.window;
    const stats = [
      `<span class="wt-stat"><b>${s.total.toLocaleString('en-US')}</b> records${opts.recording ? ' so far' : ''}</span>`,
      spec ? `<span class="wt-stat is-dropped"><b>${s.dropped}</b> dropped (${pct(s.dropped)}%)</span>` : '',
      s.partial ? `<span class="wt-stat is-partial"><b>${s.partial}</b> missed some windows</span>` : '',
      `<span class="wt-stat is-late"><b>${s.late}</b> ${spec ? 'late but counted' : 'behind the watermark'}</span>`,
      s.lagMs != null ? `<span class="wt-stat">watermark trails by <b>${(s.lagMs / 1000).toFixed(1)} s</b></span>` : '',
      s.advances ? `<span class="wt-stat">it advanced <b>${s.advances}</b> time${s.advances === 1 ? '' : 's'}${s.advances > 1 ? `, every ~${Math.round(s.total / s.advances)} records` : ''}</span>` : '',
    ].join('');
    const lead = `A sample of the <b>${esc(meta.table)}</b> stream by event time <code>${esc(meta.rowtime)}</code>, watermark <code>${esc(meta.watermark)}</code>, ${esc(describeWindow(meta.window))}${
      model.windowsSkipped ? ' (each record falls in too many windows to draw them)' : ''}.`;
    const body = model.range
      ? `${zoomBar(model, opts.view)}<div class="wt-chart">${chart(model, opts.width || 640, opts.height || 280, opts.view)}<div class="wt-brush" hidden></div></div>`
      : `<p class="wt-wait">${opts.recording ? 'Waiting for the first records…' : 'The probe returned no records.'}</p>`;
    const legend = `<div class="wt-legend">
      <span><i class="wt-key is-ok"></i>on time</span>
      <span><i class="wt-key is-late"></i>${spec ? 'late, window still open' : 'behind the watermark'}</span>
      ${spec ? '<span><i class="wt-key is-dropped"></i>dropped: its window had fired</span><span><i class="wt-key wt-key-band"></i>window, until it fires</span>' : ''}
      <span><i class="wt-key wt-key-wm"></i>watermark, a dot where it advances</span>
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

  const WatermarkTimeline = { analyze, render, windowsFor, describeWindow, clock, zoom, clampView };
  if (typeof module !== 'undefined' && module.exports) module.exports = WatermarkTimeline;
  else root.WatermarkTimeline = WatermarkTimeline;
})(typeof globalThis !== 'undefined' ? globalThis : this);
