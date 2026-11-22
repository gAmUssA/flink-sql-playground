/*
 * Job graph view: renders the optimized physical plan from POST /api/sessions/{id}/explain
 * (see ExplainResult on the backend) as a top-down DAG, sources first, sink last.
 *
 * - Exchange operators become labelled edges ("shuffle · hash[user_id]"): they are the network
 *   hops between tasks, not work on rows.
 * - Every operator shows the changelog it emits (+I / -U / +U / -D, the changelog tab's colours)
 *   and whether it keeps state. The operators where updates first appear are marked, since that
 *   is where a query stops being append-only.
 * - A sub-plan shared by several sinks (Reused in the plan text) is drawn once; later references
 *   show a "shared" stub.
 *
 * Pure string rendering, no DOM access: loaded as a classic script in the browser (global
 * JobGraph) and via require() in the Node unit tests.
 */
(function (root) {
  'use strict';

  // Changelog row kinds as the planner prints them → the changelog tab's notation and colour.
  const ROW_KINDS = {
    I: { op: '+I', cls: 'op-i', name: 'insert' },
    UB: { op: '-U', cls: 'op-du', name: 'update before (retract)' },
    UA: { op: '+U', cls: 'op-uu', name: 'update after' },
    D: { op: '-D', cls: 'op-d', name: 'delete' },
  };

  const STATE = {
    unbounded: { text: 'state grows with keys', title: 'Keeps state per key with no end: it grows with the key space unless state TTL is set.' },
    'time-bounded': { text: 'state freed by watermark', title: 'Keeps state per window, interval or version; the watermark frees it once that closes.' },
    pattern: { text: 'state per partial match', title: 'Keeps partial pattern matches per key; only a WITHIN clause bounds how long they live.' },
  };

  const DETAIL_KEYS = {
    Calc: ['where', 'select'],
    WatermarkAssigner: ['watermark'],
    GroupAggregate: ['groupBy'], GlobalGroupAggregate: ['groupBy'], LocalGroupAggregate: ['groupBy'],
    IncrementalGroupAggregate: ['groupBy'], HashAggregate: ['groupBy'], LocalHashAggregate: ['groupBy'],
    SortAggregate: ['groupBy'], LocalSortAggregate: ['groupBy'],
    Join: ['joinType', 'where'], IntervalJoin: ['joinType', 'where'], TemporalJoin: ['joinType', 'where'],
    WindowJoin: ['joinType', 'where'], LookupJoin: ['joinType', 'table'], HashJoin: ['joinType', 'where'],
    SortMergeJoin: ['joinType', 'where'], NestedLoopJoin: ['joinType', 'where'],
    WindowAggregate: ['window'], GlobalWindowAggregate: ['window'], LocalWindowAggregate: ['window'],
    GroupWindowAggregate: ['window'], WindowTableFunction: ['window'],
    Rank: ['partitionBy', 'orderBy'], WindowRank: ['partitionBy', 'orderBy'],
    Deduplicate: ['keep', 'key'], WindowDeduplicate: ['keep', 'partitionKeys'],
    OverAggregate: ['partitionBy', 'orderBy'], Match: ['partitionBy', 'orderBy'],
    Sort: ['orderBy'], SortLimit: ['orderBy', 'fetch'], Limit: ['fetch'],
    Union: ['union'], Sink: ['fields'], TableSourceScan: ['fields'], ChangelogNormalize: ['key'],
  };
  const MAX_DETAIL = 56;

  function esc(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function clip(text, max) {
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
  }

  /** One short line describing what the operator does, e.g. "groupBy user_id". */
  function detail(node) {
    const attrs = node.attrs || {};
    const keys = DETAIL_KEYS[node.kind] || Object.keys(attrs).filter((k) => k !== '_raw').slice(0, 1);
    const parts = keys.filter((k) => attrs[k] != null && attrs[k] !== '').map((k) => {
      if (k === 'joinType') return attrs[k].replace(/Join$/, '').toLowerCase();
      return `${k} ${attrs[k]}`;
    });
    return clip(parts.join(' · '), MAX_DETAIL);
  }

  /** Every attribute, one per line: the full text behind the clipped detail line. */
  function tooltip(node) {
    return Object.entries(node.attrs || {}).map(([k, v]) => `${k}=[${v}]`).join('\n');
  }

  /** "hash[user_id]" → "shuffle · hash[user_id]"; "single" → "gather · single". */
  function exchangeLabel(node) {
    const d = (node.attrs && node.attrs.distribution) || '';
    if (/^single/.test(d)) return `gather · ${d}`;
    if (/^broadcast/.test(d)) return `broadcast`;
    return d ? `shuffle · ${d}` : 'shuffle';
  }

  const isExchange = (n) => n && n.kind === 'Exchange' && n.inputs.length === 1;
  const updating = (mode) => Array.isArray(mode) && mode.some((k) => k !== 'I');

  /**
   * The changelog an operator emits. A sink emits nothing ([] in the plan), so it shows what it
   * receives: its input's changelog. Null for a batch plan.
   */
  function emitted(plan, node) {
    if (node.changelogMode == null) return null;
    if (node.changelogMode.length || !node.inputs.length) return node.changelogMode;
    const merged = new Set();
    node.inputs.forEach((i) => (emitted(plan, plan.nodes[i]) || []).forEach((k) => merged.add(k)));
    return ['I', 'UB', 'UA', 'D'].filter((k) => merged.has(k));
  }

  /** Ids of the operators that emit updates while every input is append-only. */
  function updateOrigins(plan) {
    const out = new Set();
    for (const n of plan.nodes) {
      if (!n.changelogMode || !updating(n.changelogMode)) continue;
      if (n.inputs.every((i) => !updating(emitted(plan, plan.nodes[i])))) out.add(n.id);
    }
    return out;
  }

  function chips(mode, label) {
    if (!mode || !mode.length) return '';
    return `<span class="pg-chips" aria-label="${esc(label)}: ${mode.map((k) => (ROW_KINDS[k] || { op: k }).op).join(' ')}">${
      mode.map((k) => {
        const m = ROW_KINDS[k] || { op: k, cls: '', name: k };
        return `<span class="pg-chip ${m.cls}" title="${esc(m.name)}">${esc(m.op)}</span>`;
      }).join('')}</span>`;
  }

  function nodeBox(plan, node, ctx) {
    const isSink = plan.roots.includes(node.id);
    const isSource = !node.inputs.length;
    const icon = isSource ? 'db' : isSink ? 'grid' : 'bolt';
    const mode = emitted(plan, node);
    const state = STATE[node.state];
    const origin = ctx.origins.has(node.id);
    const d = detail(node);
    const advice = (node.advice || []).map((a) => `<span class="pg-advice-ref" title="See plan advice ${a} below">advice ${a}</span>`).join('');
    const live = ctx.running ? ' is-live' : '';
    const rows = isSink && ctx.sinkRows != null && plan.roots.length === 1
      ? `<span class="pg-meta pg-sink-count">${ctx.sinkRows.toLocaleString('en-US')} rows received</span>` : '';
    return `<div class="pg-node${live}${origin ? ' is-origin' : ''}${isSink ? ' is-sink' : ''}" data-kind="${esc(node.kind)}" data-node="${node.id}" title="${esc(tooltip(node))}">
      <div class="pg-node-ic">${ctx.icon(icon, 15)}</div>
      <div class="pg-node-text">
        <span class="pg-node-name">${esc(node.label)}</span>
        ${d ? `<span class="pg-meta">${esc(d)}</span>` : ''}
        ${rows}
        ${(mode && mode.length) || state || advice || origin ? `<span class="pg-tags">${chips(mode, isSink ? 'receives' : 'emits')}${
          state ? `<span class="pg-state pg-state-${esc(node.state)}" title="${esc(state.title)}">${esc(state.text)}</span>` : ''}${
          origin ? '<span class="pg-origin">updates start here</span>' : ''}${advice}</span>` : ''}
      </div>
    </div>`;
  }

  function edge(ctx, label) {
    return `<div class="pg-edge${ctx.running ? ' is-flowing' : ''}${label ? ' has-label' : ''}"><span class="pg-edge-line"></span><span class="pg-dot"></span><span class="pg-dot d2"></span>${
      label ? `<span class="pg-edge-label">${esc(label)}</span>` : ''}</div>`;
  }

  /**
   * The column for one node: its inputs above (side by side when there are several), then the
   * edge into it, then the node. An Exchange contributes only its labelled edge.
   */
  function column(plan, id, ctx) {
    const node = plan.nodes[id];
    if (ctx.seen.has(id)) {
      return `<div class="pg-col"><div class="pg-node pg-shared" title="Shared sub-plan: drawn once, under the first sink that uses it"><div class="pg-node-text"><span class="pg-node-name">↺ ${esc(node.label)}</span><span class="pg-meta">shared with the plan above</span></div></div></div>`;
    }
    ctx.seen.add(id);
    if (isExchange(node)) {
      return `<div class="pg-col">${column(plan, node.inputs[0], ctx)}${edge(ctx, exchangeLabel(node))}</div>`;
    }
    let above = '';
    if (node.inputs.length === 1) {
      // An Exchange not drawn yet ends its column with its own labelled edge into this node.
      const input = plan.nodes[node.inputs[0]];
      const ownEdge = isExchange(input) && !ctx.seen.has(input.id);
      above = column(plan, input.id, ctx) + (ownEdge ? '' : edge(ctx));
    } else if (node.inputs.length > 1) {
      above = `<div class="pg-branches">${node.inputs.map((i) => `<div class="pg-branch">${column(plan, i, ctx)}</div>`).join('')}</div>${edge(ctx)}`;
    }
    return `<div class="pg-col">${above}${nodeBox(plan, node, ctx)}</div>`;
  }

  /**
   * HTML for the whole view. opts: { running, sinkRows, icon(name, size), rawOpen }.
   */
  function render(plan, opts) {
    const ctx = {
      running: !!opts.running,
      sinkRows: opts.sinkRows,
      icon: opts.icon || (() => ''),
      seen: new Set(),
      origins: updateOrigins(plan),
    };
    const trees = plan.roots.map((r) => `<div class="pg-tree">${column(plan, r, ctx)}</div>`).join('');
    const batch = plan.mode === 'BATCH';
    const originNames = [...ctx.origins].map((i) => plan.nodes[i].label);
    let insight;
    if (batch) {
      insight = 'Batch plan: each operator runs once over bounded input, so there is no changelog and no long-lived state.';
    } else if (originNames.length) {
      insight = `This query updates its results: ${originNames.join(', ')} turn${originNames.length === 1 ? 's' : ''} inserts into updates, so the changelog carries -U/+U${
        plan.nodes.some((n) => (n.changelogMode || []).includes('D')) ? ' and -D' : ''} rows.`;
    } else {
      insight = 'Append-only: every operator emits inserts only, so each result row is final when it arrives.';
    }
    const advice = (plan.advice || []).length
      ? `<ol class="pg-advice">${plan.advice.map((a) => `<li id="pg-advice-${a.id}"><span class="pg-advice-level pg-level-${esc(a.level.toLowerCase())}">${esc(a.level)} ${a.id}</span> ${esc(a.text)}</li>`).join('')}</ol>`
      : '';
    return `<div class="rv-plan">
      <p class="pg-insight">${esc(insight)}</p>
      <div class="pg-scroll"><div class="pg-forest">${trees}</div></div>
      ${advice}
      <details class="pg-raw"${opts.rawOpen ? ' open' : ''}><summary>Physical plan as text</summary><pre>${esc(plan.plan || '')}</pre></details>
    </div>`;
  }

  const JobGraph = { render, detail, exchangeLabel, emitted, updateOrigins, ROW_KINDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = JobGraph;
  else root.JobGraph = JobGraph;
})(typeof globalThis !== 'undefined' ? globalThis : this);
