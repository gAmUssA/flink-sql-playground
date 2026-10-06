'use strict';
// Deterministic backend stand-in for browser tests: every /api call the SPA makes gets a
// fixed answer, so layout tests need no Quarkus or Flink.

const COLUMNS = ['user_id', 'region', 'order_count', 'total_amount', 'avg_amount', 'first_seen', 'last_seen', 'status'];
const TYPES = ['INT', 'STRING', 'BIGINT', 'DOUBLE', 'DOUBLE', 'TIMESTAMP(3)', 'TIMESTAMP(3)', 'STRING'];
const ROWS = [1, 2, 3, 4, 5].map((i) => [
  i, `region-${i}`, i * 10, i * 123.45, 12.34 + i, '2026-10-06 10:00:00.000', '2026-10-06 11:00:00.000', 'ACTIVE',
]);

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
      const lines = [{ type: 'schema', columns: COLUMNS, columnTypes: TYPES },
        ...ROWS.map((values) => ({ type: 'row', kind: '+I', values })),
        { type: 'end', rowCount: ROWS.length, truncated: false, executionTimeMs: 12 }];
      return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: lines.map((l) => JSON.stringify(l)).join('\n') + '\n' });
    }
    if (/\/execute$/.test(path)) {
      return json(200, { columns: COLUMNS, columnTypes: TYPES, rows: ROWS, rowKinds: ROWS.map(() => '+I'),
        rowCount: ROWS.length, executionTimeMs: 12, truncated: false });
    }
    if (path === '/api/fiddles' && route.request().method() === 'POST') return json(201, { shortCode: 'abc123' });
    return json(404, { error: 'not stubbed: ' + path });
  });
}

module.exports = { stubApi, COLUMNS };
