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
 * Per-column datagen options by type family: exactly the options each Flink 2.2.1 generator
 * declares (RandomGeneratorVisitor and DataGenVisitorBase visit methods), plus kind for every
 * column and start / end where SequenceGeneratorVisitor supports the type. Any other fields.*
 * key fails DataGenTableSourceFactory's unconsumed-option check.
 */
const DATAGEN_COLUMN_OPTIONS = {
  numeric: ['kind', 'min', 'max', 'start', 'end', 'null-rate'],
  interval: ['kind', 'min', 'max', 'null-rate'],
  varchar: ['kind', 'length', 'var-len', 'start', 'end', 'null-rate'],
  varbinary: ['kind', 'length', 'var-len', 'start', 'end'],
  char: ['kind', 'start', 'end', 'null-rate'],
  binary: ['kind', 'start', 'end'],
  timestamp: ['kind', 'max-past', 'null-rate'],
  datetime: ['kind'],
  collection: ['kind', 'length', 'null-rate'],
  other: ['kind', 'null-rate'],
};

// Flink SQL keywords: the reserved words from the Flink SQL reference plus the DDL, window,
// CEP and statement words the playground's examples use. lang-sql keeps its standard list
// private, so editor.js's dialect spells out its own from these, and quoteIdentifier uses them.
export const FLINK_KEYWORDS = `
a abs absolute action add after all allocate allow alter and any are array_agg as asc asensitive
assertion assignment asymmetric at atomic attributes authorization avg before begin begin_frame
begin_partition between both breadth by call called cascade cascaded case cast catalog catalogs
changelog_mode check classifier clear close coalesce collate collation collect column columns
comment commit compile condition connect constraint constraints constructor contains continue
corresponding count create cross cube cumulate current current_catalog current_database
current_row current_schema cursor cycle data database databases deallocate declare default
deferrable deferred define delete depth deref desc describe descriptor deterministic disconnect
distinct distribution do domain drop dynamic each else empty end end_frame end_partition enforced
equals escape estimated_cost every except exception exec execute exists explain extend external
fetch filter first following for foreign found frame_row free from full function functions
fusion generated get global go goto grant group grouping groups having hold hop identity if
ignore immediate import in including indicator initially inner inout input insert intersect
intersection into is isolation jar jars join json_execution_plan key language last lateral
leading leave left level like like_regex limit load local localtime localtimestamp locator loop
match match_number match_recognize matches measures member merge metadata method modifies module
modules names natural new next no none normalize not nth_value null nulls of offset old omit on
one only open option options or order ordinality out outer output over overlaps overwrite
overwriting pad parameter partial partition partitioned partitions past path pattern per percent
period permute plan_advice portion precedes preceding prepare preserve primary prior privileges
procedure procedures public qualify range read reads recursive ref references referencing
relative release remove rename repeat replace reset respect restrict result return returns
revoke right role rollback rollup routine row rows running savepoint schema scope scroll search
section seek select sensitive session set sets show similar skip some space specific
specifictype sql sqlexception sqlstate sqlwarning start state statement static submultiset
subset succeeds symmetric system system_time system_user table tables tablesample temporary
then timezone_hour timezone_minute to top trailing transaction translation treat trigger
truncate tumble uescape under undo union unique unknown unload unnest until update upsert usage
use user using value values versioning view views virtual watermark watermarks when whenever
where while window with within without work write
`.trim().split(/\s+/).join(' ');

export const FLINK_TYPES = [
  'char', 'varchar', 'string', 'boolean', 'binary', 'varbinary', 'bytes', 'decimal', 'dec',
  'numeric', 'tinyint', 'smallint', 'int', 'integer', 'bigint', 'float', 'double', 'precision',
  'date', 'time', 'timestamp', 'timestamp_ltz', 'zone', 'local', 'interval', 'array', 'multiset',
  'map', 'raw', 'variant', 'year', 'month', 'day', 'hour', 'minute', 'second', 'real', 'character',
  'varying', 'without', 'with',
].join(' ');

