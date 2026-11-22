'use strict';
// Deterministic backend stand-in for browser tests: every /api call the SPA makes gets a
// fixed answer, so layout tests need no Quarkus or Flink.

const COLUMNS = ['user_id', 'region', 'order_count', 'total_amount', 'avg_amount', 'first_seen', 'last_seen', 'status'];
const TYPES = ['INT', 'STRING', 'BIGINT', 'DOUBLE', 'DOUBLE', 'TIMESTAMP(3)', 'TIMESTAMP(3)', 'STRING'];
const row = (i) => [i, `region-${i}`, i * 10, i * 123.45, 12.34 + i, '2026-10-06 10:00:00.000', '2026-10-06 11:00:00.000', 'ACTIVE'];
const ROWS = [1, 2, 3, 4, 5].map(row);
const MANY_ROWS = Array.from({ length: 40 }, (_, i) => row(i + 1));
// 60 events, of which event 55 carries a long status, far wider than any changelog row: its
// values scroll sideways inside the row (#72), which wrapped them before.
const LONG_TAIL = Array.from({ length: 60 }, (_, i) => (i === 54
  ? [...row(i + 1).slice(0, 7), Array.from({ length: 14 }, (_, w) => `pending-review-step-${w + 1}`).join(' ')]
  : row(i + 1)));

// Plans for /explain, shaped like the backend's ExplainResult. Streaming: an aggregate over a
// join (two branches, shuffles, an update origin, advice). Batch: a hash aggregate.
const node = (id, kind, label, attrs, changelogMode, state, inputs, advice = []) =>
  ({ id, kind, label, attrs, changelogMode, state, advice, inputs });
const STREAM_PLAN = {
  mode: 'STREAMING',
  roots: [0],
  nodes: [
    node(0, 'Sink', 'Sink: collect', { table: '*anonymous_collect$1*', fields: 'region, order_count' }, [], null, [1]),
    node(1, 'GroupAggregate', 'GroupAggregate', { groupBy: 'region', select: 'region, COUNT(*) AS order_count' }, ['I', 'UB', 'UA'], 'unbounded', [2], [1]),
    node(2, 'Exchange', 'Exchange', { distribution: 'hash[region]' }, ['I'], null, [3]),
    node(3, 'Calc', 'Calc', { select: 'region' }, ['I'], null, [4]),
    node(4, 'Join', 'Join', { joinType: 'InnerJoin', where: '=(user_id, user_id0)' }, ['I'], 'unbounded', [5, 7]),
    node(5, 'Exchange', 'Exchange', { distribution: 'hash[user_id]' }, ['I'], null, [6]),
    node(6, 'TableSourceScan', 'Source: orders', { table: '[default_catalog, default_database, orders]', fields: 'user_id, amount' }, ['I'], null, []),
    node(7, 'Exchange', 'Exchange', { distribution: 'hash[user_id]' }, ['I'], null, [8]),
    node(8, 'TableSourceScan', 'Source: users', { table: '[default_catalog, default_database, users]', fields: 'user_id, region' }, ['I'], null, []),
  ],
  advice: [{ id: 1, level: 'ADVICE', text: "You might want to enable local-global two-phase optimization by configuring ('table.exec.mini-batch.enabled' to 'true')." }],
  plan: 'Sink(table=[*anonymous_collect$1*], fields=[region, order_count], changelogMode=[NONE])\n+- GroupAggregate(advice=[1], groupBy=[region], ...)',
};
const BATCH_PLAN = {
  mode: 'BATCH',
  roots: [0],
  nodes: [
    node(0, 'Sink', 'Sink: collect', { table: '*anonymous_collect$1*', fields: 'region, order_count' }, null, null, [1]),
    node(1, 'HashAggregate', 'HashAggregate', { isMerge: 'true', groupBy: 'region' }, null, null, [2]),
    node(2, 'Exchange', 'Exchange', { distribution: 'hash[region]' }, null, null, [3]),
    node(3, 'TableSourceScan', 'Source: orders', { table: '[default_catalog, default_database, orders]', fields: 'region' }, null, null, []),
  ],
  advice: [],
  plan: 'Sink(table=[*anonymous_collect$1*], fields=[region, order_count])',
};

