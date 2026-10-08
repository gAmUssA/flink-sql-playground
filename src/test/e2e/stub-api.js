'use strict';
// Deterministic backend stand-in for browser tests: every /api call the SPA makes gets a
// fixed answer, so layout tests need no Quarkus or Flink.

const COLUMNS = ['user_id', 'region', 'order_count', 'total_amount', 'avg_amount', 'first_seen', 'last_seen', 'status'];
const TYPES = ['INT', 'STRING', 'BIGINT', 'DOUBLE', 'DOUBLE', 'TIMESTAMP(3)', 'TIMESTAMP(3)', 'STRING'];
const row = (i) => [i, `region-${i}`, i * 10, i * 123.45, 12.34 + i, '2026-10-06 10:00:00.000', '2026-10-06 11:00:00.000', 'ACTIVE'];
const ROWS = [1, 2, 3, 4, 5].map(row);
const MANY_ROWS = Array.from({ length: 40 }, (_, i) => row(i + 1));
// 60 events, of which event 55 carries a long status that wraps its changelog row taller than
// any of the 50 before it.
const LONG_TAIL = Array.from({ length: 60 }, (_, i) => (i === 54
  ? [...row(i + 1).slice(0, 7), Array.from({ length: 14 }, (_, w) => `pending-review-step-${w + 1}`).join(' ')]
  : row(i + 1)));

async function stubApi(page) {
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
    if (path === '/api/fiddles' && route.request().method() === 'POST') return json(201, { shortCode: 'abc123' });
    return json(404, { error: 'not stubbed: ' + path });
  });
}

module.exports = { stubApi, COLUMNS };
