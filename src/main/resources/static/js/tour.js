// --- Product Tour ---

function getTourConfig() {
    const driver = window.driver && window.driver.js && window.driver.js.driver;
    if (!driver) return null;

    return {
        showProgress: true,
        showButtons: ['next', 'previous', 'close'],
        steps: [
            {
                popover: {
                    title: 'Welcome to Flink SQL Fiddle!',
                    description: '<p>This guided tour will walk you through the UI so you can run your first Flink SQL query in seconds.</p><p>The workflow is simple: <strong>define schema &rarr; build &rarr; write query &rarr; run</strong>.</p><p style="margin-top:12px"><label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer"><input type="checkbox" id="tour-dismiss-checkbox"> Don\'t show this on startup</label></p>',
                    side: 'over',
                    align: 'center'
                }
            },
            {
                element: '#schema-editor',
                popover: {
                    title: 'Schema Editor (DDL)',
                    description: 'Write your CREATE TABLE statements here. This defines the tables and connectors Flink will use — like datagen for test data or faker for realistic records.',
                    side: 'right',
                    align: 'start'
                }
            },
            {
                element: '#schema-browser',
                popover: {
                    title: 'Schema Browser',
                    description: 'After building your schema, this sidebar shows all registered tables and their columns. Click a table name to expand its column list.',
                    side: 'right',
                    align: 'start'
                }
            },
            {
                element: '#query-editor',
                popover: {
                    title: 'Query Editor',
                    description: 'Write your Flink SQL query here — SELECT, JOIN, window aggregations, and more. The query runs against the tables you defined in the schema.',
                    side: 'right',
                    align: 'start'
                }
            },
            {
                element: '#mode-select',
                popover: {
                    title: 'Execution Mode',
                    description: 'Choose <strong>Batch</strong> for finite results or <strong>Streaming</strong> for continuous processing with changelogs (+I, -U, +U rows).',
                    side: 'bottom',
                    align: 'start'
                }
            },
            {
                element: '#example-select',
                popover: {
                    title: 'Example Queries',
                    description: 'Pick a pre-built example to load its schema and query instantly — great for learning window functions, joins, and faker connectors.',
                    side: 'bottom',
                    align: 'start'
                }
            },
            {
                element: '#build-schema-btn',
                popover: {
                    title: 'Build Schema',
                    description: 'Click this first! It executes the DDL statements to register your tables. You must build the schema before running a query.',
                    side: 'bottom',
                    align: 'start'
                }
            },
            {
                element: '#run-query-btn',
                popover: {
                    title: 'Run Query',
                    description: 'Executes your SQL query against the built schema. Results appear in the panel below.',
                    side: 'bottom',
                    align: 'start'
                }
            },
            {
                element: '#results-container',
                popover: {
                    title: 'Results Panel',
                    description: 'Query results appear here in a table with per-column filters. In streaming mode, you\'ll see changelog operations (op column).',
                    side: 'top',
                    align: 'center'
                }
            },
            {
                element: '#share-btn',
                popover: {
                    title: 'Share',
                    description: 'Save your schema + query as a shareable link. Anyone with the link sees the same fiddle — great for sharing examples or asking for help.',
                    side: 'bottom',
                    align: 'start'
                }
            }
        ]
    };
}

function startTour() {
    const driverConstructor = window.driver && window.driver.js && window.driver.js.driver;
    if (!driverConstructor) return;

    const config = getTourConfig();
    if (!config) return;

    config.onDestroyStarted = (element, step, opts) => {
        const checkbox = document.getElementById('tour-dismiss-checkbox');
        if (checkbox && checkbox.checked) {
            localStorage.setItem('flink-fiddle-tour-dismissed', 'true');
        }
        opts.driver.destroy();
    };

    const driverObj = driverConstructor(config);
    driverObj.drive();
}

function checkFirstVisitTour() {
    if (localStorage.getItem('flink-fiddle-tour-dismissed')) return;
    // Small delay to let Monaco editors initialize
    setTimeout(startTour, 800);
}
