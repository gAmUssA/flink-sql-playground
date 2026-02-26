let sessionId = null;
let schemaEditor = null;
let queryEditor = null;

const ROW_KIND_CLASSES = {
    '+I': 'row-insert',
    '+U': 'row-update-after',
    '-U': 'row-update-before',
    '-D': 'row-delete'
};

// --- Monaco Editor Setup ---

require.config({
    paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' }
});

require(['vs/editor/editor.main'], function () {
    const firstExample = typeof EXAMPLES !== 'undefined' && EXAMPLES.length > 0 ? EXAMPLES[0] : null;

    schemaEditor = monaco.editor.create(document.getElementById('schema-editor'), {
        value: firstExample ? firstExample.schema : '',
        language: 'sql',
        theme: 'vs-dark',
        minimap: { enabled: false },
        fontSize: 13,
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true
    });

    queryEditor = monaco.editor.create(document.getElementById('query-editor'), {
        value: firstExample ? firstExample.query : '',
        language: 'sql',
        theme: 'vs-dark',
        minimap: { enabled: false },
        fontSize: 13,
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true
    });

    if (firstExample) {
        document.getElementById('mode-select').value = firstExample.mode;
    }

    // Load fiddle from URL if present (overrides default example)
    loadFiddleFromUrl();
});

// --- Results Rendering ---

function renderResults(result) {
    const container = document.getElementById('results-container');
    container.innerHTML = '';
    container.classList.remove('fade-in');
    void container.offsetWidth;
    container.classList.add('fade-in');

    if (!result.columns || result.columns.length === 0) {
        container.textContent = 'Statement executed successfully.';
        return;
    }

    const table = document.createElement('table');
    table.className = 'results-table';

    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const kindTh = document.createElement('th');
    kindTh.textContent = 'op';
    headerRow.appendChild(kindTh);
    result.columns.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    result.rows.forEach((row, i) => {
        const tr = document.createElement('tr');
        const kind = result.rowKinds[i];
        tr.className = ROW_KIND_CLASSES[kind] || '';

        const kindTd = document.createElement('td');
        kindTd.textContent = kind;
        tr.appendChild(kindTd);

        row.forEach(val => {
            const td = document.createElement('td');
            td.textContent = val === null ? 'NULL' : String(val);
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);

    // Metadata
    const meta = document.createElement('div');
    meta.className = 'results-meta';
    let text = `${result.rowCount} row${result.rowCount !== 1 ? 's' : ''} in ${result.executionTimeMs}ms`;
    if (result.truncated) {
        text += ' (results truncated to 1000 rows)';
    }
    meta.textContent = text;
    container.appendChild(meta);

    const statusRows = document.getElementById('status-rows');
    if (statusRows) statusRows.textContent = `${result.rowCount} row${result.rowCount !== 1 ? 's' : ''}`;
}

// --- Session Management ---

async function createSession() {
    try {
        const response = await fetch('/api/sessions', { method: 'POST' });
        if (response.status === 429) {
            setStatus('Session limit reached. Try again later.');
            alert('Session limit reached. Please try again later.');
            return;
        }
        if (!response.ok) throw new Error('Failed to create session');
        const data = await response.json();
        sessionId = data.sessionId;
        setStatus('Session ready');
        const sessionEl = document.getElementById('status-session');
        if (sessionEl) sessionEl.textContent = 'Session: ' + sessionId.substring(0, 8);
    } catch (err) {
        setStatus('Error: ' + err.message);
    }
}

// --- Build Schema ---

async function buildSchema() {
    if (!sessionId) {
        setStatus('No active session');
        return;
    }

    const btn = document.getElementById('build-schema-btn');
    const mode = document.getElementById('mode-select').value;

    btn.disabled = true;
    btn.classList.add('running');
    setStatus('Building schema...');

    try {
        const schema = schemaEditor.getValue().trim();
        if (!schema) {
            setStatus('No schema to build');
            return;
        }

        const statements = schema.split(';').map(s => s.trim()).filter(s => s.length > 0);
        for (const stmt of statements) {
            const res = await fetch(`/api/sessions/${sessionId}/execute`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sql: stmt, mode: mode })
            });
            if (!res.ok) {
                const err = await res.json();
                setStatus('Schema error: ' + err.error);
                return;
            }
        }

        setStatus('Schema built successfully');
        await refreshSchemaBrowser();
    } catch (err) {
        setStatus('Schema error: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.classList.remove('running');
    }
}

// --- Run Query ---

async function runQuery() {
    if (!sessionId) {
        setStatus('No active session');
        return;
    }

    const btn = document.getElementById('run-query-btn');
    const resultsContainer = document.getElementById('results-container');
    const mode = document.getElementById('mode-select').value;

    btn.disabled = true;
    btn.classList.add('running');
    setStatus('Executing...');
    resultsContainer.textContent = '';

    try {
        const query = queryEditor.getValue().trim();
        if (!query) {
            setStatus('No query to execute');
            return;
        }

        const response = await fetch(`/api/sessions/${sessionId}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql: query, mode: mode })
        });

        if (!response.ok) {
            const err = await response.json();
            resultsContainer.textContent = 'Error: ' + err.error;
            setStatus('Execution failed');
            return;
        }

        const result = await response.json();
        renderResults(result);
        setStatus(`${result.rowCount} rows in ${result.executionTimeMs}ms` +
                  (result.truncated ? ' (truncated)' : ''));
    } catch (err) {
        resultsContainer.textContent = 'Error: ' + err.message;
        setStatus('Execution error');
    } finally {
        btn.disabled = false;
        btn.classList.remove('running');
    }
}

// --- Schema Browser ---

async function refreshSchemaBrowser() {
    if (!sessionId) return;

    const list = document.getElementById('schema-browser-list');
    const empty = document.getElementById('schema-browser-empty');
    const browser = document.getElementById('schema-browser');

    try {
        const response = await fetch(`/api/sessions/${sessionId}/tables`);
        if (!response.ok) return;

        const data = await response.json();
        list.innerHTML = '';

        if (!data.tables || data.tables.length === 0) {
            empty.style.display = '';
            list.style.display = 'none';
            return;
        }

        empty.style.display = 'none';
        list.style.display = '';
        browser.classList.remove('collapsed');

        data.tables.forEach(table => {
            const item = document.createElement('div');
            item.className = 'schema-table-item';

            const name = document.createElement('div');
            name.className = 'schema-table-name';
            name.innerHTML = `<span class="schema-table-arrow">&#9654;</span> ${escapeHtml(table.name)}`;
            name.addEventListener('click', () => item.classList.toggle('expanded'));

            const cols = document.createElement('div');
            cols.className = 'schema-columns';
            table.columns.forEach(col => {
                const colDiv = document.createElement('div');
                colDiv.className = 'schema-column';
                colDiv.innerHTML = `${escapeHtml(col.name)} <span class="schema-column-type">${escapeHtml(col.type)}</span>`;
                cols.appendChild(colDiv);
            });

            item.appendChild(name);
            item.appendChild(cols);
            list.appendChild(item);
        });
    } catch (err) {
        // Silently fail — schema browser is a convenience feature
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// --- Share ---

async function shareFiddle() {
    if (!schemaEditor || !queryEditor) return;

    const mode = document.getElementById('mode-select').value;
    try {
        const response = await fetch('/api/fiddles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                schema: schemaEditor.getValue(),
                query: queryEditor.getValue(),
                mode: mode
            })
        });

        if (!response.ok) throw new Error('Failed to save fiddle');
        const data = await response.json();
        const url = `${window.location.origin}/f/${data.shortCode}`;
        await navigator.clipboard.writeText(url);
        setStatus('Link copied to clipboard!');
    } catch (err) {
        setStatus('Share failed: ' + err.message);
    }
}

