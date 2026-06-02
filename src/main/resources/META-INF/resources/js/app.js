// app.js — Flink SQL Playground (Nebula data-infra UI, wired to the real backend)

/* ============================== Icons ============================== */
const ICONS = {
  layers: '<path d="M12 2l9 5-9 5-9-5 9-5z"/><path d="M3 12l9 5 9-5M3 17l9 5 9-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
  sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/>',
  db: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  chevL: '<path d="M15 18l-6-6 6-6"/>',
  chevD: '<path d="M6 9l6 6 6-6"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  play: '<path d="M6 4l14 8-14 8V4z" fill="currentColor" stroke="none"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  table: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  pulse: '<path d="M2 12h4l3 8 4-16 3 8h6"/>',
  flow: '<rect x="2" y="9" width="6" height="6" rx="1"/><rect x="16" y="9" width="6" height="6" rx="1"/><rect x="9" y="3" width="6" height="6" rx="1"/><rect x="9" y="15" width="6" height="6" rx="1"/><path d="M8 12h1M15 12h1"/>',
  bolt: '<path d="M13 2L4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z" fill="currentColor" stroke="none"/>',
  expand: '<path d="M9 21H5a2 2 0 0 1-2-2v-4"/><path d="M15 3h4a2 2 0 0 1 2 2v4"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>',
  minimize: '<path d="M9 3v4a2 2 0 0 1-2 2H3"/><path d="M21 9h-4a2 2 0 0 1-2-2V3"/><path d="M3 15h4a2 2 0 0 1 2 2v4"/><path d="M15 21v-4a2 2 0 0 1 2-2h4"/>',
  dot: '<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  filter: '<path d="M3 5h18l-7 8v5l-4 2v-7L3 5z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/>'
};

function iconSvg(name, size = 16) {
  const fill = (ICONS[name] || '').includes('fill="currentColor"') ? '' : ' fill="none"';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24"${fill} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}

function renderIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    const name = el.getAttribute('data-icon');
    const size = parseInt(el.getAttribute('data-size') || '16', 10);
    el.innerHTML = iconSvg(name, size);
  });
}

/* ============================== Monaco themes ============================== */
const MONACO_THEMES = {
  nebula: { base: 'vs-dark', bg: '0c0c16', fg: 'dcdbf0', kw: 'b79bff', ty: '58d6c4', fn: 'f57bb8', str: '8ee98a', num: 'ffc25c', id: 'dcdbf0', pun: '8786a8', op: 'ff9d7a', com: '6a6a8a' },
  carbon: { base: 'vs-dark', bg: '0a0b0c', fg: 'e3e4e6', kw: 'c0a6ff', ty: '4fd6c2', fn: 'ff7bb0', str: '9be88f', num: 'ffc15c', id: 'e3e4e6', pun: '7d8186', op: 'ffa07a', com: '5c6065' },
  cobalt: { base: 'vs', bg: 'ffffff', fg: '1f2233', kw: '7c3aed', ty: '0d9488', fn: 'db2777', str: '15803d', num: 'b45309', id: '1f2233', pun: '8b8da6', op: 'c2410c', com: '9698ad' }
};

function defineMonacoThemes() {
  Object.entries(MONACO_THEMES).forEach(([name, t]) => {
    monaco.editor.defineTheme('fsf-' + name, {
      base: t.base,
      inherit: true,
      rules: [
        { token: 'keyword', foreground: t.kw, fontStyle: 'bold' },
        { token: 'keyword.sql', foreground: t.kw, fontStyle: 'bold' },
        { token: 'operator', foreground: t.op },
        { token: 'operator.sql', foreground: t.op },
        { token: 'string', foreground: t.str },
        { token: 'string.sql', foreground: t.str },
        { token: 'number', foreground: t.num },
        { token: 'number.sql', foreground: t.num },
        { token: 'comment', foreground: t.com, fontStyle: 'italic' },
        { token: 'comment.sql', foreground: t.com, fontStyle: 'italic' },
        { token: 'predefined', foreground: t.fn },
        { token: 'predefined.sql', foreground: t.fn },
        { token: 'identifier', foreground: t.id },
        { token: 'identifier.sql', foreground: t.id },
        { token: 'delimiter', foreground: t.pun },
        { token: 'delimiter.sql', foreground: t.pun }
      ],
      colors: {
        'editor.background': '#' + t.bg,
        'editor.foreground': '#' + t.fg,
        'editorLineNumber.foreground': '#' + t.com,
        'editorLineNumber.activeForeground': '#' + t.fg,
        'editor.lineHighlightBackground': t.base === 'vs' ? '#00000008' : '#ffffff0a',
        'editorCursor.foreground': '#3b82f6',
        'editor.selectionBackground': '#3b82f640',
        'editorGutter.background': '#' + t.bg
      }
    });
  });
}

/* ============================== Tweaks / theme state ============================== */
const TWEAKS_KEY = 'fsf-tweaks-v2';
const ACCENTS = ['#8b5cf6', '#a78bfa', '#3b82f6', '#22d3ee', '#10b981', '#ec4899'];
const FONTS = [
  { value: "'IBM Plex Mono'", label: 'IBM Plex Mono' },
  { value: "'JetBrains Mono'", label: 'JetBrains Mono' },
  { value: "'Space Mono'", label: 'Space Mono' }
];
const TWEAK_DEFAULTS = { theme: 'nebula', accent: '#3b82f6', glow: true, density: 'regular', mono: "'IBM Plex Mono'" };

let tweaks = { ...TWEAK_DEFAULTS };

// Default theme follows the OS until the user explicitly picks one:
// dark → Nebula, light → Cobalt.
function systemTheme() {
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'nebula' : 'cobalt';
}

function loadTweaks() {
  try {
    const saved = JSON.parse(localStorage.getItem(TWEAKS_KEY) || '{}');
    tweaks = { ...TWEAK_DEFAULTS, ...saved };
    // No explicit theme choice yet → derive from system preference.
    if (!saved.themeExplicit) tweaks.theme = systemTheme();
  } catch (e) { tweaks = { ...TWEAK_DEFAULTS, theme: systemTheme() }; }
}

// Re-derive theme on OS change, but only while the user hasn't pinned one.
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!tweaks.themeExplicit) { tweaks.theme = systemTheme(); applyTweaks(); buildTweaksPanel(); }
  });
}

function saveTweaks() {
  try { localStorage.setItem(TWEAKS_KEY, JSON.stringify(tweaks)); } catch (e) { /* ignore */ }
}

function applyTweaks() {
  const root = document.documentElement;
  root.setAttribute('data-theme', tweaks.theme);
  root.setAttribute('data-density', tweaks.density);
  root.setAttribute('data-glow', tweaks.glow ? 'on' : 'off');
  root.style.setProperty('--accent', tweaks.accent);
  root.style.setProperty('--mono', tweaks.mono + ", 'JetBrains Mono', ui-monospace, monospace");
  applyMonacoTheme();
  // theme toggle icon reflects whether we're in light (cobalt) or dark
  const tt = document.querySelector('#theme-toggle [data-icon]');
  if (tt) { tt.setAttribute('data-icon', tweaks.theme === 'cobalt' ? 'sun' : 'moon'); renderIcons(document.getElementById('theme-toggle')); }
}

