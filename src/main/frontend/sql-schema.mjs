// sql-schema.mjs — editor-independent SQL text analysis for autocomplete: tables declared by
// CREATE TABLE statements, tables a query reads, and the connector option a cursor inside a
// WITH (...) clause is typing. Plain functions over strings, unit-tested with node --test.

/** Connectors the playground allows (SecurityConstants.ALLOWED_CONNECTORS) and their table options. */
export const CONNECTOR_OPTIONS = {
  datagen: ['number-of-rows', 'rows-per-second', 'scan.parallelism'],
  faker: ['number-of-rows', 'rows-per-second'],
  print: ['print-identifier', 'standard-error', 'sink.parallelism'],
  blackhole: [],
};

/**
 * Per-column datagen options by type family, as Flink 2.2's DataGenTableSourceFactory accepts
 * them: min / max for numbers, max-past for timestamps, length for variable-length strings and
 * bytes and for collections, var-len for variable-length strings and bytes, start / end
 * (sequence) for numbers, strings and bytes.
 */
const DATAGEN_COLUMN_OPTIONS = {
  numeric: ['kind', 'min', 'max', 'start', 'end', 'null-rate'],
  interval: ['kind', 'min', 'max', 'null-rate'],
  varchar: ['kind', 'length', 'var-len', 'start', 'end', 'null-rate'],
  char: ['kind', 'start', 'end', 'null-rate'],
  timestamp: ['kind', 'max-past', 'null-rate'],
  collection: ['kind', 'length', 'null-rate'],
  other: ['kind', 'null-rate'],
};

/** Values worth offering for a few options, by the last segment of the option key. */
const OPTION_VALUES = { 'kind': ['random', 'sequence'], 'standard-error': ['true', 'false'], 'var-len': ['true', 'false'] };

// Object.hasOwn needs Safari 15.4; the bundle targets Safari 15.
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

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

/**
 * Splits text on commas at parenthesis depth 0. Returns [{masked, raw}] pieces, trimmed by the
 * masked text, so a comment around a piece is left out of it.
 */
