---
# flink-sql-playground-eu20
title: 'Claude agents: live view of what the agent does in the Rex pane'
status: in-progress
type: task
priority: normal
created_at: 2026-11-24T23:01:34Z
updated_at: 2026-11-24T23:01:34Z
---

Since the direct launch (#93) a Claude pane is quiet: its answer goes to a file, and in -p text mode claude prints only at the end. Run claude with --output-format stream-json --verbose into .raw/<name>.jsonl, show it live in a split pane (bin/stream-view.py), and write the answer from the result event (bin/stream-result.py).

- [x] stream-json into .raw/<name>.jsonl, process still exec-tracked
- [x] split pane with readable lines, closed when the run ends
- [x] answer from the result event; no result is exit 2
- [x] tests (stream scripts, stubbed rex), real run checked
