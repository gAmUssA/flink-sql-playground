'use strict';
// Every table qualifier (`alias.` or `table.`) in a shipped preset query must resolve through
// tableAliases, so `alias.` completion works in each preset. Loads js/examples.js as the page does.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const load = () => import(path.join(__dirname, '../../main/frontend/sql-schema.mjs'));
const EXAMPLES_JS = path.join(__dirname, '../../main/resources/META-INF/resources/js/examples.js');

// MATCH_RECOGNIZE pattern variables are qualifiers that name no table.
const PATTERN_VARIABLES = { 'Fraud: Impossible Travel (MATCH_RECOGNIZE)': ['a', 'b'] };

function presets() {
  return vm.runInNewContext(`${fs.readFileSync(EXAMPLES_JS, 'utf8')}\n;EXAMPLES`, {}, { filename: EXAMPLES_JS });
}

test('every qualifier in every preset query resolves to a table', async () => {
  const { maskSql, statementAt, tableAliases } = await load();
  const examples = presets();
  assert.ok(examples.length > 0, 'js/examples.js declares no presets');
  const unresolved = [];
  let checked = 0;
  for (const { title, query } of examples) {
    const masked = maskSql(query);
    const allowed = PATTERN_VARIABLES[title] || [];
    // An identifier directly before a dot and a name: o.order_id, `t`.x. Masked text hides
    // strings and comments; a digit start (1.5) is a number.
    for (const m of masked.matchAll(/(?<![\w$.`])([A-Za-z_$][\w$]*|`[^`]*`)\s*\.\s*[`A-Za-z_$]/g)) {
      const qualifier = query.slice(m.index, m.index + m[1].length).replace(/^`|`$/g, '').toLowerCase();
      if (allowed.includes(qualifier)) continue;
      checked++;
      const stmt = statementAt(query, m.index);
      if (!(qualifier in tableAliases(stmt.text))) unresolved.push(`${title}: ${qualifier}.`);
    }
  }
  assert.ok(checked > 0, 'no qualifier found in any preset query');
  assert.deepEqual([...new Set(unresolved)], []);
});
