// editor.js — the SQL editor (CodeMirror 6), bundled by scripts/build-editor.js into
// js/editor.bundle.js and exposed as window.FlinkEditor.
//
// Colours come from the theme's --tk-* and --editor-bg CSS variables, so switching the
// page theme restyles the editor with no editor call.

import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor } from '@codemirror/view';
import { EditorState, Prec } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, syntaxTree, HighlightStyle, indentOnInput, bracketMatching } from '@codemirror/language';
import { autocompletion, completionKeymap, completionStatus, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { sql, SQLDialect } from '@codemirror/lang-sql';
import { tags as t } from '@lezer/highlight';
import { parseCreateTables, mergeTables, columnCandidates, statementAt, optionContext, optionCandidates,
  tableAliases, expectsTableName, isDdlWithoutQuery } from './sql-schema.mjs';

// Flink SQL keywords: the reserved words from the Flink SQL reference plus the DDL, window,
// CEP and statement words the playground's examples use. lang-sql keeps its standard list
// private, so the dialect spells out its own.
const FLINK_KEYWORDS = `
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

const FLINK_TYPES = [
  'char', 'varchar', 'string', 'boolean', 'binary', 'varbinary', 'bytes', 'decimal', 'dec',
  'numeric', 'tinyint', 'smallint', 'int', 'integer', 'bigint', 'float', 'double', 'precision',
  'date', 'time', 'timestamp', 'timestamp_ltz', 'zone', 'local', 'interval', 'array', 'multiset',
  'map', 'raw', 'variant', 'year', 'month', 'day', 'hour', 'minute', 'second', 'real', 'character',
  'varying', 'without', 'with',
].join(' ');

const FLINK_BUILTINS = [
  'proctime', 'current_watermark', 'source_watermark', 'to_timestamp', 'to_timestamp_ltz',
  'to_date', 'date_format', 'unix_timestamp', 'from_unixtime', 'current_timestamp', 'localtimestamp',
  'now', 'window_start', 'window_end', 'window_time', 'tumble_start', 'tumble_end', 'tumble_rowtime',
  'hop_start', 'hop_end', 'session_start', 'session_end', 'count', 'sum', 'avg', 'min', 'max',
  'first_value', 'last_value', 'listagg', 'collect', 'row_number', 'rank', 'dense_rank', 'lag',
  'lead', 'coalesce', 'if', 'case', 'cast', 'try_cast', 'json_value', 'json_query', 'json_object',
  'json_array', 'regexp_extract', 'regexp_replace', 'split_index', 'concat', 'concat_ws', 'substr',
  'substring', 'upper', 'lower', 'trim', 'char_length', 'abs', 'round', 'floor', 'ceil', 'rand',
  'rand_integer', 'uuid', 'hash_code', 'md5', 'sha256', 'extract', 'timestampadd', 'timestampdiff',
].join(' ');

export const FlinkSQL = SQLDialect.define({
  keywords: FLINK_KEYWORDS,
  types: FLINK_TYPES,
  builtin: FLINK_BUILTINS,
  identifierQuotes: '`',
  caseInsensitiveIdentifiers: true,
});

const highlight = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--tk-kw)', fontWeight: '700' },
  { tag: [t.typeName, t.standard(t.name)], color: 'var(--tk-ty)' },
  { tag: [t.function(t.variableName), t.standard(t.variableName)], color: 'var(--tk-fn)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--tk-str)' },
  { tag: [t.number, t.bool, t.null], color: 'var(--tk-num)' },
  { tag: [t.name, t.variableName, t.propertyName, t.special(t.name)], color: 'var(--tk-id)' },
  { tag: [t.punctuation, t.paren, t.brace, t.squareBracket, t.separator], color: 'var(--tk-pun)' },
  { tag: [t.operator, t.compareOperator, t.arithmeticOperator, t.logicOperator], color: 'var(--tk-op)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--tk-com)', fontStyle: 'italic' },
]);

const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--editor-bg)', color: 'var(--tk-id)',
    fontSize: 'var(--editor-font-size, 13.5px)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: 'var(--editor-line-height, 22px)' },
  '.cm-content': { padding: '12px 0', caretColor: '#3b82f6' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#3b82f6', borderLeftWidth: '2px' },
  '.cm-gutters': { backgroundColor: 'var(--editor-bg)', color: 'var(--tk-com)', border: 'none' },
  // Monaco's spacing: numbers right-aligned in a 41px column, 26px before the code.
  '.cm-lineNumbers .cm-gutterElement': { minWidth: '41px', padding: '0 26px 0 0', textAlign: 'right', boxSizing: 'content-box' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--tk-id)' },
  '.cm-activeLine': { backgroundColor: 'var(--editor-line-highlight)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection':
    { backgroundColor: '#3b82f640' },
  '.cm-matchingBracket': { backgroundColor: '#3b82f633', outline: '1px solid #3b82f666' },
  '.cm-tooltip': { backgroundColor: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border-2)' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--accent)', color: '#fff' },
  '.cm-completionDetail': { color: 'var(--text-3)' },
  // Finger-sized rows on touch screens (style.css sets the variable, and centres the row, under pointer: coarse).
  '.cm-tooltip-autocomplete > ul > li': { minHeight: 'var(--editor-completion-row, auto)' },
});