// --- URL Routing ---

async function loadFiddleFromUrl() {
    const match = window.location.pathname.match(/^\/f\/([a-f0-9]+)$/);
    if (!match) return;

    const shortCode = match[1];
    try {
        const response = await fetch(`/api/fiddles/${shortCode}`);
        if (!response.ok) {
            setStatus('Fiddle not found');
            return;
        }
        const fiddle = await response.json();
        if (schemaEditor) schemaEditor.setValue(fiddle.schema);
        if (queryEditor) queryEditor.setValue(fiddle.query);
        document.getElementById('mode-select').value = fiddle.mode;
        setStatus('Fiddle loaded');
        // Auto-build schema for shared fiddles so schema browser populates
        setTimeout(async () => {
            if (sessionId) await buildSchema();
        }, 500);
    } catch (err) {
        setStatus('Failed to load fiddle');
    }
}

function setStatus(text) {
    document.getElementById('status-text').textContent = text;
}

// --- Examples Dropdown ---

function populateExamples() {
    const select = document.getElementById('example-select');
    if (typeof EXAMPLES === 'undefined') return;

    EXAMPLES.forEach((ex, i) => {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = ex.title;
        select.appendChild(option);
    });

    const customOption = document.createElement('option');
    customOption.value = 'custom';
    customOption.textContent = 'Custom';
    select.appendChild(customOption);

    select.addEventListener('change', () => {
        if (select.value === 'custom') return;
        const example = EXAMPLES[parseInt(select.value)];
        if (schemaEditor) schemaEditor.setValue(example.schema);
        if (queryEditor) queryEditor.setValue(example.query);
        document.getElementById('mode-select').value = example.mode;
    });
}

// --- Resize Handle ---

function initResizeHandle() {
    const handle = document.querySelector('.resize-handle');
    const results = document.querySelector('.results');
    let startY, startHeight;

    handle.addEventListener('mousedown', (e) => {
        startY = e.clientY;
        startHeight = results.getBoundingClientRect().height;
        document.body.classList.add('resizing');

        function onMouseMove(e) {
            const delta = startY - e.clientY;
            const newHeight = Math.min(
                Math.max(60, startHeight + delta),
                window.innerHeight - 200
            );
            results.style.flexBasis = newHeight + 'px';
        }

        function onMouseUp() {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.classList.remove('resizing');
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
}

// --- Schema Browser Toggle ---

function initSchemaBrowserToggle() {
    const toggle = document.getElementById('schema-browser-toggle');
    const browser = document.getElementById('schema-browser');
    toggle.addEventListener('click', () => {
        browser.classList.toggle('collapsed');
    });
}

// --- Event Listeners ---

document.addEventListener('DOMContentLoaded', () => {
    populateExamples();
    createSession();
    initResizeHandle();
    initSchemaBrowserToggle();
    document.getElementById('build-schema-btn').addEventListener('click', buildSchema);
    document.getElementById('run-query-btn').addEventListener('click', runQuery);
    document.getElementById('share-btn').addEventListener('click', shareFiddle);

    // Sync status bar mode indicator
    const modeSelect = document.getElementById('mode-select');
    const statusMode = document.getElementById('status-mode');
    if (modeSelect && statusMode) {
        statusMode.textContent = modeSelect.value === 'STREAMING' ? 'Streaming' : 'Batch';
        modeSelect.addEventListener('change', () => {
            statusMode.textContent = modeSelect.value === 'STREAMING' ? 'Streaming' : 'Batch';
        });
    }
});
