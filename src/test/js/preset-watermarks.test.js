'use strict';
// Event-time hygiene of every shipped preset (js/examples.js), checked from the SQL text:
//
// - A WATERMARK is declared on a TIMESTAMP(3) / TIMESTAMP_LTZ(3) column of the same table, as
//   `col` or `col - INTERVAL 'n' UNIT` (bounded out-of-orderness).
// - The watermark delay matches what the preset promises (src/test/resources/
//   preset-watermarks.json): lossless presets wait at least as long as their generator scatters
//   event times (faker date.past, datagen max-past); lossy ones deliberately wait less.
// - Window TVFs and MATCH_RECOGNIZE use a time attribute: a watermarked column or PROCTIME().
// - A PROCTIME() column is not named like an event time, and carries no WATERMARK.
// - An event-time temporal join reads a versioned table: PRIMARY KEY plus WATERMARK.
//
// PresetWatermarkSmokeTest checks the same promises against real Flink with the timeline probe.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const EXAMPLES_JS = path.join(__dirname, '../../main/resources/META-INF/resources/js/examples.js');
const EXPECTATIONS = JSON.parse(fs.readFileSync(path.join(__dirname, '../resources/preset-watermarks.json'), 'utf8'));
const load = () => import(path.join(__dirname, '../../main/frontend/sql-schema.mjs'));

function presets() {
  return vm.runInNewContext(`${fs.readFileSync(EXAMPLES_JS, 'utf8')}\n;EXAMPLES`, {}, { filename: EXAMPLES_JS });
}

const UNIT_MS = { MILLISECOND: 1, SECOND: 1000, MINUTE: 60000, HOUR: 3600000, DAY: 86400000, SECONDS: 1000, MINUTES: 60000, HOURS: 3600000 };

/** The text inside the parenthesis that opens at `open`, matched on masked SQL (strings blanked). */
function parenBody(masked, original, open) {
  let depth = 0;
  for (let i = open; i < masked.length; i++) {
    if (masked[i] === '(') depth++;
    else if (masked[i] === ')' && --depth === 0) return { text: original.slice(open + 1, i), end: i };
  }
  return null;
}