function applyMonacoTheme() {
  if (typeof monaco === 'undefined') return;
  monaco.editor.setTheme('fsf-' + tweaks.theme);
  const fontFamily = tweaks.mono.replace(/'/g, '') + ', JetBrains Mono, monospace';
  [schemaEditor, queryEditor].forEach((ed) => { if (ed) ed.updateOptions({ fontFamily }); });
}

function setTweak(key, val) {
  tweaks[key] = val;
  // Any explicit theme pick stops the app from following the OS preference.
  if (key === 'theme') tweaks.themeExplicit = true;
  saveTweaks();
  applyTweaks();
  buildTweaksPanel();
}

/* ============================== App state ============================== */
let sessionId = null;
let schemaEditor = null;
let queryEditor = null;
let activeStreamController = null;
let currentMode = 'STREAMING';
let activeTab = 'table';

// Backend API base. Empty string = same-origin (the bundled deployment). When the static
// frontend is hosted separately from the backend, set `window.API_BASE` to the backend
// origin (e.g. via a small config.js loaded before app.js); every /api call goes through api().
const API_BASE = (window.API_BASE || '').replace(/\/+$/, '');
function api(path) { return API_BASE + path; }

// Results model
const R = {
  columns: [], columnTypes: [], aligns: [],
  materialized: new Map(),   // key -> { values, kind }
  log: [],                   // [{ op, values }]  capped
  samples: [],               // rows/sec
  running: false,
  truncated: false,
  executionTimeMs: 0,
  jobNodes: ['Source', 'Operator', 'Sink: collect'],
  filters: {},               // colIndex -> { op, v, v2 }
  clMuted: {},               // changelog: op -> true when that op type is muted/hidden
  clSearch: '',              // changelog: free-text search query
  err: null
};
const MAX_LOG = 400;
const MAX_SAMPLES = 80;

let throughputTimer = null;
let rowsSinceSample = 0;
let flashKeys = new Set();
let renderScheduled = false;

/* ============================== Status helpers ============================== */
function setStatus(text, state) {
  const el = document.getElementById('status-text');
  if (el) el.textContent = text;
  if (state) {
    const tb = document.getElementById('tb-status');
    if (tb) tb.className = 'tb-status st-' + state;
  }
}
function setStateBadge(state, label) {
  const sb = document.getElementById('sb-state');
  if (sb) sb.innerHTML = `<i></i> ${label}`;
  if (sb) sb.className = 'sb-item sb-state st-' + state;
}
function updateStatusBar() {
  const rowsEl = document.getElementById('status-rows');
  if (rowsEl) rowsEl.textContent = `${R.materialized.size} row${R.materialized.size !== 1 ? 's' : ''}`;
  const clEl = document.getElementById('status-changelog');
  if (clEl) clEl.textContent = `${R.log.length} changelog event${R.log.length !== 1 ? 's' : ''}`;
  const cnt = document.getElementById('tab-count-changelog');
  if (cnt) { cnt.textContent = R.log.length; cnt.style.display = R.log.length ? '' : 'none'; }
}

/* ============================== Mode segmented ============================== */
function getMode() { return currentMode; }
function setMode(mode) {
  currentMode = (mode === 'BATCH') ? 'BATCH' : 'STREAMING';
  document.querySelectorAll('#mode-segmented button').forEach((b) => {
    b.classList.toggle('is-on', b.dataset.mode === currentMode);
  });
  const sm = document.getElementById('status-mode');
  if (sm) sm.textContent = currentMode === 'BATCH' ? 'Batch' : 'Streaming';
}

/* ============================== Monaco setup ============================== */
require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' } });
require(['vs/editor/editor.main'], function () {
  defineMonacoThemes();
  const first = (typeof EXAMPLES !== 'undefined' && EXAMPLES.length) ? EXAMPLES[0] : null;
  const fontFamily = tweaks.mono.replace(/'/g, '') + ', JetBrains Mono, monospace';
  const opts = {
    language: 'sql', theme: 'fsf-' + tweaks.theme, minimap: { enabled: false },
    fontFamily, fontSize: 13.5, lineHeight: 22, lineNumbers: 'on',
    scrollBeyondLastLine: false, automaticLayout: true, padding: { top: 12, bottom: 12 },
    renderLineHighlight: 'line', scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 }
  };
  schemaEditor = monaco.editor.create(document.getElementById('schema-editor'), { ...opts, value: first ? first.schema : '' });
  queryEditor = monaco.editor.create(document.getElementById('query-editor'), { ...opts, value: first ? first.query : '' });
  if (first) setMode(first.mode);
  applyMonacoTheme();
  loadFiddleFromUrl();
});

/* ============================== Session ============================== */
async function createSession() {
  try {
    const res = await fetch(api('/api/sessions'), { method: 'POST' });
    if (res.status === 429) { setStatus('Session limit reached — try later', 'error'); return; }
    if (!res.ok) throw new Error('Failed to create session');
    const data = await res.json();
    sessionId = data.sessionId;
    setStatus('Session ready', 'ready');
    setStateBadge('ready', 'ready');
    const el = document.getElementById('status-session');
    if (el) el.innerHTML = `${iconSvg('dot', 9)} session ${sessionId.substring(0, 8)}`;
  } catch (err) {
    setStatus('Error: ' + err.message, 'error');
  }
}

/* ============================== Warm-up ============================== */
// Pre-warm the backend the moment the page loads: a trivial bounded query forces the lazy
// Flink MiniCluster to start and the Janino/Calcite code paths to compile while the user is
// still writing SQL — so their first real Run mostly skips the ~cold-start cost. Best-effort
// and silent; probes both modes to warm the batch and streaming TableEnvironments.
async function warmUp() {
  if (!sessionId) return;
  // Don't stomp on a status the user's own query may have set if they ran one immediately.
  if (!R.running) setStatus('Warming up engine…', 'compiling');
  // Resolves true only on a 2xx — so a misconfigured API_BASE / CORS / network / 5xx failure
  // doesn't get mislabelled as "Engine ready".
  const probe = (mode) => fetch(api(`/api/sessions/${sessionId}/execute`), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql: 'SELECT 1', mode })
  }).then((r) => r.ok).catch(() => false);
  const okBatch = await probe('BATCH');
  const okStream = await probe('STREAMING');
  // Don't clobber the status if the user already kicked off their own query meanwhile.
  if (R.running) return;
  if (okBatch || okStream) { setStatus('Engine ready', 'ready'); setStateBadge('ready', 'ready'); }
  else { setStatus('Backend unavailable', 'error'); setStateBadge('error', 'error'); }
}