// Syntax nodes the table / column source stays out of.
const NO_IDENTIFIER_NODES = new Set(['String', 'LineComment', 'BlockComment', 'QuotedIdentifier', 'Number']);

/**
 * Completion for table and column names, read from `tables()` on every request so new
 * tables need no editor reconfiguration. After `t.` or `alias.` it offers that table's
 * columns; after FROM / JOIN / TABLE / INTO, table names; elsewhere, the columns of the
 * tables the statement reads (all known columns when it reads none), then table names.
 */
function tableColumnSource(tables) {
  return (ctx) => {
    const node = syntaxTree(ctx.state).resolveInner(ctx.pos, -1);
    if (NO_IDENTIFIER_NODES.has(node.name)) return null;
    const doc = ctx.state.doc.toString();
    const stmt = statementAt(doc, ctx.pos);
    const before = doc.slice(stmt.offset, ctx.pos);
    if (isDdlWithoutQuery(stmt.text)) return null;
    const known = tables();

    const qualified = ctx.matchBefore(/(?:`[^`]+`|[\w$]+)\.[\w$]*$/);
    if (qualified) {
      const [qualifier] = qualified.text.split('.');
      const alias = qualifier.replace(/`/g, '').toLowerCase();
      const name = (tableAliases(stmt.text)[alias] || alias).toLowerCase();
      const table = known.find((tb) => tb.name.toLowerCase() === name);
      if (!table) return null;
      return {
        from: qualified.from + qualifier.length + 1,
        options: (table.columns || []).map((c) => ({ label: c.name, detail: c.type, type: 'property', boost: 2 })),
        validFor: /^[\w$]*$/,
      };
    }

    const word = ctx.matchBefore(/[\w$]+$/);
    if (!word && !ctx.explicit) return null;
    const from = word ? word.from : ctx.pos;
    const tableOptions = known.map((tb) => ({
      label: tb.name, detail: `table · ${(tb.columns || []).length} columns`, type: 'class',
    }));
    if (expectsTableName(before)) {
      return { from, options: tableOptions.map((o) => ({ ...o, boost: 2 })), validFor: /^[\w$]*$/ };
    }
    const columns = columnCandidates(stmt.text, known).map((c) => ({ ...c, type: 'property', boost: 1 }));
    return { from, options: [...columns, ...tableOptions], validFor: /^[\w$]*$/ };
  };
}

/** Connector option keys and values inside CREATE TABLE ... WITH ('...'). */
function connectorOptionSource(ctx) {
  const doc = ctx.state.doc.toString();
  const stmt = statementAt(doc, ctx.pos);
  const option = optionContext(doc.slice(stmt.offset, ctx.pos));
  if (!option) return null;
  const labels = optionCandidates(option);
  if (!labels.length) return null;
  return {
    from: ctx.pos - option.typed.length,
    options: labels.map((label) => ({ label, type: option.kind === 'key' ? 'property' : 'enum' })),
    validFor: /^[\w.-]*$/,
  };
}

/** The Flink dialect with keyword completion, plus the table / column and connector sources. */
function sqlSupport(tables) {
  return [
    sql({ dialect: FlinkSQL, upperCaseKeywords: true }),
    FlinkSQL.language.data.of({ autocomplete: tableColumnSource(tables) }),
    FlinkSQL.language.data.of({ autocomplete: connectorOptionSource }),
  ];
}

/**
 * Creates an editor in `parent`. Options: value (initial text), onRun (called on Mod-Enter),
 * onChange (called with the text after each edit), label (accessible name).
 * Returns {getValue, setValue, setTables, layout, focus, view}; setTables takes the
 * [{name, columns: [{name, type}]}] list that autocomplete offers.
 */
export function create(parent, { value = '', onRun = null, onChange = null, label = 'SQL editor' } = {}) {
  let tables = [];
  const runKeymap = Prec.highest(keymap.of([{
    key: 'Mod-Enter', preventDefault: true,
    run: () => { if (onRun) onRun(); return true; },
  }]));
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: value,
      extensions: [
        runKeymap,
        lineNumbers(), highlightActiveLineGutter(), highlightSpecialChars(), history(), drawSelection(),
        dropCursor(), EditorState.allowMultipleSelections.of(true), indentOnInput(), bracketMatching(),
        closeBrackets(), autocompletion(), rectangularSelection(), crosshairCursor(), highlightActiveLine(),
        highlightSelectionMatches(),
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap,
          ...completionKeymap, indentWithTab]),
        sqlSupport(() => tables),
        EditorView.updateListener.of((update) => { if (onChange && update.docChanged) onChange(update.state.doc.toString()); }),
        syntaxHighlighting(highlight),
        theme,
        EditorView.contentAttributes.of({ 'aria-label': label, autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' }),
      ],
    }),
  });
  return {
    view,
    getValue: () => view.state.doc.toString(),
    setValue: (text) => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }),
    setTables: (next) => { tables = Array.isArray(next) ? next : []; },
    layout: () => view.requestMeasure(),
    focus: () => view.focus(),
  };
}

// completionStatus lets browser tests read suggestions only once completion has settled.
window.FlinkEditor = { create, parseCreateTables, mergeTables, completionStatus, FlinkSQL };
