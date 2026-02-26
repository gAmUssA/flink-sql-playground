## Context

The blueprint specifies 5-8 curated examples covering key Flink SQL features. Examples need to use the `datagen` connector with bounded sources so they complete in seconds. Each example teaches a different concept.

## Goals / Non-Goals

**Goals:**
- 6 curated examples demonstrating progressively complex Flink SQL features
- Each example has a title, schema DDL, and query SQL
- Dropdown selector in the UI that populates editors on selection
- Examples use datagen connector with sequence fields for bounded execution

**Non-Goals:**
- User-created examples or favorites
- Example categories or search
- Explanation text beyond the title (examples should be self-documenting via SQL comments)

## Decisions

### 1. Examples as a JavaScript array
**Choice**: Define examples in `static/js/examples.js` as an array of `{title, schema, query, mode}` objects.
**Rationale**: Simple, no API call needed. Fast to load. Easy to add/modify.

### 2. Six example topics
**Choice**:
1. Simple aggregation (COUNT, SUM, GROUP BY)
2. Tumbling window (TUMBLE TVF)
3. Hopping window (HOP TVF)
4. Cumulate window (CUMULATE TVF)
5. Temporal join (two datagen tables)
6. Batch vs streaming comparison (same query, different modes)

**Rationale**: Covers the core Flink SQL features progressively. Blueprint's datagen patterns provide the template.

### 3. Default example on load
**Choice**: Load example #1 (simple aggregation) by default when no fiddle short code is in the URL.
**Rationale**: Better first experience than empty editors. User sees a working example immediately.

## Risks / Trade-offs

- **[Examples may break with Flink version changes]** → Pin to Flink 2.2.x SQL syntax. Document in comments.