/* ============================== Build schema ============================== */
async function buildSchema() {
  if (!sessionId) { setStatus('No active session', 'error'); return; }
  const btn = document.getElementById('build-schema-btn');
  btn.disabled = true;
  setStatus('Building schema…', 'compiling');
  try {
    const schema = schemaEditor.getValue().trim();
    if (!schema) { setStatus('No schema to build', 'ready'); return; }
    const statements = schema.split(';').map((s) => s.trim()).filter((s) => s.length > 0);
    for (const stmt of statements) {
      const res = await fetch(api(`/api/sessions/${sessionId}/execute`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: stmt, mode: getMode() })
      });
      if (!res.ok) { const err = await res.json(); setStatus('Schema error: ' + err.error, 'error'); return; }
    }
    setStatus('Schema built', 'ready');
    await refreshSchemaBrowser();
  } catch (err) {
    setStatus('Schema error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

/* ============================== Run query ============================== */
function runButton() { return document.getElementById('run-query-btn'); }
function setRunningUI(running) {
  R.running = running;
  const btn = runButton();
  btn.classList.toggle('is-running', running);
  btn.querySelector('.run-label').textContent = running ? 'Stop' : 'Run Query';
  btn.querySelector('[data-icon], svg')?.remove();
  btn.insertAdjacentHTML('afterbegin', iconSvg(running ? 'stop' : 'play', 14));
  document.getElementById('res-run').style.display = running ? '' : 'none';
}

async function runQuery() {
  if (R.running) { if (activeStreamController) activeStreamController.abort(); return; }
  if (!sessionId) { setStatus('No active session', 'error'); return; }
  const query = queryEditor.getValue().trim();
  if (!query) { setStatus('No query to execute', 'ready'); return; }
  resetResults();
  if (getMode() === 'STREAMING') await runStreamingQuery(query);
  else await runBatchQuery(query);
}

async function runBatchQuery(query) {
  setStatus('Compiling plan…', 'compiling');
  setRunningUI(true);
  setStateBadge('running', 'live');
  try {
    const res = await fetch(api(`/api/sessions/${sessionId}/execute`), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: query, mode: 'BATCH' })
    });
    if (!res.ok) { const err = await res.json(); showError(err.error); setStatus('Execution failed', 'error'); setStateBadge('error', 'error'); return; }
    const result = await res.json();
    if (!result.columns || !result.columns.length) {
      R.columns = []; renderActiveView(); setStatus('Statement executed', 'finished'); setStateBadge('finished', 'done'); return;
    }
    setSchema(result.columns, result.columnTypes);
    for (let i = 0; i < result.rows.length; i++) ingestRow(result.rowKinds[i], result.rows[i]);
    R.truncated = result.truncated; R.executionTimeMs = result.executionTimeMs;
    renderActiveView(); updateStatusBar();
    setStatus(`${result.rowCount} row${result.rowCount !== 1 ? 's' : ''} in ${result.executionTimeMs}ms${result.truncated ? ' (truncated)' : ''}`, 'finished');
    setStateBadge('finished', 'done');
    await refreshSchemaBrowser();
  } catch (err) {
    showError(err.message); setStatus('Execution error', 'error'); setStateBadge('error', 'error');
  } finally {
    setRunningUI(false);
  }
}

async function runStreamingQuery(query) {
  setStatus('Compiling plan…', 'compiling');
  setRunningUI(true);
  setStateBadge('running', 'live');
  activeStreamController = new AbortController();
  startThroughput();
  let firstRow = true;
  try {
    const res = await fetch(api(`/api/sessions/${sessionId}/execute/stream`), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: query, mode: 'STREAMING' }),
      signal: activeStreamController.signal
    });
    if (!res.ok) { const err = await res.json().catch(() => ({ error: 'Stream failed' })); showError(err.error); setStatus('Execution failed', 'error'); setStateBadge('error', 'error'); return; }
    setStatus('Job running', 'running');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        const ev = JSON.parse(line);
        if (ev.type === 'schema') {
          if (!ev.columns || !ev.columns.length) { setStatus('Statement executed', 'finished'); }
          else setSchema(ev.columns, ev.columnTypes);
        } else if (ev.type === 'row') {
          ingestRow(ev.kind, ev.values);
          if (firstRow) { firstRow = false; setStatus('Job running', 'running'); }
          scheduleRender();
        } else if (ev.type === 'end') {
          R.truncated = ev.truncated; R.executionTimeMs = ev.executionTimeMs;
          setStatus(`${ev.rowCount} row${ev.rowCount !== 1 ? 's' : ''} in ${ev.executionTimeMs}ms${ev.truncated ? ' (truncated)' : ''}`, 'finished');
        } else if (ev.type === 'error') {
          showError(ev.error); setStatus('Execution failed', 'error');
        }
      }
    }
    if (!R.err) setStateBadge('finished', 'done');
  } catch (err) {
    if (err.name === 'AbortError') { setStatus('Stopped', 'finished'); setStateBadge('finished', 'stopped'); }
    else { showError(err.message); setStatus('Execution error', 'error'); setStateBadge('error', 'error'); }
  } finally {
    activeStreamController = null;
    stopThroughput();
    setRunningUI(false);
    renderActiveView();
    refreshSchemaBrowser();
  }
}

/* ============================== Results model ============================== */
function resetResults() {
  R.columns = []; R.columnTypes = []; R.aligns = [];
  R.materialized = new Map(); R.log = []; R.samples = [];
  R.truncated = false; R.executionTimeMs = 0; R.err = null;
  R.filters = {};
  R.clMuted = {}; R.clSearch = '';
  closeFilterPopover();
  flashKeys = new Set(); rowsSinceSample = 0;
  updateStatusBar();
  renderActiveView();
}

function setSchema(columns, columnTypes) {
  R.columns = columns || [];
  R.columnTypes = columnTypes || [];
  R.aligns = R.columnTypes.map((t) => isNumericType(t) ? 'right' : 'left');
  R.jobNodes = deriveJobNodes();
  renderActiveView();
}

function isNumericType(t) {
  return /INT|BIGINT|DECIMAL|DOUBLE|FLOAT|SMALLINT|TINYINT|NUMERIC/i.test(t || '');
}

function ingestRow(kind, values) {
  // changelog
  R.log.push({ op: kind, values });
  if (R.log.length > MAX_LOG) R.log = R.log.slice(R.log.length - MAX_LOG);
  // materialized (upsert keyed on first column)
  const key = values.length ? String(values[0]) : String(R.materialized.size);
  if (kind === '+I' || kind === '+U') {
    R.materialized.set(key, { values, kind });
    flashKeys.add(key);
  } else if (kind === '-D') {
    R.materialized.delete(key);
  }
  rowsSinceSample++;
  updateStatusBar();
}

/* ---- throughput sampling ---- */
function startThroughput() {
  stopThroughput();
  rowsSinceSample = 0;
  const interval = 500;
  throughputTimer = setInterval(() => {
    const rate = Math.round((rowsSinceSample * 1000) / interval);
    rowsSinceSample = 0;
    R.samples.push(rate);
    if (R.samples.length > MAX_SAMPLES) R.samples = R.samples.slice(R.samples.length - MAX_SAMPLES);
    if (activeTab === 'throughput') renderActiveView();
  }, interval);
}
function stopThroughput() { if (throughputTimer) clearInterval(throughputTimer); throughputTimer = null; }

/* ---- job graph derivation ---- */
function deriveJobNodes() {
  const q = (queryEditor ? queryEditor.getValue() : '').toUpperCase();
  let op = 'Calc';
  if (/\bGROUP\s+BY\b/.test(q) && /(TUMBLE|HOP|CUMULATE|WINDOW)/.test(q)) op = 'WindowAggregate';
  else if (/\bGROUP\s+BY\b/.test(q)) op = 'GroupAggregate';
  else if (/ROW_NUMBER|\bRANK\b|OVER\s*\(/.test(q)) op = 'OverAggregate';
  else if (/\bJOIN\b/.test(q)) op = 'Join';
  // source table name from FROM clause
  const m = (queryEditor ? queryEditor.getValue() : '').match(/FROM\s+`?([A-Za-z0-9_]+)`?/i);
  const src = m ? 'Source: ' + m[1] : 'Source';
  return [src, op, 'Sink: collect'];
}

/* ============================== Rendering ============================== */
function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    if (activeTab === 'table' || activeTab === 'graph') renderActiveView();
    // Changelog: patch only the rows + counts so the live search input keeps focus
    // while the user types and rows stream in. Full render only when the bar isn't up yet.
    else if (activeTab === 'changelog') {
      if (document.querySelector('.rv-log-wrap')) refreshChangelogRows(); else renderActiveView();
    }
    flashKeys = new Set();
  });
}

