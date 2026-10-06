'use strict';
// Autocomplete helpers for browser tests. Text goes into an editor as one transaction, so no
// keystroke timing is involved, and labels are read only once completion has settled for that
// text. CodeMirror keeps the previous dialog on screen, disabled and unfiltered, while any
// source is pending; reading it then returns the list for an earlier cursor position.

const LABELS = '.cm-tooltip-autocomplete li .cm-completionLabel';

/**
 * Replaces the text of the `editor` ('query' or 'schema') and focuses it. The cursor goes to the
 * `|` in `text`, or to the end. `typed: true` marks the change as typing, which opens completion
 * the way a keystroke does; otherwise any open completion closes.
 */
async function setEditorText(page, editor, text, { typed = false } = {}) {
  const cursor = text.indexOf('|');
  const doc = cursor === -1 ? text : text.slice(0, cursor) + text.slice(cursor + 1);
  await page.evaluate(({ editor, doc, anchor, typed }) => {
    const { view } = editor === 'schema' ? schemaEditor : queryEditor;
    view.focus();
    // Clearing with a selection change closes any open completion, so no earlier result carries over.
    view.dispatch({ changes: { from: 0, to: view.state.doc.length }, selection: { anchor: 0 } });
    view.dispatch({ changes: { from: 0, insert: doc }, selection: { anchor },
      ...(typed ? { userEvent: 'input.type' } : {}) });
  }, { editor, doc, anchor: cursor === -1 ? doc.length : cursor, typed });
}

/** Waits until no completion source of the `editor` is pending and no stale dialog shows. */
async function waitForSettledCompletion(page, editor) {
  await page.waitForFunction((editor) => {
    const { view } = editor === 'schema' ? schemaEditor : queryEditor;
    return FlinkEditor.completionStatus(view.state) !== 'pending'
      && !document.querySelector('.cm-tooltip-autocomplete-disabled');
  }, editor);
}

/** Labels of the settled completion popup of the `editor`; [] when none is open. */
async function settledLabels(page, editor) {
  await waitForSettledCompletion(page, editor);
  return page.locator(LABELS).allInnerTexts();
}

/** Labels offered after `text` is typed into the `editor`, cursor at the end. */
async function suggestions(page, editor, text) {
  await setEditorText(page, editor, text, { typed: true });
  return settledLabels(page, editor);
}

/** Labels offered by Ctrl+Space at the `|` in `text`. */
async function explicitSuggestions(page, editor, text) {
  await setEditorText(page, editor, text);
  await page.keyboard.press('Control+Space');
  return settledLabels(page, editor);
}

module.exports = { setEditorText, waitForSettledCompletion, settledLabels, suggestions, explicitSuggestions };