/**
 * Records, as window.__webfontsSettled ('load' or 'error'), when the web fonts stylesheet
 * (#webfonts, preloaded in index.html and turned into a stylesheet by js/app.js) has settled, for
 * fontsReady in layout.js. A failed sheet leaves no trace on the element to read afterwards: its
 * `sheet` stays null, as it does while the sheet is pending. Load events do not reach the window,
 * so this listens on the document, in the capture phase.
 */
function recordWebFonts() {
  window.__webfontsSettled = null;
  const settle = (e) => {
    const link = e.target;
    if (link.id !== 'webfonts' || link.rel !== 'stylesheet' || (e.type === 'load' && !link.sheet)) return;
    window.__webfontsSettled = e.type;
  };
  document.addEventListener('load', settle, true);
  document.addEventListener('error', settle, true);
}

async function stubApi(page) {
  // Every test that opens the app stubs the API first, so the fonts record starts here too.
  await page.addInitScript(recordWebFonts);
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^.*\/api\//, '/api/');
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (path === '/api/sessions' && route.request().method() === 'POST') return json(201, { sessionId: 'test-session' });
    if (path === '/api/build-info') return json(200, { commit: 'test', branch: 'main' });
    if (/\/tables$/.test(path)) {
      return json(200, { tables: [{ name: 'orders', columns: COLUMNS.map((c, i) => ({ name: c, type: TYPES[i] })) }] });
    }
    if (/\/execute\/stream$/.test(path)) {
      // A query containing "-- stub: retractions" also updates row 1 and deletes row 3, so the
      // changelog shows all four ops (+I, -U, +U, -D).
      // One containing "-- stub: long tail" streams the 60 LONG_TAIL inserts instead.
      const retractions = /-- stub: retractions/.test(route.request().postData() || '');
      const inserts = /-- stub: long tail/.test(route.request().postData() || '') ? LONG_TAIL : ROWS;
      const changes = retractions ? [{ kind: '-U', values: ROWS[0] }, { kind: '+U', values: [1, ...ROWS[0].slice(1, 2), 11, ...ROWS[0].slice(3)] },
        { kind: '-D', values: ROWS[2] }] : [];
      const lines = [{ type: 'schema', columns: COLUMNS, columnTypes: TYPES },
        ...inserts.map((values) => ({ type: 'row', kind: '+I', values })), ...changes.map((c) => ({ type: 'row', ...c })),
        { type: 'end', rowCount: inserts.length + changes.length, truncated: false, executionTimeMs: 12 }];
      return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: lines.map((l) => JSON.stringify(l)).join('\n') + '\n' });
    }
    if (/\/execute$/.test(path)) {
      // A query containing "WHERE 1 = 0" returns a result schema with no rows; one containing
      // "-- stub: many rows" returns 40 rows, enough to scroll the results box in a tall window.
      const sql = route.request().postData() || '';
      const rows = /WHERE 1 = 0/i.test(sql) ? [] : /-- stub: many rows/.test(sql) ? MANY_ROWS : ROWS;
      return json(200, { columns: COLUMNS, columnTypes: TYPES, rows, rowKinds: rows.map(() => '+I'),
        rowCount: rows.length, executionTimeMs: 12, truncated: false });
    }
    if (/\/explain$/.test(path)) {
      // A statement containing "-- stub: ddl" has no plan (400 NOT_EXPLAINABLE).
      const body = JSON.parse(route.request().postData() || '{}');
      if (/-- stub: ddl/.test(body.sql || '')) return json(400, { error: 'Only queries, INSERT statements and statement sets have a job graph', code: 'NOT_EXPLAINABLE' });
      return json(200, body.mode === 'BATCH' ? BATCH_PLAN : STREAM_PLAN);
    }
    if (path === '/api/fiddles' && route.request().method() === 'POST') return json(201, { shortCode: 'abc123' });
    return json(404, { error: 'not stubbed: ' + path });
  });
}

module.exports = { stubApi, COLUMNS, STREAM_PLAN, BATCH_PLAN };
