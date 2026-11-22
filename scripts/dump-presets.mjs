// Writes the shipped example presets (js/examples.js) as JSON, with each schema split into
// statements the way the page splits them, so JVM smoke tests can plan every preset.
// Usage: node scripts/dump-presets.mjs <out.json>
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { maskSql } from '../src/main/frontend/sql-schema.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const examplesJs = path.join(root, 'src/main/resources/META-INF/resources/js/examples.js');
const examples = vm.runInNewContext(`${fs.readFileSync(examplesJs, 'utf8')}\n;EXAMPLES`, {}, { filename: examplesJs });

// Split on ';' outside comments and strings: maskSql blanks those while keeping offsets.
function statements(sql) {
  const masked = maskSql(sql);
  const out = [];
  let start = 0;
  for (let i = 0; i <= masked.length; i++) {
    if (i === masked.length || masked[i] === ';') {
      if (masked.slice(start, i).trim()) out.push(sql.slice(start, i).trim());
      start = i + 1;
    }
  }
  return out;
}

const presets = examples.map(({ title, mode, schema, query }) => ({
  title, mode, schema: statements(schema || ''), query: statements(query || ''),
}));
fs.mkdirSync(path.dirname(path.resolve(process.argv[2])), { recursive: true });
fs.writeFileSync(process.argv[2], JSON.stringify(presets, null, 2));
