#!/usr/bin/env python3
"""Shows a Claude stream-json file as readable lines while the agent writes it.

  stream-view.py <file.jsonl>

Runs in a split pane next to the agent's block. Waits for the file, follows it, prints one line per
tool call, tool result, message and the final result, and exits after the result event. The agent's
block is closed by `agent` when the run ends, so a run that dies without a result just leaves this
pane to be closed from outside.
"""
import json
import os
import sys
import time

LIMIT = 160


def short(value):
    text = " ".join(str(value).split())
    return text if len(text) <= LIMIT else text[:LIMIT - 1] + "…"


def describe(event):
    """Lines for one event; the second value is True once the run is over."""
    kind = event.get("type")
    lines = []
    if kind == "assistant":
        for part in event.get("message", {}).get("content", []):
            if part.get("type") == "tool_use":
                args = part.get("input", {})
                detail = args.get("command") or args.get("file_path") or args.get("pattern") or args.get("path") or ""
                lines.append("▸ %s %s" % (part.get("name", "tool"), short(detail)))
            elif part.get("type") == "text" and part.get("text", "").strip():
                lines.append("· " + short(part["text"]))
    elif kind == "user":
        content = event.get("message", {}).get("content", [])
        for part in content if isinstance(content, list) else []:
            if part.get("type") == "tool_result" and part.get("is_error"):
                lines.append("  ✗ " + short(part.get("content", "")))
    elif kind == "result":
        state = "failed" if event.get("is_error") else "done"
        lines.append("■ %s, %s turns, $%.2f" % (state, event.get("num_turns", "?"), event.get("total_cost_usd") or 0))
        return lines, True
    return lines, False


def main(argv):
    if len(argv) != 2:
        sys.exit(__doc__)
    path = argv[1]
    while not os.path.exists(path):
        time.sleep(0.3)
    with open(path, encoding="utf-8", errors="replace") as stream:
        pending = ""
        while True:
            chunk = stream.readline()
            if not chunk:
                time.sleep(0.3)
                continue
            pending += chunk
            if not pending.endswith("\n"):
                continue
            line, pending = pending.strip(), ""
            if not line:
                continue
            try:
                event = json.loads(line)
            except ValueError:
                continue
            lines, finished = describe(event)
            for text in lines:
                print(text, flush=True)
            if finished:
                return


if __name__ == "__main__":
    main(sys.argv)