function setActiveTab(tab) {
  activeTab = tab;
  if (tab !== 'table') closeFilterPopover();
  document.querySelectorAll('#results-tabs .rtab').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === tab));
  renderActiveView();
}

function showError(msg) {
  R.err = msg || 'Unknown error';
  renderActiveView();
}

function emptyState(icon, label, hint, isError) {
  return `<div class="rv-empty${isError ? ' is-error' : ''}"><div class="rv-empty-ic">${iconSvg(icon, 26)}</div><p class="rv-empty-label">${escapeHtml(label)}</p><span class="rv-empty-hint">${escapeHtml(hint)}</span></div>`;
}

function fmtVal(v) {
  if (v === null || v === undefined) return '<span class="rv-null">NULL</span>';
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return v.toLocaleString('en-US');
    return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return escapeHtml(String(v));
}

const OP_META = { '+I': { cls: 'op-i', label: 'INSERT' }, '+U': { cls: 'op-uu', label: 'UPDATE' }, '-U': { cls: 'op-du', label: 'RETRACT' }, '-D': { cls: 'op-d', label: 'DELETE' } };

function renderActiveView() {
  const body = document.getElementById('results-container');
  if (!body) return;
  if (R.err) { body.innerHTML = emptyState('info', 'Query failed', R.err, true); return; }
  switch (activeTab) {
    case 'table': body.innerHTML = renderTable(); break;
    case 'changelog': body.innerHTML = renderChangelog(); if (!clSearching()) body.scrollTop = body.scrollHeight; break;
    case 'throughput': body.innerHTML = renderThroughput(); break;
    case 'graph': body.innerHTML = renderJobGraph(); break;
  }
}

function renderTable() {
  if (!R.columns.length) {
    return emptyState('grid', 'No rows yet', 'Run the query to materialize results.');
  }
  const allRows = [...R.materialized.entries()]; // [key, {values, kind}]
  const active = Object.entries(R.filters).filter(([, f]) => f && f.v !== '' && f.v != null);
  const filtered = allRows.filter(([, ent]) => active.every(([ci, f]) => matchFilter(ent.values[+ci], f)));

  const bar = renderFilterBar(active, filtered.length, allRows.length);

  let inner;
  if (allRows.length === 0) {
    inner = emptyState('grid', 'No rows yet', 'Run the query to materialize results.');
  } else {
    const head = `<thead><tr><th class="rv-rownum">#</th>${R.columns.map((c, idx) => {
      const f = R.filters[idx];
      const isFil = f && f.v !== '' && f.v != null;
      const align = R.aligns[idx] || 'left';
      return `<th class="al-${align}${isFil ? ' th-filtered' : ''}">
        <button class="th-btn" data-col="${idx}">
          <span class="th-labels"><span class="rv-col">${escapeHtml(c)}</span><span class="rv-coltype">${escapeHtml(R.columnTypes[idx] || '')}</span></span>
          <span class="th-funnel${isFil ? ' is-on' : ''}">${iconSvg('filter', 12)}</span>
        </button></th>`;
    }).join('')}</tr></thead>`;
    let body;
    if (filtered.length === 0) {
      body = `<tr><td class="rv-noresult" colspan="${R.columns.length + 1}">No rows match the current filters.</td></tr>`;
    } else {
      body = filtered.map(([key, ent], idx) => {
        const flash = flashKeys.has(key) ? ' is-flash' : '';
        const cells = ent.values.map((v, j) =>
          `<td class="al-${R.aligns[j] || 'left'}${j === 0 ? ' rv-key' : ''}">${fmtVal(v)}</td>`).join('');
        return `<tr class="${flash.trim()}"><td class="rv-rownum">${idx + 1}</td>${cells}</tr>`;
      }).join('');
    }
    inner = `<table class="rv-table">${head}<tbody>${body}</tbody></table>`;
  }
  return `<div class="rv-table-wrap">${bar}${inner}</div>`;
}

function renderFilterBar(active, shown, total) {
  let mid, count = '';
  if (active.length === 0) {
    mid = `<span class="rv-filter-hint">Click a column header to filter rows</span>`;
  } else {
    const chips = active.map(([ci, f]) => {
      const valTxt = f.op === 'between'
        ? `${escapeHtml(f.v)}–${escapeHtml(f.v2 || '∞')}`
        : escapeHtml(f.v);
      return `<button class="rv-chip" data-chip="${ci}"><b>${escapeHtml(R.columns[+ci])}</b><span class="rv-chip-op">${escapeHtml(opSymbol(f.op))}</span><span class="rv-chip-val">${valTxt}</span><i class="rv-chip-x" data-chipx="${ci}">${iconSvg('x', 11)}</i></button>`;
    }).join('');
    mid = `<div class="rv-chips">${chips}<button class="rv-clear-all" data-clearall>Clear all</button></div>`;
    count = `<span class="rv-filter-count">${shown} of ${total}</span>`;
  }
  return `<div class="rv-filterbar"><span class="rv-filter-lead">${iconSvg('filter', 13)} Filters</span>${mid}${count}</div>`;
}

// ---- Column filter model ----
const NUM_OPS = [['>=', '≥'], ['<=', '≤'], ['>', '>'], ['<', '<'], ['=', '='], ['!=', '≠'], ['between', 'between']];
const TXT_OPS = [['contains', 'contains'], ['=', 'equals'], ['!=', 'is not']];
function opSymbol(op) {
  const f = NUM_OPS.concat(TXT_OPS).find((o) => o[0] === op);
  return f ? f[1] : op;
}
function matchFilter(val, f) {
  if (!f || f.v === '' || f.v == null) return true;
  if (f.op === 'contains') return String(val).toLowerCase().includes(String(f.v).toLowerCase());
  const isNum = typeof val === 'number';
  const a = isNum ? val : parseFloat(val);
  const b = parseFloat(f.v), b2 = parseFloat(f.v2);
  switch (f.op) {
    case '=': return isNum ? a === b : String(val) === String(f.v);
    case '!=': return isNum ? a !== b : String(val).toLowerCase() !== String(f.v).toLowerCase();
    case '>': return a > b;
    case '<': return a < b;
    case '>=': return a >= b;
    case '<=': return a <= b;
    case 'between': return (f.v2 === '' || f.v2 == null) ? a >= b : (a >= Math.min(b, b2) && a <= Math.max(b, b2));
    default: return true;
  }
}