/** Tables declared by a schema: columns, time attributes, watermark, key, generator disorder. */
function tables(schema, { stripComments, maskSql }) {
  const sql = stripComments(schema);
  const masked = maskSql(sql);
  const out = new Map();
  for (const m of masked.matchAll(/CREATE\s+(?:TEMPORARY\s+)?TABLE\s+`?(\w+)`?\s*\(/gi)) {
    const name = sql.slice(m.index, m.index + m[0].length).match(/TABLE\s+`?(\w+)/i)[1];
    const bodyRange = parenBody(masked, sql, m.index + m[0].length - 1);
    if (!bodyRange) continue;
    const withAt = masked.slice(bodyRange.end).search(/WITH\s*\(/i);
    const optionsRange = withAt < 0 ? { text: '' } : parenBody(masked, sql, bodyRange.end + masked.slice(bodyRange.end + withAt).indexOf('(') + withAt);
    const body = bodyRange.text;
    const options = optionsRange ? optionsRange.text : '';
    const t = { name, columns: new Map(), proctime: new Set(), watermark: null, primaryKey: /PRIMARY\s+KEY/i.test(body), disorder: new Map() };
    for (const line of body.split(/,\s*\n/)) {
      const l = line.trim();
      let w;
      if ((w = l.match(/^WATERMARK\s+FOR\s+`?(\w+)`?\s+AS\s+([\s\S]+)$/i))) {
        const [, col, expr] = w;
        const delay = expr.trim().match(/^`?(\w+)`?\s*-\s*INTERVAL\s+'(\d+)'\s+(\w+)$/i);
        const strict = expr.trim().match(/^`?(\w+)`?$/);
        t.watermark = { col, expr: expr.trim(),
          ref: delay ? delay[1] : strict ? strict[1] : null,
          delayMs: delay ? Number(delay[2]) * (UNIT_MS[delay[3].toUpperCase()] || NaN) : strict ? 0 : null };
      } else if ((w = l.match(/^`?(\w+)`?\s+AS\s+PROCTIME\(\)/i))) {
        t.proctime.add(w[1]);
      } else if ((w = l.match(/^`?(\w+)`?\s+(\w+(?:\(\d+\))?)/)) && !/^PRIMARY$/i.test(w[1])) {
        t.columns.set(w[1], w[2].toUpperCase());
      }
    }
    for (const o of options.matchAll(/'fields\.(\w+)\.expression'\s*=\s*'#\{date\.past\s+''(\d+)'',''(\w+)''\}'/gi)) {
      t.disorder.set(o[1], Number(o[2]) * (UNIT_MS[o[3].toUpperCase()] || NaN));
    }
    for (const o of options.matchAll(/'fields\.(\w+)\.max-past'\s*=\s*'(\d+)\s*(ms|s|min|h)'/gi)) {
      t.disorder.set(o[1], Number(o[2]) * { ms: 1, s: 1000, min: 60000, h: 3600000 }[o[3]]);
    }
    out.set(name.toLowerCase(), t);
  }
  return out;
}

test('every watermarked preset has a declared promise, and every promise a preset', () => {
  const titles = presets().filter((p) => /WATERMARK\s+FOR/i.test(p.schema)).map((p) => p.title);
  const promised = Object.keys(EXPECTATIONS).filter((k) => !k.startsWith('_'));
  assert.deepEqual([...titles].sort(), [...promised].sort(),
    'add the preset to src/test/resources/preset-watermarks.json as lossless or lossy');
});

test('watermarks: syntax, rowtime type, and a delay that keeps the preset\'s promise', async () => {
  const sqlSchema = await load();
  const problems = [];
  for (const p of presets()) {
    for (const t of tables(p.schema, sqlSchema).values()) {
      const where = `${p.title} / ${t.name}`;
      for (const pt of t.proctime) {
        if (/event/i.test(pt)) problems.push(`${where}: ${pt} AS PROCTIME() is processing time, but its name says event time`);
        if (t.watermark && t.watermark.col === pt) problems.push(`${where}: WATERMARK on the PROCTIME() column ${pt}`);
      }
      const wm = t.watermark;
      if (!wm) continue;
      const type = t.columns.get(wm.col);
      if (!type) { problems.push(`${where}: WATERMARK FOR ${wm.col}, which is not a physical column`); continue; }
      if (!/^TIMESTAMP(_LTZ)?\(3\)$/.test(type)) problems.push(`${where}: rowtime ${wm.col} is ${type}, expected TIMESTAMP(3) or TIMESTAMP_LTZ(3)`);
      if (wm.ref !== wm.col || wm.delayMs == null || Number.isNaN(wm.delayMs)) {
        problems.push(`${where}: watermark "${wm.expr}" is not ${wm.col} - INTERVAL 'n' UNIT`);
        continue;
      }
      const disorder = t.disorder.get(wm.col);
      const promise = EXPECTATIONS[p.title];
      if (disorder == null) { problems.push(`${where}: cannot tell how far ${wm.col} is scattered (no date.past / max-past)`); continue; }
      if (promise === 'lossless' && wm.delayMs < disorder) {
        problems.push(`${where}: promised lossless, but the watermark waits ${wm.delayMs} ms for ${disorder} ms of disorder`);
      }
      if (promise === 'lossy' && wm.delayMs >= disorder) {
        problems.push(`${where}: promised lossy, but the watermark (${wm.delayMs} ms) covers all ${disorder} ms of disorder`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

test('windows, MATCH_RECOGNIZE and temporal joins use time attributes the right way', async () => {
  const sqlSchema = await load();
  const problems = [];
  for (const p of presets()) {
    const ts = tables(p.schema, sqlSchema);
    const query = sqlSchema.stripComments(p.query);
    const isTime = (table, col) => {
      const t = ts.get(String(table).toLowerCase());
      return !!t && (t.proctime.has(col) || (t.watermark && t.watermark.col === col));
    };
    for (const m of query.matchAll(/\b(TUMBLE|HOP|CUMULATE|SESSION)\s*\(\s*TABLE\s+`?(\w+)`?\s*,\s*DESCRIPTOR\(\s*`?(\w+)`?\s*\)/gi)) {
      if (!isTime(m[2], m[3])) problems.push(`${p.title}: ${m[1]} on ${m[2]}.${m[3]}, which is neither watermarked nor PROCTIME()`);
    }
    for (const m of query.matchAll(/FROM\s+`?(\w+)`?\s+MATCH_RECOGNIZE\s*\([\s\S]*?ORDER\s+BY\s+`?(\w+)`?/gi)) {
      if (!isTime(m[1], m[2])) problems.push(`${p.title}: MATCH_RECOGNIZE orders by ${m[1]}.${m[2]}, which is not a time attribute`);
    }
    for (const m of query.matchAll(/JOIN\s+`?(\w+)`?\s+FOR\s+SYSTEM_TIME\s+AS\s+OF\s+`?\w+`?\.`?(\w+)`?/gi)) {
      const versioned = ts.get(m[1].toLowerCase());
      const left = [...ts.values()].find((t) => t.watermark && t.watermark.col === m[2]);
      if (left && (!versioned || !versioned.primaryKey || !versioned.watermark)) {
        problems.push(`${p.title}: event-time temporal join on ${m[1]}, which needs a PRIMARY KEY and a WATERMARK`);
      }
    }
  }
  assert.deepEqual(problems, []);
});
