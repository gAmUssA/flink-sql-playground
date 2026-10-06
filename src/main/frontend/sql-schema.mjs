// sql-schema.mjs — editor-independent SQL text analysis for autocomplete: tables declared by
// CREATE TABLE statements, tables a query reads, and the connector option a cursor inside a
// WITH (...) clause is typing. Plain functions over strings, unit-tested with node --test.

/** Connector options the playground allows (SecurityConstants.ALLOWED_CONNECTORS). `#` is a column. */
export const CONNECTOR_OPTIONS = {
  datagen: ['number-of-rows', 'rows-per-second', 'scan.parallelism', 'fields.#.kind', 'fields.#.min',
    'fields.#.max', 'fields.#.max-past', 'fields.#.length', 'fields.#.var-len', 'fields.#.start',
    'fields.#.end', 'fields.#.null-rate'],
  faker: ['number-of-rows', 'rows-per-second', 'fields.#.expression', 'fields.#.null-rate', 'fields.#.length'],
  print: ['print-identifier', 'standard-error', 'sink.parallelism'],
  blackhole: [],
};

/** Values worth offering for a few options; keys match CONNECTOR_OPTIONS after `#` expansion. */
const OPTION_VALUES = { 'kind': ['random', 'sequence'], 'standard-error': ['true', 'false'], 'var-len': ['true', 'false'] };

const NOT_COLUMNS = /^(watermark|primary|constraint|period|like|unique|foreign|check|index)$/i;

/** Blanks comments and string contents with spaces, keeping offsets and the quotes themselves. */
export function maskSql(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '-' && next === '-') {
      const end = text.indexOf('\n', i);
      const stop = end === -1 ? text.length : end;
      out += ' '.repeat(stop - i);
      i = stop;
    } else if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      out += text.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else if (c === "'" || c === '`' || c === '"') {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === c && text[j + 1] === c) { j += 2; continue; } // '' and `` escapes
        if (text[j] === c) break;
        j++;
      }
      out += c + text.slice(i + 1, j).replace(/[^\n]/g, ' ') + (j < text.length ? c : '');
      i = Math.min(j + 1, text.length);
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Unquotes a possibly qualified identifier (`cat`.`db`.`t` → t). */
function lastIdentifier(raw) {
  const parts = raw.match(/`(?:[^`]|``)*`|[^.\s]+/g) || [];
  const last = parts[parts.length - 1] || '';
  return last.startsWith('`') ? last.slice(1, -1).replace(/``/g, '`') : last;
}

/** Splits text on commas at parenthesis depth 0 (text must already be masked). */
function splitTopLevel(masked, original) {
  const pieces = [];
  let depth = 0;
  let angle = 0; // ROW<a INT, b INT>: only a type's < opens, so a > b in an expression does not close
  let start = 0;
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === '<' && /\b(?:array|map|row|multiset)\s*$/i.test(masked.slice(0, i))) angle++;
    else if (c === '>' && angle > 0) angle--;
    else if (c === ',' && depth === 0 && angle === 0) { pieces.push(original.slice(start, i)); start = i + 1; }
  }
  pieces.push(original.slice(start));
  return pieces.map((p) => p.trim()).filter(Boolean);
}

/** Index of the parenthesis closing the one at `open`, or -1 (masked text). */
function closingParen(masked, open) {
  let depth = 0;
  for (let i = open; i < masked.length; i++) {
    if (masked[i] === '(') depth++;
    else if (masked[i] === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

const CREATE_TABLE = /\bcreate\s+(?:temporary\s+)?table\s+(?:if\s+not\s+exists\s+)?((?:`(?:[^`]|``)*`|[\w$]+)(?:\s*\.\s*(?:`(?:[^`]|``)*`|[\w$]+))*)\s*\(/gi;

/**
 * Tables declared by CREATE [TEMPORARY] TABLE statements, with their physical, computed and
 * metadata columns: [{name, columns: [{name, type}]}]. An unfinished statement contributes the
 * columns typed so far.
 */
export function parseCreateTables(text) {
  const masked = maskSql(text);
  const tables = [];
  CREATE_TABLE.lastIndex = 0;
  let m;
  while ((m = CREATE_TABLE.exec(masked)) !== null) {
    const name = lastIdentifier(text.slice(m.index + m[0].indexOf(m[1]), m.index + m[0].indexOf(m[1]) + m[1].length));
    const open = m.index + m[0].length - 1;
    const close = closingParen(masked, open);
    const end = close === -1 ? masked.length : close;
    const columns = splitTopLevel(masked.slice(open + 1, end), text.slice(open + 1, end)).map((def) => {
      const col = def.match(/^(`(?:[^`]|``)*`|[\w$]+)\s+([\s\S]*)$/);
      if (!col || NOT_COLUMNS.test(col[1])) return null;
      const rest = col[2].trim();
      const type = /^as\b/i.test(rest) ? 'computed' : rest.split(/\s+(?:not\s+null|null|metadata|primary|comment)\b/i)[0].trim();
      return { name: lastIdentifier(col[1]), type };
    }).filter(Boolean);
    if (name) tables.push({ name, columns });
  }
  return tables;
}

