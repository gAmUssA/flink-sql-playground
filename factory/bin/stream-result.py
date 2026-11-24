#!/usr/bin/env python3
"""Prints the answer of a Claude stream-json run: the text of its final result event.

  stream-result.py <file.jsonl> > answer.out

Exit 2, with a reason on stderr, when there is no result event, when the run reports an error, or
when the answer is empty. A stream that stops in the middle (a killed agent) is no answer.
"""
import json
import sys


def main(argv):
    if len(argv) != 2:
        sys.exit(__doc__)
    result = None
    with open(argv[1], encoding="utf-8", errors="replace") as stream:
        for line in stream:
            try:
                event = json.loads(line)
            except ValueError:
                continue
            if isinstance(event, dict) and event.get("type") == "result":
                result = event
    if result is None:
        print("stream-result: no result event in %s (the agent stopped early)" % argv[1], file=sys.stderr)
        sys.exit(2)
    if result.get("is_error"):
        print("stream-result: the run ended with an error: %s" % str(result.get("result", ""))[:300], file=sys.stderr)
        sys.exit(2)
    text = result.get("result")
    if not isinstance(text, str) or not text.strip():
        print("stream-result: the result event has no text", file=sys.stderr)
        sys.exit(2)
    sys.stdout.write(text if text.endswith("\n") else text + "\n")


if __name__ == "__main__":
    main(sys.argv)