// Words an inserted identifier must not collide with: the keywords and type names above, plus
// reserved aggregate and function names. Quoting a word that is not reserved is still valid SQL.
const RESERVED_WORDS = new Set([...FLINK_KEYWORDS.split(' '), ...FLINK_TYPES.split(' '),
  'min', 'max', 'sum', 'upper', 'lower', 'floor', 'ceil', 'ceiling', 'power', 'mod', 'rank', 'lag', 'lead']);

/** `name` as SQL text: backticked (with `` for `) unless it is a plain, non-reserved identifier. */
export function quoteIdentifier(name) {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !RESERVED_WORDS.has(name.toLowerCase())) return name;
  return '`' + name.replace(/`/g, '``') + '`';
}

/** Values worth offering for a few options, by the last segment of the option key. */
const OPTION_VALUES = { 'kind': ['random', 'sequence'], 'standard-error': ['true', 'false'], 'var-len': ['true', 'false'] };

// Object.hasOwn needs Safari 15.4; the bundle targets Safari 15.
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const NOT_COLUMNS = /^(watermark|primary|constraint|period|like|unique|foreign|check|index)$/i;

/**
 * Rewrites `text` token by token: each comment becomes comment(commentText), each quoted string
 * or name becomes quoted(quote, contents, closed), and everything else is copied.
 */
function rewriteSql(text, comment, quoted) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '-' && next === '-') {
      const end = text.indexOf('\n', i);
      const stop = end === -1 ? text.length : end;
      out += comment(text.slice(i, stop));
      i = stop;
    } else if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      out += comment(text.slice(i, stop));
      i = stop;
    } else if (c === "'" || c === '`' || c === '"') {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === c && text[j + 1] === c) { j += 2; continue; } // '' and `` escapes
        if (text[j] === c) break;
        j++;
      }
      out += quoted(c, text.slice(i + 1, j), j < text.length);
      i = Math.min(j + 1, text.length);
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const blank = (s) => s.replace(/[^\n]/g, ' ');

/** Blanks comments and string contents with spaces, keeping offsets and the quotes themselves. */
export function maskSql(text) {
  return rewriteSql(text, blank, (quote, contents, closed) => quote + blank(contents) + (closed ? quote : ''));
}

/** `text` with each comment replaced by `replacement`; strings and quoted names stay as they are. */
export function stripComments(text, replacement = '') {
  return rewriteSql(text, () => replacement, (quote, contents, closed) => quote + contents + (closed ? quote : ''));
}

