## 1. CSS Styles for Filter Row

- [x] 1.1 Add CSS styles for the filter row in `style.css`: style the second `<tr>` in `<thead>` with compact `<input type="text">` elements that match the table header width, use a subtle background to distinguish from the header row, and ensure the filter row stays sticky with the header when scrolling
- [x] 1.2 Add CSS for the clear-all button: small "×" button in the filter row's first cell (op column), hidden by default, visible when filters are active via a `.filters-active` class

## 2. Filter Row Rendering

- [x] 2.1 In `renderResults()` in `app.js`, add a second `<tr>` inside `<thead>` after the header row containing one `<input type="text" placeholder="Filter...">` per column (including the "op" column). The first cell (op column) should also contain the clear-all "×" button before/after the input.

## 3. Filtering Logic

- [x] 3.1 Add an `applyFilters()` function in `app.js` that reads all filter input values, iterates `<tbody>` rows, and sets `style.display = 'none'` on rows where any column's cell text does not contain its filter value as a case-insensitive substring. Multiple active filters combine with AND logic. Attach this function to each filter input's `input` event.
- [x] 3.2 Implement the clear-all button click handler: clear all filter input values, call `applyFilters()` to restore all rows, and toggle the clear-all button visibility off

## 4. Metadata Update

- [x] 4.1 After each `applyFilters()` call, count visible `<tbody>` rows and update the `.results-meta` text. When any filter is active, display `"showing X of Y rows in Zms"`. When all filters are empty, revert to the original `"Y rows in Zms"` format. Also toggle the clear-all button visibility based on whether any filter is active.

## 5. Filters Reset on New Query

- [x] 5.1 Ensure `renderResults()` produces a fresh filter row with empty inputs each time it's called, so running a new query automatically clears any previous filter state (this should be inherent since `container.innerHTML = ''` rebuilds everything)

## 6. Manual Testing

- [x] 6.1 Verify end-to-end in the browser: run a query, type in column filters, confirm rows hide/show correctly, confirm metadata updates, confirm clear button works, confirm new query resets filters