function splitTopLevel(masked, original) {
  const pieces = [];
  let depth = 0;
  let angle = 0; // ROW<a INT, b INT>: only a type's < opens, so a > b in an expression does not close
  let start = 0;
  const push = (from, to) => {
    const piece = masked.slice(from, to);
    const lead = piece.length - piece.trimStart().length;
    const end = piece.trimEnd().length;
    if (end > lead) pieces.push({ masked: piece.slice(lead, end), raw: original.slice(from + lead, from + end) });
  };
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === '<' && /\b(?:array|map|row|multiset)\s*$/i.test(masked.slice(0, i))) angle++;
    else if (c === '>' && angle > 0) angle--;
    else if (c === ',' && depth === 0 && angle === 0) { push(start, i); start = i + 1; }
  }
  push(start, masked.length);
  return pieces;
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
 * metadata columns: [{name, columns: [{name, type, kind}]}], kind being 'physical', 'computed'
 * or 'metadata'. An unfinished statement contributes the columns typed so far.
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
      // Matched on masked text, so comments cannot hide a definition; names and types are read raw.
      const col = def.masked.match(/^(`(?:[^`]|``)*`|[\w$]+)\s+([\s\S]*)$/);
      if (!col) return null;
      const rawName = def.raw.slice(0, col[1].length);
      if (NOT_COLUMNS.test(rawName)) return null;
      const rest = col[2];
      const restStart = def.masked.length - rest.length;
      const computed = /^as\b/i.test(rest);
      const typeEnd = rest.split(/\s+(?:not\s+null|null|metadata|primary|comment)\b/i)[0].trimEnd().length;
      const type = computed ? 'computed'
        : def.raw.slice(restStart, restStart + typeEnd).replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, '').trim();
      const kind = computed ? 'computed' : /\bmetadata\b/i.test(rest) ? 'metadata' : 'physical';
      return { name: lastIdentifier(rawName), type, kind };
    }).filter(Boolean);
    if (name) tables.push({ name, columns });
  }
  return tables;
}

const NAME = /(?:`(?:[^`]|``)*`|[\w$]+)(?:\s*\.\s*(?:`(?:[^`]|``)*`|[\w$]+))*/y;
const WORD = /`(?:[^`]|``)*`|[\w$]+/y;
const NOT_TABLES = /^(select|table|lateral|unnest|tumble|hop|cumulate|session)$/i;
const NOT_ALIASES = /^(on|using|where|join|inner|left|right|full|cross|outer|natural|lateral|group|order|limit|having|window|union|except|intersect|for|match_recognize|tablesample|as|table)$/i;

/** The text `re` (sticky) matches at offset `i` of `masked`, or null. */
function matchAt(re, masked, i) {
  re.lastIndex = i;
  const m = re.exec(masked);
  return m ? m[0] : null;
}

/** Offset of the first non-space character at or after `i`. */
function skipSpace(masked, i) {
  while (i < masked.length && /\s/.test(masked[i])) i++;
  return i;
}

/**
 * Relations a statement reads or writes, [{table, alias}] in keyword order: every item of a
 * comma-separated FROM list, each JOIN target, and TABLE / INTO targets. An alias is recorded
 * for FROM and JOIN items (null when absent); a clause keyword is never taken as one. Subqueries
 * and table functions are skipped as items; the TABLE inside a window function is its own target.
 */
export function statementRelations(text) {
  const masked = maskSql(text);
  const relations = [];
  const keyword = /\b(from|join|table|into)\b/gi;
  let m;
  while ((m = keyword.exec(masked)) !== null) {
    const kind = m[1].toLowerCase();
    let i = m.index + m[0].length;
    for (;;) {
      i = skipSpace(masked, i);
      if (matchAt(/lateral\b/iy, masked, i)) i = skipSpace(masked, i + 7); // LATERAL TABLE(...)
      let table = null;
      const name = masked[i] === '(' ? null : matchAt(NAME, masked, i);
      if (name) {
        const start = i;
        i += name.length;
        if (masked[skipSpace(masked, i)] !== '(') {
          const t = lastIdentifier(text.slice(start, i));
          if (!NOT_TABLES.test(t)) table = t;
        } else i = skipSpace(masked, i); // a table function: TABLE(...), UNNEST(...)
      }
      if (masked[i] === '(') {
        const close = closingParen(masked, i);
        if (close === -1) break;
        i = close + 1;
      } else if (!name) break;
      if (kind === 'table' || kind === 'into') {
        if (table) relations.push({ table, alias: null });
        break;
      }
      let alias = null;
      let j = skipSpace(masked, i);
      if (matchAt(/as\b/iy, masked, j)) j = skipSpace(masked, j + 2);
      const word = matchAt(WORD, masked, j);
      if (word) {
        const raw = text.slice(j, j + word.length);
        // A backticked alias may be any word, a reserved one included.
        if (raw.startsWith('`')) alias = lastIdentifier(raw);
        else if (!NOT_ALIASES.test(raw)) alias = raw;
        if (alias !== null) i = j + word.length;
      }
      if (table) relations.push({ table, alias });
      if (kind !== 'from') break;
      i = skipSpace(masked, i);
      if (alias !== null && masked[i] === '(') { // AS t(a, b): a column list after the alias
        const close = closingParen(masked, i);
        if (close === -1) break;
        i = skipSpace(masked, close + 1);
      }
      if (masked[i] !== ',') break;
      i++;
    }
  }
  return relations;
}

/** Lower-cased names of the tables a statement reads or writes (FROM, JOIN, TABLE, INTO). */
export function referencedTables(text) {
  return [...new Set(statementRelations(text).map((r) => r.table.toLowerCase()))];
}

/** Merges table lists; earlier lists win on a name clash (case-insensitive). */
export function mergeTables(...lists) {
  const seen = new Map();
  lists.flat().forEach((t) => { if (t && t.name && !seen.has(t.name.toLowerCase())) seen.set(t.name.toLowerCase(), t); });
  return [...seen.values()];
}

/**
 * Column completions for an unqualified name: columns of the known tables the statement
 * references, or of every known table when it references no table at all. A reference to an
 * unknown table offers nothing rather than another table's columns.
 */
export function columnCandidates(statement, tables) {
  const refs = referencedTables(statement);
  const pool = refs.length ? tables.filter((t) => refs.includes(t.name.toLowerCase())) : tables;
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

/** Type family of a column type for connector options (datagen's type visitor, faker's checks). */
export function typeFamily(type) {
  const t = String(type || '').trim().toUpperCase();
  if (/^(ARRAY|MULTISET)\b|\b(ARRAY|MULTISET)$/.test(t)) return 'collection';
  if (/^MAP\b/.test(t)) return 'map';
  if (/^ROW\b/.test(t)) return 'row';
  if (/^(TINYINT|SMALLINT|INT|INTEGER|BIGINT|FLOAT|DOUBLE|REAL|DECIMAL|DEC|NUMERIC)\b/.test(t)) return 'numeric';
  if (/^INTERVAL\b/.test(t)) return 'interval';
  if (/^(VARCHAR|STRING|VARBINARY|BYTES)\b|^(CHAR|CHARACTER|BINARY)\s+VARYING\b/.test(t)) return 'varchar';
  if (/^(CHAR|CHARACTER|BINARY)\b/.test(t)) return 'char';
  if (/^TIMESTAMP(?:_LTZ)?\b/.test(t)) return 'timestamp';
  return 'other';
}

/** Field names of a ROW<a INT, b STRING> or ROW(a INT, b STRING) type, as typed so far. */
export function rowFields(type) {
  const masked = maskSql(type);
  const open = masked.search(/[<(]/);
  if (open === -1) return [];
  const close = masked[open] === '(' ? closingParen(masked, open) : masked.lastIndexOf('>');
  const end = close > open ? close : masked.length;
  return splitTopLevel(masked.slice(open + 1, end), type.slice(open + 1, end)).map((field) => {
    const name = field.masked.match(/^(`(?:[^`]|``)*`|[\w$]+)/);
    return name ? lastIdentifier(field.raw.slice(0, name[1].length)) : null;
  }).filter(Boolean);
}

/** The fields.<col>.* option keys a connector accepts for one column {name, type}. */
function columnOptions(connector, column) {
  const prefix = `fields.${column.name}.`;
  const family = typeFamily(column.type);
  if (connector === 'datagen') {
    const keys = family === 'map' ? DATAGEN_COLUMN_OPTIONS.collection
      : family === 'row' ? DATAGEN_COLUMN_OPTIONS.other
        : DATAGEN_COLUMN_OPTIONS[family];
    return keys.map((k) => prefix + k);
  }
  if (connector === 'faker') {
    // FlinkFakerTableSourceFactory: MAP takes key / value expressions, ROW one per field, and
    // length only for ARRAY, MULTISET and MAP.
    const expressions = family === 'map' ? ['key.expression', 'value.expression']
      : family === 'row' ? rowFields(column.type).map((f) => `${f}.expression`)
        : ['expression'];
    const length = family === 'collection' || family === 'map' ? ['length'] : [];
    return [...expressions, 'null-rate', ...length].map((k) => prefix + k);
  }
  return [];
}

/**
 * The value of the first `'connector' = '...'` pair between `from` and `to`, or null. Quotes
 * are paired in the masked text, so a pair inside a comment is not read.
 */
function connectorOf(masked, text, from, to) {
  const quotes = [];
  for (let i = masked.indexOf("'", from); i !== -1 && i < to; i = masked.indexOf("'", i + 1)) quotes.push(i);
  for (let k = 0; k + 3 < quotes.length; k += 2) {
    const [keyOpen, keyClose, valueOpen, valueClose] = quotes.slice(k, k + 4);
    if (!/^\s*=\s*$/.test(masked.slice(keyClose + 1, valueOpen))) continue;
    if (text.slice(keyOpen + 1, keyClose).toLowerCase() !== 'connector') continue;
    const value = text.slice(valueOpen + 1, valueClose);
    return /^[\w-]+$/.test(value) ? value.toLowerCase() : null;
  }
  return null;
}

/**
 * When `before` (the statement text up to the cursor) ends inside an open quote in a CREATE
 * TABLE ... WITH (...) clause, returns what that quote is: an option key, or the value of `key`.
 * {kind: 'key'|'value', key, typed, connector, columns: [{name, type}]} or null.
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
  // Connector options such as fields.<col>.kind apply to physical columns only.
  const columns = tables.length ? tables[tables.length - 1].columns.filter((c) => c.kind === 'physical')
    .map(({ name, type }) => ({ name, type })) : [];
  const connector = connectorOf(masked, before, open + 1, quote);
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
    return hasOwn(OPTION_VALUES, last) ? OPTION_VALUES[last] : [];
  }
  // Own properties only: a connector named constructor or __proto__ must not reach Object.prototype.
  const known = ctx.connector && hasOwn(CONNECTOR_OPTIONS, ctx.connector);
  const keys = ['connector', ...(known ? CONNECTOR_OPTIONS[ctx.connector] : [])];
  if (known) ctx.columns.forEach((c) => keys.push(...columnOptions(ctx.connector, c)));
  return keys;
}

/**
 * Lower-cased alias → table name map for `FROM t a`, `JOIN t AS a`, comma-separated FROM items
 * and backticked aliases such as FROM t AS `order`; each table also maps to itself.
 */
export function tableAliases(text) {
  const aliases = Object.create(null); // a table may be named __proto__
  statementRelations(text).forEach(({ table, alias }) => {
    aliases[table.toLowerCase()] = table;
    if (alias !== null) aliases[alias.toLowerCase()] = table;
  });
  return aliases;
}

/** True when `before` (statement text up to the cursor) ends right after FROM, JOIN, TABLE or INTO. */
export function expectsTableName(before) {
  return /\b(?:from|join|table|into)\s+[\w$]*$/i.test(maskSql(before));
}

/** True for a CREATE statement with no AS SELECT query, whose column list takes new names. */
export function isDdlWithoutQuery(statement) {
  const masked = maskSql(statement);
  return /^\s*create\b/i.test(masked) && !/\bas\s+select\b/i.test(masked);
}
