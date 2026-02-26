## Why

New users need guidance on what Flink SQL can do. Preloaded examples demonstrate key features — aggregations, window functions, joins, and the batch vs streaming difference — so users can explore immediately without writing SQL from scratch. References blueprint section: "MVP feature set — Preloaded examples."

## What Changes

- Create 5-8 curated example fiddles covering: simple aggregation, tumbling window, hopping window, cumulate window, temporal join, batch vs streaming comparison
- Add an example dropdown selector in the frontend
- Each example includes schema DDL and a query with a descriptive title
- Selecting an example populates both editor panels

## Capabilities

### New Capabilities
- `example-queries`: Curated SQL examples with dropdown selector and editor population

### Modified Capabilities

## Impact

- **Code**: Example data in `static/js/examples.js` or embedded in app.js, dropdown in HTML
- **UX**: Users can explore Flink SQL features without prior knowledge