/** Unquotes a possibly qualified identifier (`cat`.`db`.`t` → t), ignoring comments in it. */
function lastIdentifier(raw) {
  const parts = stripComments(raw, ' ').match(/`(?:[^`]|``)*`|[^.\s]+/g) || [];
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

/** Offset of the innermost parenthesis still open at offset `i` (masked text), or -1. */
function enclosingParen(masked, i) {
  let depth = 0;
  for (let k = i - 1; k >= 0; k--) {
    if (masked[k] === ')') depth++;
    else if (masked[k] === '(') {
      if (depth === 0) return k;
      depth--;
    }
  }
  return -1;
}

const COLUMN_MODIFIER = /\s+(?:not\s+null|null|metadata|primary|comment)\b/iy;

/**
 * Length of the type at the start of `rest` (masked column definition after the name): it ends
 * at the first column modifier outside parentheses and angle brackets, so the NOT NULL of a
 * nested field (ROW<a INT NOT NULL, b INT>) stays part of the type.
 */
function typeLength(rest) {
  let depth = 0;
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i];
    if (c === '(' || c === '<') depth++;
    else if ((c === ')' || c === '>') && depth > 0) depth--;
    else if (depth === 0 && matchAt(COLUMN_MODIFIER, rest, i)) return i;
  }
  return rest.length;
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
      const typeEnd = typeLength(rest);
      // Comments are found by the scanner, so a -- inside a backticked field name is kept.
      const type = computed ? 'computed' : stripComments(def.raw.slice(restStart, restStart + typeEnd)).trim();
      const kind = computed ? 'computed' : /\bmetadata\b/i.test(rest.slice(typeEnd)) ? 'metadata' : 'physical';
      return { name: lastIdentifier(rawName), type, kind };
    }).filter(Boolean);
    if (name) tables.push({ name, columns });
  }
  return tables;
}

const NAME = /(?:`(?:[^`]|``)*`|[\w$]+)(?:\s*\.\s*(?:`(?:[^`]|``)*`|[\w$]+))*/y;
const WORD = /`(?:[^`]|``)*`|[\w$]+/y;
const NOT_TABLES = /^(select|table|lateral|unnest|tumble|hop|cumulate|session)$/i;
const NOT_ALIASES = /^(on|using|where|join|inner|left|right|full|cross|outer|natural|lateral|group|order|limit|offset|fetch|qualify|having|window|union|except|intersect|for|match_recognize|tablesample|as|table)$/i;

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

// FROM inside these calls belongs to the call: EXTRACT(HOUR FROM ts), TRIM(BOTH ' ' FROM s).
const FROM_TAKING_CALL = /\b(?:extract|trim|substring|overlay)\s*$/i;

/**
 * True when the FROM at offset `i` (masked text) is part of an expression, not a FROM clause:
 * inside EXTRACT / TRIM / SUBSTRING / OVERLAY (...), or in IS [NOT] DISTINCT FROM.
 */
function isExpressionFrom(masked, i) {
  if (/\bis\s+(?:not\s+)?distinct\s+$/i.test(masked.slice(Math.max(0, i - 40), i))) return true;
  const open = enclosingParen(masked, i);
  return open !== -1 && FROM_TAKING_CALL.test(masked.slice(Math.max(0, open - 40), open));
}

const WINDOW_CALL = /\(\s*(?:tumble|hop|cumulate|session)\s*\(/iy;

/**
 * The table a window TVF reads, for TABLE(TUMBLE(TABLE t, ...)) or the named-argument form
 * TABLE(TUMBLE(DATA => TABLE t, ...)) with `open` at the first (; else null.
 */
function windowSource(masked, text, open) {
  const head = matchAt(WINDOW_CALL, masked, open);
  if (!head) return null;
  const inner = open + head.length - 1;
  const close = closingParen(masked, inner);
  const source = /\btable\s+/i.exec(masked.slice(inner + 1, close === -1 ? masked.length : close));
  if (!source) return null;
  const at = inner + 1 + source.index + source[0].length;
  const name = matchAt(NAME, masked, at);
  return name ? lastIdentifier(text.slice(at, at + name.length)) : null;
}

// Words that join two operands, after which the expression goes on.
const OPERATOR_WORDS = /^(and|or|not|is|between|like|similar|in|escape|interval|to|collate|distinct|from)$/i;
// Words that can end an operand: interval units and literals.
const OPERAND_END_WORDS = /^(year|month|day|hour|minute|second|null|true|false|unknown)$/i;

/**
 * Where the expression of `FOR SYSTEM_TIME AS OF <expr>` that starts at `i` stops, read at
 * parenthesis depth 0: at its AS, at a clause keyword, at a word right after a complete operand
 * (an alias without AS: `AS OF o.ts r`), or at a comma, a closing parenthesis or the end.
 */
function afterTimeTravel(masked, i) {
  let operand = false; // whether the tokens so far end with a complete operand
  for (;;) {
    i = skipSpace(masked, i);
    if (i >= masked.length || masked[i] === ',' || masked[i] === ')') return i;
    if (masked[i] === '(' || masked[i] === "'") {
      const close = masked[i] === '(' ? closingParen(masked, i) : masked.indexOf("'", i + 1);
      if (close === -1) return masked.length;
      i = close + 1;
      operand = true;
      continue;
    }
    const word = matchAt(WORD, masked, i);
    if (!word) { i++; operand = false; continue; } // an operator, or the . of a qualified name
    if (NOT_ALIASES.test(word)) return i;
    const joins = OPERATOR_WORDS.test(word);
    if (operand && !joins && !OPERAND_END_WORDS.test(word)) return i;
    i += word.length;
    operand = !joins;
  }
}

/**
 * Relations a statement reads or writes in keyword order, with what completion needs to scope
 * them: [{table, alias, write, open, close, list}]. `write` marks INTO and CREATE TABLE targets;
 * [open, close] is the parenthesised query block the relation belongs to (-1 and the text length
 * at the top level); `list` is the {open, close} of an INTO target's column list, or null.
 */
function readRelations(text) {
  const masked = maskSql(text);
  const relations = [];
  const keyword = /\b(from|join|table|into)\b/gi;
  let m;
  while ((m = keyword.exec(masked)) !== null) {
    const kind = m[1].toLowerCase();
    if (kind === 'from' && isExpressionFrom(masked, m.index)) continue;
    const open = enclosingParen(masked, m.index);
    const closing = open === -1 ? -1 : closingParen(masked, open);
    const scope = { open, close: closing === -1 ? masked.length : closing };
    let i = m.index + m[0].length;
    for (;;) {
      i = skipSpace(masked, i);
      if (matchAt(/lateral\b/iy, masked, i)) i = skipSpace(masked, i + 7); // LATERAL TABLE(...)
      let table = null;
      const name = masked[i] === '(' ? null : matchAt(NAME, masked, i);
      if (name) {
        const start = i;
        i += name.length;
        // After INTO a ( opens the target's column list; elsewhere it calls a table function.
        if (kind === 'into' || masked[skipSpace(masked, i)] !== '(') {
          const t = lastIdentifier(text.slice(start, i));
          // A backticked name may be any word: FROM `table` t.
          if (name.endsWith('`') || !NOT_TABLES.test(t)) table = t;
        } else {
          i = skipSpace(masked, i); // a table function: TABLE(...), UNNEST(...)
          if (/^table$/i.test(name)) table = windowSource(masked, text, i);
        }
      }
      if (kind === 'table' || kind === 'into') {
        // Recorded before any parenthesis is read, so INSERT INTO t(a, with no ) yet has its target.
        if (table) {
          const write = kind === 'into'
            || /\bcreate\s+(?:temporary\s+)?$/i.test(masked.slice(Math.max(0, m.index - 30), m.index));
          const paren = skipSpace(masked, i);
          let list = null;
          if (kind === 'into' && masked[paren] === '(') {
            const close = closingParen(masked, paren);
            list = { open: paren, close: close === -1 ? masked.length : close };
          }
          relations.push({ table, alias: null, write, ...scope, list });
        }
        break;
      }
      if (masked[i] === '(') {
        const close = closingParen(masked, i);
        if (close === -1) break;
        i = close + 1;
      } else if (!name) break;
      let alias = null;
      let j = skipSpace(masked, i);
      const temporal = matchAt(/for\s+system_time\s+as\s+of\b/iy, masked, j);
      // The item ends with its time expression, so a comma after it continues the FROM list.
      if (temporal) i = j = afterTimeTravel(masked, j + temporal.length);
      if (matchAt(/as\b/iy, masked, j)) j = skipSpace(masked, j + 2);
      const word = matchAt(WORD, masked, j);
      if (word) {
        const raw = text.slice(j, j + word.length);
        // A backticked alias may be any word, a reserved one included.
        if (raw.startsWith('`')) alias = lastIdentifier(raw);
        else if (!NOT_ALIASES.test(raw)) alias = raw;
        if (alias !== null) i = j + word.length;
      }
      if (table) relations.push({ table, alias, write: false, ...scope, list: null });
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

/**
 * Relations a statement reads or writes, [{table, alias}] in keyword order: every item of a
 * comma-separated FROM list, each JOIN target, and TABLE / INTO targets. An alias is recorded
 * for FROM and JOIN items (null when absent), including after FOR SYSTEM_TIME AS OF <expr>; a
 * clause keyword is never taken as one. A window TVF item, TABLE(TUMBLE(TABLE t, ...)) w, reads
 * t under alias w; other subqueries and table functions are skipped as items. The FROM of
 * EXTRACT(... FROM ...) or IS DISTINCT FROM starts no relation.
 */
export function statementRelations(text) {
  return readRelations(text).map(({ table, alias }) => ({ table, alias }));
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
 * Column completions for an unqualified name at offset `pos` of `statement` (default: its end).
 * Inside the column list of INSERT INTO t (...), the columns of t; elsewhere the columns of the
 * known tables the statement reads, or of every known table when it reads none. A write target
 * (INSERT INTO, CREATE TABLE ... AS) is not read, and a reference to an unknown table offers
 * nothing rather than another table's columns.
 */
export function columnCandidates(statement, tables, pos = statement.length) {
  const relations = readRelations(statement);
  const target = relations.find((r) => r.list && r.list.open < pos && pos <= r.list.close);
  const refs = (target ? [target] : relations.filter((r) => !r.write)).map((r) => r.table.toLowerCase());
  const pool = refs.length ? tables.filter((t) => refs.includes(t.name.toLowerCase())) : tables;
  const out = [];
  const seen = new Set();
  pool.forEach((t) => (t.columns || []).forEach((c) => {
    const key = c.name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label: c.name, apply: quoteIdentifier(c.name), detail: c.type ? `${c.type} · ${t.name}` : t.name });
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
  if (/^(VARCHAR|STRING)\b|^(CHAR|CHARACTER)\s+VARYING\b/.test(t)) return 'varchar';
  if (/^(VARBINARY|BYTES)\b|^BINARY\s+VARYING\b/.test(t)) return 'varbinary';
  if (/^(CHAR|CHARACTER)\b/.test(t)) return 'char';
  if (/^BINARY\b/.test(t)) return 'binary';
  if (/^TIMESTAMP(?:_LTZ)?\b/.test(t)) return 'timestamp';
  if (/^(DATE|TIME)\b/.test(t)) return 'datetime';
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
 * The quoted strings between `from` and `to` that are followed by `=`, that is the option keys
 * written so far, with '' read as '. Quotes are paired in the masked text.
 */
function writtenKeys(masked, text, from, to) {
  const quotes = [];
  for (let i = masked.indexOf("'", from); i !== -1 && i < to; i = masked.indexOf("'", i + 1)) quotes.push(i);
  const keys = [];
  for (let k = 0; k + 1 < quotes.length; k += 2) {
    const after = masked.slice(quotes[k + 1] + 1, k + 2 < quotes.length ? quotes[k + 2] : to);
    if (/^\s*=/.test(after)) keys.push(text.slice(quotes[k] + 1, quotes[k + 1]).replace(/''/g, "'"));
  }
  return keys;
}

/**
 * When `before` (the statement text up to the cursor) ends inside an open quote in a CREATE
 * TABLE ... WITH (...) clause, returns what that quote is: an option key, or the value of `key`.
 * {kind: 'key'|'value', key, typed, connector, columns: [{name, type}], used} or null, `used`
 * being the option keys the clause already sets.
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
  const used = writtenKeys(masked, before, open + 1, quote);
  const typed = before.slice(quote + 1);
  const valueOf = masked.slice(open + 1, quote).match(/'\s*=\s*$/);
  if (valueOf) {
    const keyEnd = open + 1 + valueOf.index;
    const keyStart = masked.lastIndexOf("'", keyEnd - 1);
    const key = before.slice(keyStart + 1, keyEnd).replace(/''/g, "'");
    return { kind: 'value', key, typed, connector, columns, used };
  }
  return { kind: 'key', key: null, typed, connector, columns, used };
}

/**
 * Option keys (or values) to offer for an optionContext() result. Keys the clause already sets
 * are left out, and values are offered only for a key the declared connector accepts.
 */
export function optionCandidates(ctx) {
  if (!ctx) return [];
  if (ctx.kind === 'value') {
    if (ctx.key === 'connector') return Object.keys(CONNECTOR_OPTIONS);
    if (!optionCandidates({ ...ctx, kind: 'key', used: [] }).includes(ctx.key)) return [];
    const last = ctx.key.split('.').pop();
    return hasOwn(OPTION_VALUES, last) ? OPTION_VALUES[last] : [];
  }
  // Own properties only: a connector named constructor or __proto__ must not reach Object.prototype.
  const known = ctx.connector && hasOwn(CONNECTOR_OPTIONS, ctx.connector);
  const keys = ['connector', ...(known ? CONNECTOR_OPTIONS[ctx.connector] : [])];
  if (known) (ctx.columns || []).forEach((c) => keys.push(...columnOptions(ctx.connector, c)));
  const used = new Set(ctx.used || []);
  return keys.filter((k) => !used.has(k));
}

/** `value` as the inside of a SQL string literal: each ' doubled. */
export function sqlStringText(value) {
  return value.replace(/'/g, "''");
}

/**
 * The table qualifier `before` (text up to the cursor) ends with, as in `o.na` or
 * `` `my.tbl`.na ``: {qualifier, typed} with the qualifier unquoted, or null. Backticks are
 * paired in the masked text, so a dot or a doubled backtick inside one stays in the name.
 */
export function qualifierBefore(before) {
  const m = /(`[^`]*`|[\w$]+)\.([\w$]*)$/.exec(maskSql(before));
  if (!m) return null;
  return { qualifier: lastIdentifier(before.slice(m.index, m.index + m[1].length)), typed: m[2] };
}

/**
 * Lower-cased alias → table name map for `FROM t a`, `JOIN t AS a`, comma-separated FROM items
 * and backticked aliases such as FROM t AS `order`; each table also maps to itself. With `pos`
 * (an offset in `text`), only the query blocks around it count and an inner block's names shadow
 * an outer one's. In each block an explicit alias wins over a table of the same name.
 */
export function tableAliases(text, pos) {
  const entries = [];
  readRelations(text).forEach(({ table, alias, open, close }) => {
    if (pos !== undefined && !(open < pos && pos <= close)) return;
    entries.push({ open, rank: 0, key: table.toLowerCase(), table });
    if (alias !== null) entries.push({ open, rank: 1, key: alias.toLowerCase(), table });
  });
  const aliases = Object.create(null); // a table may be named __proto__
  // Outer blocks first, and table names before aliases, so later assignments win.
  entries.sort((a, b) => a.open - b.open || a.rank - b.rank).forEach(({ key, table }) => { aliases[key] = table; });
  return aliases;
}

/** True when `before` (statement text up to the cursor) ends right after FROM, JOIN, TABLE or INTO. */
export function expectsTableName(before) {
  const masked = maskSql(before);
  const m = /\b(from|join|table|into)\s+[\w$]*$/i.exec(masked);
  return Boolean(m) && !(m[1].toLowerCase() === 'from' && isExpressionFrom(masked, m.index));
}

/**
 * True for a CREATE statement with no query, whose column list takes new names. AS followed by
 * SELECT, WITH, VALUES or ( outside any parenthesis starts the query of a view or CTAS; inside
 * the column list it defines a computed column.
 */
export function isDdlWithoutQuery(statement) {
  const masked = maskSql(statement);
  if (!/^\s*create\b/i.test(masked)) return false;
  const query = /\bas\s+(?:select|with|values|\()/gi;
  let m;
  while ((m = query.exec(masked)) !== null) if (enclosingParen(masked, m.index) === -1) return false;
  return true;
}
