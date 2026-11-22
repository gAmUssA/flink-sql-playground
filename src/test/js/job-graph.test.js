'use strict';
// Unit tests for js/job-graph.js: the plan → HTML rendering behind the Job Graph tab.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const JobGraph = require(path.join(__dirname, '../../main/resources/META-INF/resources/js/job-graph.js'));

const node = (id, kind, label, attrs, changelogMode, inputs, extra = {}) =>
  ({ id, kind, label, attrs, changelogMode, state: null, advice: [], inputs, ...extra });

// Sink ← GroupAggregate ← Exchange ← Source, plus a second sink sharing the source (Reused).
function plan(overrides = {}) {
  return {
    mode: 'STREAMING',
    roots: [0],
    advice: [],
    plan: 'Sink(...)',
    nodes: [
      node(0, 'Sink', 'Sink: collect', { fields: 'k, c' }, [], [1]),
      node(1, 'GroupAggregate', 'GroupAggregate', { groupBy: 'k', select: 'k, COUNT(*) AS c' }, ['I', 'UB', 'UA'], [2], { state: 'unbounded', advice: [1] }),
      node(2, 'Exchange', 'Exchange', { distribution: 'hash[k]' }, ['I'], [3]),
      node(3, 'TableSourceScan', 'Source: t', { table: '[c, d, t]', fields: 'k' }, ['I'], []),
    ],
    ...overrides,
  };
}

test('detail picks the attributes that say what an operator does', () => {
  assert.equal(JobGraph.detail(node(0, 'GroupAggregate', 'x', { groupBy: 'user_id', select: 'a' }, null, [])), 'groupBy user_id');
  assert.equal(JobGraph.detail(node(0, 'Join', 'x', { joinType: 'LeftOuterJoin', where: '=(a, b)' }, null, [])), 'leftouter · where =(a, b)');
  assert.equal(JobGraph.detail(node(0, 'Calc', 'x', { select: 'a, b', where: '>(a, 1)' }, null, [])), 'where >(a, 1) · select a, b');
  // An operator with no entry shows its first attribute.
  assert.equal(JobGraph.detail(node(0, 'Expand', 'x', { projects: 'a' }, null, [])), 'projects a');
  assert.equal(JobGraph.detail(node(0, 'Weird', 'x', { _raw: 'blob' }, null, [])), '');
  const long = JobGraph.detail(node(0, 'Calc', 'x', { select: 'a'.repeat(200) }, null, []));
  assert.ok(long.length <= 56 && long.endsWith('…'));
});

test('exchanges read as the kind of network hop they are', () => {
  const ex = (d) => JobGraph.exchangeLabel(node(0, 'Exchange', 'Exchange', { distribution: d }, null, [1]));
  assert.equal(ex('hash[user_id]'), 'shuffle · hash[user_id]');
  assert.equal(ex('single'), 'gather · single');
  assert.equal(ex('broadcast'), 'broadcast');
});

test('a sink shows the changelog it receives; batch nodes show none', () => {
  const p = plan();
  assert.deepEqual(JobGraph.emitted(p, p.nodes[0]), ['I', 'UB', 'UA']);
  assert.deepEqual(JobGraph.emitted(p, p.nodes[3]), ['I']);
  const b = plan({ mode: 'BATCH' });
  b.nodes.forEach((n) => { n.changelogMode = null; });
  assert.equal(JobGraph.emitted(b, b.nodes[0]), null);
});

test('updates start at the operators whose inputs are all append-only', () => {
  const p = plan();
  assert.deepEqual([...JobGraph.updateOrigins(p)], [1]);
  // A Calc above the aggregate passes updates through; it is not an origin.
  p.nodes[0].inputs = [4];
  p.nodes.push(node(4, 'Calc', 'Calc', { select: 'k' }, ['I', 'UB', 'UA'], [1]));
  assert.deepEqual([...JobGraph.updateOrigins(p)], [1]);
});

test('render: exchanges become labelled edges, chips use the changelog notation', () => {
  const html = JobGraph.render(plan({ advice: [{ id: 1, level: 'ADVICE', text: 'enable mini-batch' }] }), { running: false, sinkRows: 7 });
  assert.equal((html.match(/class="pg-node[ "]/g) || []).length, 3, 'Exchange is not a node');
  assert.match(html, /<span class="pg-edge-label">shuffle · hash\[k\]<\/span>/);
  assert.match(html, /<span class="pg-chip op-du" title="update before \(retract\)">-U<\/span>/);
  assert.match(html, /is-origin/);
  assert.match(html, /state grows with keys/);
  assert.match(html, /7 rows received/);
  assert.match(html, /<li id="pg-advice-1">.*enable mini-batch<\/li>/);
  assert.match(html, /GroupAggregate turns inserts into updates/);
});

test('render: append-only and batch plans explain themselves', () => {
  const append = plan();
  append.nodes[1].changelogMode = ['I'];
  assert.match(JobGraph.render(append, {}), /Append-only/);
  const batch = plan({ mode: 'BATCH' });
  batch.nodes.forEach((n) => { n.changelogMode = null; n.state = null; });
  const html = JobGraph.render(batch, {});
  assert.match(html, /Batch plan/);
  assert.doesNotMatch(html, /pg-chip /);
});

test('render: the sink count shows only when given, and only for a single sink', () => {
  assert.doesNotMatch(JobGraph.render(plan(), { sinkRows: null }), /rows received/);
  const two = plan({ roots: [0, 4] });
  two.nodes.push(node(4, 'Sink', 'Sink: audit', {}, [], [3]));
  assert.doesNotMatch(JobGraph.render(two, { sinkRows: 3 }), /rows received/);
});

test('render: a sub-plan shared by two sinks is drawn once', () => {
  const two = plan({ roots: [0, 4] });
  two.nodes.push(node(4, 'Sink', 'Sink: audit', {}, [], [3]));
  const html = JobGraph.render(two, {});
  assert.equal((html.match(/data-kind="TableSourceScan"/g) || []).length, 1);
  assert.match(html, /pg-shared/);
  assert.equal((html.match(/class="pg-tree"/g) || []).length, 2);
});

test('render: a join draws its inputs as side-by-side branches', () => {
  const p = {
    mode: 'STREAMING', roots: [0], advice: [], plan: '',
    nodes: [
      node(0, 'Sink', 'Sink: collect', {}, [], [1]),
      node(1, 'Join', 'Join', { joinType: 'InnerJoin' }, ['I'], [2, 3], { state: 'unbounded' }),
      node(2, 'TableSourceScan', 'Source: a', {}, ['I'], []),
      node(3, 'TableSourceScan', 'Source: b', {}, ['I'], []),
    ],
  };
  const html = JobGraph.render(p, {});
  assert.equal((html.match(/class="pg-branch"/g) || []).length, 2);
  assert.ok(html.indexOf('Source: a') < html.indexOf('Source: b'), 'left input first');
});

test('render escapes every string that comes from the plan', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const p = plan({ plan: evil, advice: [{ id: 1, level: '<b>', text: evil }] });
  p.nodes[0].label = evil;
  p.nodes[1].attrs = { groupBy: evil, [evil]: evil };
  p.nodes[1].kind = '"><script>';
  const html = JobGraph.render(p, {});
  assert.doesNotMatch(html, /<img|<script|<b>/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});