let openFilterIdx = null;
function toggleFilter(idx, rect) {
  if (openFilterIdx === idx) closeFilterPopover();
  else openFilterPopover(idx, rect);
}
function removeFilter(ci) { delete R.filters[ci]; closeFilterPopover(); renderActiveView(); }
function clearAllFilters() { R.filters = {}; closeFilterPopover(); renderActiveView(); }
function closeFilterPopover() {
  const p = document.querySelector('.filt-pop');
  if (p) { if (p._cleanup) p._cleanup(); p.remove(); }
  openFilterIdx = null;
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

function openFilterPopover(colIdx, anchorRect) {
  closeFilterPopover();
  openFilterIdx = colIdx;
  const isNum = isNumericType(R.columnTypes[colIdx]);
  const ops = isNum ? NUM_OPS : TXT_OPS;
  const cur = R.filters[colIdx] || {};
  let op = cur.op || ops[0][0];
  let v = cur.v != null ? cur.v : '';
  let v2 = cur.v2 != null ? cur.v2 : '';

  const pop = document.createElement('div');
  pop.className = 'filt-pop';

  function readInputs() {
    const vi = pop.querySelector('.filt-v'); if (vi) v = vi.value;
    const v2i = pop.querySelector('.filt-v2'); if (v2i) v2 = v2i.value;
  }
  function apply() {
    readInputs();
    R.filters[colIdx] = { op, v, v2: op === 'between' ? v2 : '' };
    closeFilterPopover();
    renderActiveView();
  }
  function draw() {
    pop.innerHTML = `
      <div class="filt-pop-head"><span class="filt-pop-col">${escapeHtml(R.columns[colIdx])}</span><span class="filt-pop-type">${escapeHtml(R.columnTypes[colIdx] || '')}</span></div>
      <div class="filt-ops">${ops.map(([o, sym]) => `<button class="filt-op${o === op ? ' is-on' : ''}" data-op="${o}">${escapeHtml(sym)}</button>`).join('')}</div>
      <div class="filt-inputs">
        <input class="filt-input filt-v" type="${isNum ? 'number' : 'text'}" placeholder="${op === 'between' ? 'min' : 'value'}" value="${escapeAttr(v)}" />
        ${op === 'between' ? `<span class="filt-and">and</span><input class="filt-input filt-v2" type="number" placeholder="max" value="${escapeAttr(v2)}" />` : ''}
      </div>
      <div class="filt-pop-actions"><button class="filt-clear" data-clear>Clear</button><button class="btn run sm" data-apply>Apply</button></div>`;
    pop.querySelectorAll('.filt-op').forEach((b) => b.addEventListener('click', () => { readInputs(); op = b.dataset.op; draw(); }));
    pop.querySelector('[data-apply]').addEventListener('click', apply);
    pop.querySelector('[data-clear]').addEventListener('click', () => removeFilter(colIdx));
    const fi = pop.querySelector('.filt-v'); if (fi) fi.focus();
  }
  draw();

  document.body.appendChild(pop);
  const pw = 268;
  const left = Math.max(10, Math.min(anchorRect.left, window.innerWidth - pw - 10));
  pop.style.left = left + 'px';
  pop.style.top = (anchorRect.bottom + 7) + 'px';
  pop.style.width = pw + 'px';

  const onDocDown = (e) => {
    if (e.target.closest('.filt-pop') || e.target.closest('.th-btn') || e.target.closest('.rv-chip')) return;
    closeFilterPopover();
  };
  const onKey = (e) => { if (e.key === 'Escape') closeFilterPopover(); else if (e.key === 'Enter') apply(); };
  document.addEventListener('mousedown', onDocDown);
  document.addEventListener('keydown', onKey);
  pop._cleanup = () => { document.removeEventListener('mousedown', onDocDown); document.removeEventListener('keydown', onKey); };
}

// Changelog stream-control filter: op-type toggle pills + free-text highlight search.
// Deliberately different from the table's per-column filter — it filters the raw +I/-U/+U/-D
// event stream by operation type and by a value/column substring match.
const CL_PILL_ORDER = ['+I', '-U', '+U', '-D'];
const fmtCount = (n) => (n || 0).toLocaleString('en-US');

function clSearching() { return R.clSearch.trim().length > 0; }

// Per-op counts (over the full log), which pills to show, and the filtered rows.
function clComputed() {
  const counts = {};
  R.log.forEach((e) => { counts[e.op] = (counts[e.op] || 0) + 1; });
  // Always show the core three ops; add -D only when delete events actually occur.
  const ops = CL_PILL_ORDER.filter((op) => op !== '-D' || counts[op]);
  const ql = R.clSearch.trim().toLowerCase();
  const cols = R.columns;
  const rows = R.log
    .filter((e) => !R.clMuted[e.op])
    .filter((e) => !ql || e.values.some((v, j) =>
      String(v == null ? '' : v).toLowerCase().includes(ql) ||
      String(cols[j] || '').toLowerCase().includes(ql)));
  return { counts, ops, rows, total: R.log.length, ql };
}

function clCountText(c) {
  return (c.ql || c.rows.length !== c.total)
    ? `${fmtCount(c.rows.length)} / ${fmtCount(c.total)}`
    : `${fmtCount(c.total)} events`;
}

// Display a cell value, escaping it and wrapping the first case-insensitive search match.
function highlightCellHtml(v, ql) {
  if (v === null || v === undefined) return '<span class="rv-null">NULL</span>';
  const s = (typeof v === 'number')
    ? (Number.isInteger(v) ? v.toLocaleString('en-US')
      : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
    : String(v);
  if (!ql) return escapeHtml(s);
  const idx = s.toLowerCase().indexOf(ql);
  if (idx === -1) return escapeHtml(s);
  return escapeHtml(s.slice(0, idx)) +
    '<mark class="rv-mark">' + escapeHtml(s.slice(idx, idx + ql.length)) + '</mark>' +
    escapeHtml(s.slice(idx + ql.length));
}

function renderClBar(c) {
  const toggles = c.ops.map((op) => {
    const meta = OP_META[op] || { cls: '', label: op };
    const on = !R.clMuted[op];
    return `<button class="rv-op-toggle ${meta.cls} ${on ? 'is-on' : 'is-off'}" data-clop="${escapeHtml(op)}" title="${on ? 'Hide' : 'Show'} ${meta.label} rows">`
      + `<span class="rv-op-toggle-mark">${escapeHtml(op)}</span>`
      + `<span class="rv-op-toggle-label">${meta.label}</span>`
      + `<span class="rv-op-toggle-n">${fmtCount(c.counts[op])}</span></button>`;
  }).join('');
  const clearX = R.clSearch
    ? `<button class="rv-log-search-x" data-clclear title="Clear search">${iconSvg('x', 12)}</button>` : '';
  return `<div class="rv-log-bar">`
    + `<div class="rv-op-toggles">${toggles}</div>`
    + `<div class="rv-log-search">${iconSvg('search', 14)}`
    + `<input id="cl-search" class="rv-log-search-input" type="text" placeholder="Search values…" value="${escapeHtml(R.clSearch)}" autocomplete="off" spellcheck="false" aria-label="Search changelog">`
    + `${clearX}</div>`
    + `<span class="rv-log-count" id="cl-count">${clCountText(c)}</span></div>`;
}

function renderClRows(c) {
  if (!R.log.length) return emptyState('pulse', 'Changelog idle', 'Streaming queries emit +I / -U / +U / -D row operations here.');
  if (!c.rows.length) {
    const q = R.clSearch.trim();
    return `<div class="rv-log-empty">No events match${q ? ` “<b>${escapeHtml(q)}</b>”` : ' the active filters'}.</div>`;
  }
  const cols = R.columns;
  return `<div class="rv-log" id="cl-log">${c.rows.map((e) => {
    const meta = OP_META[e.op] || { cls: '', label: e.op };
    const vals = e.values.map((v, j) => `<span class="rv-log-cell"><i>${escapeHtml(cols[j] || ('c' + j))}</i>${highlightCellHtml(v, c.ql)}</span>`).join('');
    return `<div class="rv-log-row ${meta.cls}"><span class="rv-op">${escapeHtml(e.op)}</span><span class="rv-op-label">${meta.label}</span><span class="rv-log-vals">${vals}</span></div>`;
  }).join('')}</div>`;
}

function renderChangelog() {
  const c = clComputed();
  return `<div class="rv-log-wrap">${renderClBar(c)}${renderClRows(c)}</div>`;
}

// Patch only the rows + counts, leaving the control bar (and the focused search input) intact.
function refreshChangelogRows() {
  const wrap = document.querySelector('.rv-log-wrap');
  if (!wrap) { renderActiveView(); return; }
  const c = clComputed();
  wrap.querySelectorAll('.rv-op-toggle').forEach((btn) => {
    const n = btn.querySelector('.rv-op-toggle-n');
    if (n) n.textContent = fmtCount(c.counts[btn.dataset.clop]);
  });
  const cnt = wrap.querySelector('#cl-count');
  if (cnt) cnt.textContent = clCountText(c);
  const old = wrap.querySelector('.rv-log, .rv-log-empty, .rv-empty');
  if (old) old.outerHTML = renderClRows(c); else wrap.insertAdjacentHTML('beforeend', renderClRows(c));
  const body = document.getElementById('results-container');
  if (body && !clSearching()) body.scrollTop = body.scrollHeight;
}

function renderThroughput() {
  const W = 760, H = 200, pad = 8;
  const s = R.samples;
  const max = Math.max(10, ...s) * 1.15;
  const stepX = (W - pad * 2) / Math.max(40, s.length - 1);
  const pts = s.map((v, i) => [pad + i * stepX, H - pad - (v / max) * (H - pad * 2)]);
  const cur = s.length ? s[s.length - 1] : 0;
  const peak = s.length ? Math.max(...s) : 0;
  const total = R.log.length;
  let path = '', area = '';
  if (pts.length) {
    path = 'M' + pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' L');
    area = path + ` L${pts[pts.length - 1][0].toFixed(1)},${H - pad} L${pts[0][0].toFixed(1)},${H - pad} Z`;
  }
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const liveDot = R.running ? '<i class="rv-live-dot"></i>' : '';
  return `<div class="rv-chart">
    <div class="rv-stats">
      <div class="rv-stat is-accent"><span class="rv-stat-val">${fmt(cur)}${liveDot}</span><span class="rv-stat-label">rows / sec</span></div>
      <div class="rv-stat"><span class="rv-stat-val">${fmt(peak)}</span><span class="rv-stat-label">peak</span></div>
      <div class="rv-stat"><span class="rv-stat-val">${fmt(total)}</span><span class="rv-stat-label">changelog events</span></div>
    </div>
    <div class="rv-chart-canvas"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="rv-svg">
      <defs><linearGradient id="tpFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" style="stop-color:var(--accent);stop-opacity:0.38"/><stop offset="100%" style="stop-color:var(--accent);stop-opacity:0"/></linearGradient></defs>
      ${[0.25, 0.5, 0.75].map((g) => `<line x1="0" x2="${W}" y1="${H * g}" y2="${H * g}" class="rv-grid"/>`).join('')}
      ${area ? `<path d="${area}" fill="url(#tpFill)"/>` : ''}
      ${path ? `<path d="${path}" class="rv-line" fill="none"/>` : ''}
      ${pts.length ? `<circle cx="${pts[pts.length - 1][0]}" cy="${pts[pts.length - 1][1]}" r="3.5" class="rv-head"/>` : ''}
    </svg></div>
  </div>`;
}

function renderJobGraph() {
  const nodes = R.columns.length ? R.jobNodes : ['Source', 'Operator', 'Sink: collect'];
  const counts = [R.log.length, R.log.length, R.materialized.size];
  const running = R.running;
  const fmt = (n) => (n || 0).toLocaleString('en-US');
  let track = '';
  nodes.forEach((label, i) => {
    const ic = i === 0 ? 'db' : i === nodes.length - 1 ? 'grid' : 'bolt';
    const live = running ? ' is-live' : '';
    const active = running && i === nodes.length - 1 ? ' is-active' : '';
    track += `<div class="jg-node${live}${active}"><div class="jg-node-ic">${iconSvg(ic, 15)}</div><div class="jg-node-text"><span class="jg-node-name">${escapeHtml(label)}</span><span class="jg-node-meta">${fmt(counts[i])} rows</span></div></div>`;
    if (i < nodes.length - 1) {
      track += `<div class="jg-edge${running ? ' is-flowing' : ''}"><span class="jg-edge-line"></span><span class="jg-dot"></span><span class="jg-dot d2"></span><span class="jg-dot d3"></span></div>`;
    }
  });
  return `<div class="rv-jobgraph"><div class="jg-track">${track}</div>
    <div class="jg-legend"><span class="jg-status${running ? ' is-run' : ''}"><i></i> ${running ? 'RUNNING' : (R.columns.length ? 'FINISHED' : 'IDLE')}</span><span class="jg-par">parallelism 1 · 1 slot</span></div></div>`;
}

/* ============================== Schema browser (sidebar) ============================== */
async function refreshSchemaBrowser() {
  if (!sessionId) return;
  const list = document.getElementById('schema-browser-list');
  const empty = document.getElementById('schema-browser-empty');
  try {
    const res = await fetch(api(`/api/sessions/${sessionId}/tables`));
    if (!res.ok) return;
    const data = await res.json();
    list.innerHTML = '';
    if (!data.tables || !data.tables.length) { empty.style.display = ''; list.style.display = 'none'; return; }
    empty.style.display = 'none'; list.style.display = '';
    data.tables.forEach((table, i) => {
      const card = document.createElement('div');
      card.className = 'tbl-card';
      card.style.animationDelay = (i * 80) + 'ms';
      const cols = (table.columns || []).map((c) =>
        `<div class="tbl-col"><span class="tbl-col-name">${escapeHtml(c.name)}</span><span class="tbl-col-type">${escapeHtml(shortType(c.type))}</span></div>`).join('');
      card.innerHTML = `<div class="tbl-card-head"><span class="tbl-name">${iconSvg('table', 13)} ${escapeHtml(table.name)}</span><span class="tbl-kind">table</span></div><div class="tbl-cols">${cols}</div>`;
      card.querySelector('.tbl-card-head').addEventListener('click', () => card.classList.toggle('collapsed'));
      list.appendChild(card);
    });
  } catch (e) { /* convenience feature */ }
}
function shortType(t) { return String(t || '').replace(/\s+NOT NULL/i, '').replace(/\(.*\)/, '').trim(); }

/* ============================== Share / fiddle ============================== */
async function shareFiddle() {
  if (!schemaEditor || !queryEditor) return;
  try {
    const res = await fetch(api('/api/fiddles'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schema: schemaEditor.getValue(), query: queryEditor.getValue(), mode: getMode() })
    });
    if (!res.ok) throw new Error('Failed to save fiddle');
    const data = await res.json();
    const url = `${window.location.origin}/f/${data.shortCode}`;
    try { await navigator.clipboard.writeText(url); setStatus('Link copied to clipboard', 'ready'); }
    catch (e) { window.prompt('Copy this link:', url); setStatus('Fiddle saved', 'ready'); }
  } catch (err) { setStatus('Share failed: ' + err.message, 'error'); }
}

