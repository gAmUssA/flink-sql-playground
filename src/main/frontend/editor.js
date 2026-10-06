// editor.js — the SQL editor (CodeMirror 6), bundled by scripts/build-editor.js into
// js/editor.bundle.js and exposed as window.FlinkEditor.
//
// Colours come from the theme's --tk-* and --editor-bg CSS variables, so switching the
// page theme restyles the editor with no editor call.

import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor } from '@codemirror/view';
import { EditorState, Compartment, Prec } from '@codemirror/state';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching } from '@codemirror/language';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { sql, SQLDialect } from '@codemirror/lang-sql';
import { tags as t } from '@lezer/highlight';

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
  '.cm-scroller': { fontFamily: 'var(--editor-font)', lineHeight: 'var(--editor-line-height, 22px)' },
  '.cm-content': { padding: '12px 0', caretColor: '#3b82f6' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: '#3b82f6', borderLeftWidth: '2px' },
  '.cm-gutters': { backgroundColor: 'var(--editor-bg)', color: 'var(--tk-com)', border: 'none' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--tk-id)' },
  '.cm-activeLine': { backgroundColor: 'var(--editor-line-highlight)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection':
    { backgroundColor: '#3b82f640' },
  '.cm-matchingBracket': { backgroundColor: '#3b82f633', outline: '1px solid #3b82f666' },
  '.cm-tooltip': { backgroundColor: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border-2)' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--accent)', color: '#fff' },
  '.cm-completionDetail': { color: 'var(--text-3)' },
});

/** Converts the Tables list ([{name, columns:[{name}]}]) into lang-sql's schema shape. */
export function toCompletionSchema(tables) {
  const schema = {};
  (tables || []).forEach((table) => {
    if (table && table.name) schema[table.name] = (table.columns || []).map((c) => c.name).filter(Boolean);
  });
  return schema;
}

function sqlLanguage(tables) {
  return sql({ dialect: FlinkSQL, schema: toCompletionSchema(tables), upperCaseKeywords: true });
}

/**
 * Creates an editor in `parent`. Options: value (initial text), onRun (called on Mod-Enter),
 * label (accessible name). Returns {getValue, setValue, setTables, layout, focus, view}.
 */
export function create(parent, { value = '', onRun = null, label = 'SQL editor' } = {}) {
  const language = new Compartment();
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
        language.of(sqlLanguage([])),
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
    setTables: (tables) => view.dispatch({ effects: language.reconfigure(sqlLanguage(tables)) }),
    layout: () => view.requestMeasure(),
    focus: () => view.focus(),
  };
}

window.FlinkEditor = { create, toCompletionSchema, FlinkSQL };