/** Lower-cased names of the tables a statement reads or writes (FROM, JOIN, TABLE, INTO). */
export function referencedTables(text) {
  const masked = maskSql(text);
  const names = new Set();
  const re = /\b(?:from|join|table|into)\s+((?:`(?:[^`]|``)*`|[\w$]+)(?:\s*\.\s*(?:`(?:[^`]|``)*`|[\w$]+))*)/gi;
  let m;
  while ((m = re.exec(masked)) !== null) {
    const raw = text.slice(m.index + m[0].length - m[1].length, m.index + m[0].length);
    const name = lastIdentifier(raw);
    if (name && !/^(select|table|lateral|unnest|tumble|hop|cumulate|session)$/i.test(name)) names.add(name.toLowerCase());
  }
  return [...names];
}

/** Merges table lists; earlier lists win on a name clash (case-insensitive). */
export function mergeTables(...lists) {
  const seen = new Map();
  lists.flat().forEach((t) => { if (t && t.name && !seen.has(t.name.toLowerCase())) seen.set(t.name.toLowerCase(), t); });
  return [...seen.values()];
}

/**
 * Column completions for an unqualified name: columns of the tables the statement references
 * that are known, or of every known table when it references none of them.
 */
export function columnCandidates(statement, tables) {
  const refs = referencedTables(statement);
  const used = tables.filter((t) => refs.includes(t.name.toLowerCase()));
  const pool = used.length ? used : tables;
  const out = [];
  const seen = new Set();
  pool.forEach((t) => (t.columns || []).forEach((c) => {
    const key = c.name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label: c.name, detail: c.type ? `${c.type} · ${t.name}` : t.name });
  }));
  return out;
}

/** The statement around offset `pos`: text between the previous and the next top-level `;`. */
export function statementAt(text, pos) {
  const masked = maskSql(text);
  const start = masked.lastIndexOf(';', pos - 1) + 1;
  const next = masked.indexOf(';', pos);
  return { text: text.slice(start, next === -1 ? text.length : next), offset: start };
}

/**
 * When `before` (the statement text up to the cursor) ends inside an open quote in a CREATE
 * TABLE ... WITH (...) clause, returns what that quote is: an option key, or the value of `key`.
 * {kind: 'key'|'value', key, typed, connector, columns} or null.
 */
export function optionContext(before) {
  const masked = maskSql(before);
  const quote = masked.lastIndexOf("'");
  // An unterminated quote leaves an odd count of ' in the masked text.
  if (quote === -1 || (masked.split("'").length - 1) % 2 === 0) return null;
  const withMatch = [...masked.slice(0, quote).matchAll(/\bwith\s*\(/gi)].pop();
  if (!withMatch) return null;
  const open = withMatch.index + withMatch[0].length - 1;
  if (closingParen(masked, open) !== -1) return null;
  const head = masked.slice(0, withMatch.index);
  if (!/\bcreate\s+(?:temporary\s+)?table\b/i.test(head)) return null;

  const tables = parseCreateTables(before);
  const columns = tables.length ? tables[tables.length - 1].columns.map((c) => c.name) : [];
  const connectorMatch = before.slice(open).match(/'connector'\s*=\s*'([\w-]+)'/i);
  const connector = connectorMatch ? connectorMatch[1].toLowerCase() : null;
  const typed = before.slice(quote + 1);
  const valueOf = masked.slice(open + 1, quote).match(/'\s*=\s*$/);
  if (valueOf) {
    const keyEnd = open + 1 + valueOf.index;
    const keyStart = masked.lastIndexOf("'", keyEnd - 1);
    return { kind: 'value', key: before.slice(keyStart + 1, keyEnd), typed, connector, columns };
  }
  return { kind: 'key', key: null, typed, connector, columns };
}

/** Option keys (or values) to offer for an optionContext() result. */
export function optionCandidates(ctx) {
  if (!ctx) return [];
  if (ctx.kind === 'value') {
    if (ctx.key === 'connector') return Object.keys(CONNECTOR_OPTIONS);
    const last = ctx.key.split('.').pop();
    return OPTION_VALUES[last] || [];
  }
  const templates = ctx.connector ? CONNECTOR_OPTIONS[ctx.connector] || [] : [];
  const keys = ['connector'];
  templates.forEach((t) => {
    if (!t.includes('#')) keys.push(t);
    else ctx.columns.forEach((c) => keys.push(t.replace('#', c)));
  });
  return keys;
}

const NOT_ALIASES = /^(on|using|where|join|inner|left|right|full|cross|outer|natural|lateral|group|order|limit|having|window|union|except|intersect|for|match_recognize|tablesample|as)$/i;

/** Lower-cased alias → table name map for `FROM t a`, `JOIN t AS a`; each table also maps to itself. */
export function tableAliases(text) {
  const masked = maskSql(text);
  const aliases = Object.create(null); // a table may be named __proto__
  const re = /\b(?:from|join)\s+((?:`(?:[^`]|``)*`|[\w$]+)(?:\s*\.\s*(?:`(?:[^`]|``)*`|[\w$]+))*)(?:\s+(?:as\s+)?([\w$]+))?/gi;
  let m;
  while ((m = re.exec(masked)) !== null) {
    const nameEnd = m.index + m[0].indexOf(m[1]) + m[1].length;
    const table = lastIdentifier(text.slice(nameEnd - m[1].length, nameEnd));
    if (!table || /^table$/i.test(table)) continue;
    aliases[table.toLowerCase()] = table;
    if (m[2] && !NOT_ALIASES.test(m[2])) aliases[m[2].toLowerCase()] = table;
  }
  return aliases;
}

/** True when `before` (statement text up to the cursor) ends right after FROM, JOIN, TABLE or INTO. */
export function expectsTableName(before) {
  return /\b(?:from|join|table|into)\s+[\w$]*$/i.test(maskSql(before));
}