async function loadFiddleFromUrl() {
  const match = window.location.pathname.match(/^\/f\/([a-f0-9]+)$/);
  if (!match) return;
  try {
    const res = await fetch(api(`/api/fiddles/${match[1]}`));
    if (!res.ok) { setStatus('Fiddle not found', 'error'); return; }
    const fiddle = await res.json();
    if (schemaEditor) schemaEditor.setValue(fiddle.schema);
    if (queryEditor) queryEditor.setValue(fiddle.query);
    setMode(fiddle.mode);
    setStatus('Fiddle loaded', 'ready');
    setTimeout(() => { if (sessionId) buildSchema(); }, 500);
  } catch (err) { setStatus('Failed to load fiddle', 'error'); }
}

/* ============================== Build info ============================== */
async function loadBuildInfo() {
  const el = document.getElementById('status-build');
  if (!el) return;
  try {
    const res = await fetch(api('/api/build-info'));
    if (!res.ok) return;
    const info = await res.json();
    el.textContent = `build ${info.commit}`;
    const parts = [];
    if (info.branch && info.branch !== 'unknown') parts.push(info.branch);
    if (info.commitFull && info.commitFull !== info.commit) parts.push(info.commitFull);
    if (info.time && info.time !== 'unknown') parts.push(info.time);
    el.title = parts.length ? parts.join(' · ') : 'Deployed build';
  } catch (e) { /* ignore */ }
}

/* ============================== Examples ============================== */
function populateExamples() {
  const select = document.getElementById('example-select');
  if (typeof EXAMPLES === 'undefined') return;
  EXAMPLES.forEach((ex, i) => {
    const o = document.createElement('option');
    o.value = i; o.textContent = ex.title; select.appendChild(o);
  });
  const custom = document.createElement('option');
  custom.value = 'custom'; custom.textContent = 'Custom'; select.appendChild(custom);
  select.addEventListener('change', () => {
    if (select.value === 'custom') return;
    const ex = EXAMPLES[parseInt(select.value, 10)];
    if (schemaEditor) schemaEditor.setValue(ex.schema);
    if (queryEditor) queryEditor.setValue(ex.query);
    setMode(ex.mode);
  });
}

/* ============================== Maximize ============================== */
function syncMaximizeIcons() {
  document.querySelectorAll('.panel-maximize-btn').forEach((btn) => {
    const panel = btn.closest('.pane, .results');
    const maxed = !!(panel && panel.classList.contains('panel-maximized'));
    btn.innerHTML = iconSvg(maxed ? 'minimize' : 'expand', 13);
    btn.title = maxed ? 'Restore panel (Esc)' : 'Maximize panel';
  });
}
function togglePanelMaximize(panel) {
  const willMax = !panel.classList.contains('panel-maximized');
  document.querySelectorAll('.panel-maximized').forEach((p) => p.classList.remove('panel-maximized'));
  document.getElementById('maxed-backdrop').hidden = !willMax;
  if (willMax) panel.classList.add('panel-maximized');
  syncMaximizeIcons();
  requestAnimationFrame(() => { if (schemaEditor) schemaEditor.layout(); if (queryEditor) queryEditor.layout(); });
}
function initMaximize() {
  document.querySelectorAll('.panel-maximize-btn').forEach((btn) => {
    btn.addEventListener('click', () => { const p = btn.closest('.pane, .results'); if (p) togglePanelMaximize(p); });
  });
  document.getElementById('maxed-backdrop').addEventListener('click', () => {
    const m = document.querySelector('.panel-maximized'); if (m) togglePanelMaximize(m);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { const m = document.querySelector('.panel-maximized'); if (m) togglePanelMaximize(m); }
  });
  syncMaximizeIcons();
}

/* ============================== Tweaks panel ============================== */
function buildTweaksPanel() {
  let panel = document.getElementById('tweaks-panel');
  const open = panel ? !panel.hidden : false;
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'tweaks-panel';
    panel.className = 'tweaks';
    panel.hidden = true;
    document.body.appendChild(panel);
  }
  panel.innerHTML = `
    <div class="tweaks-hd"><b>Tweaks</b><button class="icon-btn ghost" id="tweaks-close" title="Close">${iconSvg('x', 15)}</button></div>
    <div class="tweaks-body">
      <div class="twk-sect">Direction</div>
      <div class="twk-row"><span class="twk-lbl">Theme</span>
        <div class="twk-seg" data-twk="theme">
          ${['nebula', 'carbon', 'cobalt'].map((v) => `<button data-val="${v}" class="${tweaks.theme === v ? 'is-on' : ''}">${v}</button>`).join('')}
        </div>
      </div>
      <div class="twk-row"><span class="twk-lbl">Accent</span>
        <div class="twk-swatches">
          ${ACCENTS.map((c) => `<button class="twk-swatch ${tweaks.accent.toLowerCase() === c.toLowerCase() ? 'is-on' : ''}" data-accent="${c}" style="background:${c};color:${c}" title="${c}"></button>`).join('')}
        </div>
      </div>
      <div class="twk-row inline"><span class="twk-lbl">Glow / bloom</span>
        <button class="twk-toggle" data-twk-toggle="glow" data-on="${tweaks.glow ? '1' : '0'}"><i></i></button>
      </div>
      <div class="twk-sect">Layout</div>
      <div class="twk-row"><span class="twk-lbl">Density</span>
        <div class="twk-seg" data-twk="density">
          ${['compact', 'regular'].map((v) => `<button data-val="${v}" class="${tweaks.density === v ? 'is-on' : ''}">${v}</button>`).join('')}
        </div>
      </div>
      <div class="twk-row"><span class="twk-lbl">Code font</span>
        <select class="twk-select" id="twk-font">
          ${FONTS.map((f) => `<option value="${f.value}" ${tweaks.mono === f.value ? 'selected' : ''}>${f.label}</option>`).join('')}
        </select>
      </div>
    </div>`;
  panel.hidden = !open;
  panel.querySelector('#tweaks-close').addEventListener('click', () => { panel.hidden = true; });
  panel.querySelectorAll('.twk-seg[data-twk] button').forEach((b) => {
    b.addEventListener('click', () => setTweak(b.parentElement.dataset.twk, b.dataset.val));
  });
  panel.querySelectorAll('[data-accent]').forEach((b) => b.addEventListener('click', () => setTweak('accent', b.dataset.accent)));
  panel.querySelector('[data-twk-toggle="glow"]').addEventListener('click', () => setTweak('glow', !tweaks.glow));
  panel.querySelector('#twk-font').addEventListener('change', (e) => setTweak('mono', e.target.value));
}
function toggleTweaks() {
  buildTweaksPanel();
  const panel = document.getElementById('tweaks-panel');
  panel.hidden = !panel.hidden;
}

/* ============================== Tour ============================== */
const TOUR_STEPS = [
  { sel: '.sidebar', place: 'right', kicker: 'Catalog', title: 'Tables', body: 'Every table you register shows up here. Hit Build Schema and your DDL objects appear with their columns and connector type — your live view of the catalog.' },
  { sel: '#schema-panel', place: 'bottom', kicker: 'DDL', title: 'Schema editor', body: 'Define sources and sinks with CREATE TABLE. The datagen and faker connectors fabricate rows on the fly so you can experiment without wiring up Kafka.' },
  { sel: '#query-panel', place: 'bottom', kicker: 'DML', title: 'Query editor', body: 'Write the streaming SELECT you want to run. Aggregations, windows, joins, Top-N — Flink keeps the result continuously up to date as new rows arrive.' },
  { sel: '.toolbar', place: 'top', kicker: 'Controls', title: 'Run controls', body: 'Build Schema registers your DDL, then Run Query submits the job. Switch between Streaming and Batch execution, or load a ready-made query preset to explore.' },
  { sel: '.results', place: 'top', kicker: 'Output', title: 'Live results', body: 'Watch results come alive: the materialized Table, the raw +I / -U / +U Changelog, a Throughput chart, and the Job Graph showing how rows flow Source → Aggregate → Sink.' }
];
let tourIndex = 0;
function startTour() {
  const m = document.querySelector('.panel-maximized'); if (m) togglePanelMaximize(m);
  tourIndex = 0;
  renderTour();
  document.addEventListener('keydown', tourKeys);
  window.addEventListener('resize', renderTour);
}
function endTour() {
  const el = document.getElementById('tour-root'); if (el) el.remove();
  document.removeEventListener('keydown', tourKeys);
  window.removeEventListener('resize', renderTour);
}
function tourKeys(e) {
  if (e.key === 'Escape') endTour();
  else if (e.key === 'ArrowRight') { tourIndex = Math.min(tourIndex + 1, TOUR_STEPS.length - 1); renderTour(); }
  else if (e.key === 'ArrowLeft') { tourIndex = Math.max(tourIndex - 1, 0); renderTour(); }
}
function renderTour() {
  const step = TOUR_STEPS[tourIndex];
  const target = document.querySelector(step.sel);
  if (!target) return;
  const r = target.getBoundingClientRect();
  let root = document.getElementById('tour-root');
  if (!root) { root = document.createElement('div'); root.id = 'tour-root'; root.className = 'tour'; document.body.appendChild(root); }
  const sp = 8;
  const total = TOUR_STEPS.length;
  root.innerHTML = `
    <div class="tour-catch"></div>
    <div class="tour-spot" style="left:${r.left - sp}px;top:${r.top - sp}px;width:${r.width + sp * 2}px;height:${r.height + sp * 2}px"></div>
    <div class="tour-card" id="tour-card">
      <div class="tour-card-top"><span class="tour-kicker">${step.kicker}</span><span class="tour-count">${String(tourIndex + 1).padStart(2, '0')}<i>/</i>${String(total).padStart(2, '0')}</span></div>
      <h3 class="tour-title">${step.title}</h3>
      <p class="tour-body">${step.body}</p>
      <div class="tour-dots">${TOUR_STEPS.map((_, k) => `<button class="tour-dot ${k === tourIndex ? 'is-on' : ''}" data-k="${k}"></button>`).join('')}</div>
      <div class="tour-actions">
        <button class="tour-skip" id="tour-skip">Skip tour</button>
        <div class="tour-nav">
          ${tourIndex > 0 ? '<button class="btn outline sm" id="tour-back">Back</button>' : ''}
          <button class="btn run sm" id="tour-next">${tourIndex < total - 1 ? 'Next' : 'Finish'}</button>
        </div>
      </div>
    </div>`;
  root.querySelector('.tour-catch').addEventListener('click', endTour);
  root.querySelector('#tour-skip').addEventListener('click', endTour);
  root.querySelector('#tour-next').addEventListener('click', () => {
    if (tourIndex < total - 1) { tourIndex++; renderTour(); } else endTour();
  });
  const back = root.querySelector('#tour-back'); if (back) back.addEventListener('click', () => { tourIndex--; renderTour(); });
  root.querySelectorAll('.tour-dot').forEach((d) => d.addEventListener('click', () => { tourIndex = parseInt(d.dataset.k, 10); renderTour(); }));
  // position card
  const card = root.querySelector('#tour-card');
  const c = card.getBoundingClientRect();
  const pad = 18, vw = window.innerWidth, vh = window.innerHeight;
  let left, top;
  if (step.place === 'right') { left = r.left + r.width + pad; top = r.top; }
  else if (step.place === 'top') { left = r.left; top = r.top - c.height - pad; }
  else { left = r.left; top = r.top + r.height + pad; }
  left = Math.max(pad, Math.min(left, vw - c.width - pad));
  top = Math.max(pad, Math.min(top, vh - c.height - pad));
  card.style.left = left + 'px'; card.style.top = top + 'px';
}

/* ============================== Utils ============================== */
function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ============================== Init ============================== */
loadTweaks();
applyTweaks();

document.addEventListener('DOMContentLoaded', () => {
  renderIcons();
  setRunningUI(false);
  applyTweaks();
  populateExamples();
  createSession().then(warmUp);
  loadBuildInfo();
  initMaximize();
  renderActiveView();

  document.getElementById('build-schema-btn').addEventListener('click', buildSchema);
  document.getElementById('run-query-btn').addEventListener('click', runQuery);
  document.getElementById('share-btn').addEventListener('click', shareFiddle);
  document.getElementById('tweaks-btn').addEventListener('click', toggleTweaks);
  document.getElementById('tour-btn').addEventListener('click', startTour);

  document.querySelectorAll('#mode-segmented button').forEach((b) => {
    b.addEventListener('click', () => setMode(b.dataset.mode));
  });
  document.querySelectorAll('#results-tabs .rtab').forEach((b) => {
    b.addEventListener('click', () => setActiveTab(b.dataset.tab));
  });

  // Delegated handling for column-filter affordances in the Table view (the
  // results body is re-rendered on every streamed row, so we bind once here).
  document.getElementById('results-container').addEventListener('click', (e) => {
    // Changelog: op-type toggle pills + clear-search button
    const clop = e.target.closest('.rv-op-toggle');
    if (clop) {
      const op = clop.dataset.clop;
      R.clMuted[op] = !R.clMuted[op];
      clop.classList.toggle('is-on'); clop.classList.toggle('is-off');
      refreshChangelogRows();
      return;
    }
    if (e.target.closest('[data-clclear]')) {
      R.clSearch = '';
      const inp = document.getElementById('cl-search');
      if (inp) { inp.value = ''; inp.focus(); }
      const x = e.target.closest('.rv-log-search-x');
      if (x) x.remove();
      refreshChangelogRows();
      return;
    }
    const chipX = e.target.closest('.rv-chip-x');
    if (chipX) { e.stopPropagation(); removeFilter(parseInt(chipX.dataset.chipx, 10)); return; }
    if (e.target.closest('[data-clearall]')) { clearAllFilters(); return; }
    const chip = e.target.closest('.rv-chip');
    if (chip) { toggleFilter(parseInt(chip.dataset.chip, 10), chip.getBoundingClientRect()); return; }
    const th = e.target.closest('.th-btn');
    if (th) { toggleFilter(parseInt(th.dataset.col, 10), th.closest('th').getBoundingClientRect()); return; }
  });
  // Changelog free-text search — update rows in place so the input keeps focus while typing.
  document.getElementById('results-container').addEventListener('input', (e) => {
    const inp = e.target.closest('.rv-log-search-input');
    if (!inp) return;
    R.clSearch = inp.value;
    const search = inp.closest('.rv-log-search');
    const x = search.querySelector('.rv-log-search-x');
    if (R.clSearch && !x) search.insertAdjacentHTML('beforeend', `<button class="rv-log-search-x" data-clclear title="Clear search">${iconSvg('x', 12)}</button>`);
    else if (!R.clSearch && x) x.remove();
    refreshChangelogRows();
  });
  document.getElementById('theme-toggle').addEventListener('click', () => {
    setTweak('theme', tweaks.theme === 'cobalt' ? 'nebula' : 'cobalt');
  });
  document.getElementById('schema-browser-toggle').addEventListener('click', (e) => {
    const collapsed = document.getElementById('schema-browser').classList.toggle('collapsed');
    e.currentTarget.title = collapsed ? 'Expand tables' : 'Collapse';
  });
});
