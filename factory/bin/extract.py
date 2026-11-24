#!/usr/bin/env python3
"""Pull an agent's document out of its raw output and check its first line.

  extract.py <raw-file> <MARK> [--first REGEX] > <document.md>

Agents print their document between a line <<<MARK>>> and a line <<<END>>>. The raw file is
a `claude -p` transcript, a Copilot --share file or a `rex capture` of Bob's TUI, so the last
such block wins (the prompt itself may quote the markers) and TUI decoration is stripped:
a leading "• ", box-drawing borders and trailing padding. Exit 2 when no block is found or the
first line does not match REGEX.
"""
import re, sys

BORDER = re.compile(r"^[\s│┃|•●⏺>]*")  # what Bob's and Copilot's TUIs put before a line
TRAIL = re.compile(r"[\s│┃|]*$")


def main(argv):
    if len(argv) < 3:
        sys.exit(__doc__)
    raw, mark = argv[1], argv[2]
    first = argv[argv.index("--first") + 1] if "--first" in argv else None
    lines = open(raw, encoding="utf-8", errors="replace").read().splitlines()
    # Copilot's --share file is markdown and escapes "<" and ">" as "\<" and "\>".
    clean = [TRAIL.sub("", BORDER.sub("", line)).replace("\\<", "<").replace("\\>", ">") for line in lines]
    starts = [i for i, line in enumerate(clean) if line.strip() == f"<<<{mark}>>>"]
    if not starts:
        print(f"extract.py: no <<<{mark}>>> line in {raw}", file=sys.stderr)
        sys.exit(2)
    start = starts[-1] + 1
    end = next((i for i in range(start, len(clean)) if clean[i].strip() == "<<<END>>>"), None)
    if end is None:
        print(f"extract.py: <<<{mark}>>> has no <<<END>>> in {raw}", file=sys.stderr)
        sys.exit(2)
    body = clean[start:end]
    while body and not body[0].strip():
        body.pop(0)
    if first and (not body or not re.match(first, body[0].strip())):
        print(f"extract.py: first line {body[0] if body else '(empty)'!r} does not match {first}", file=sys.stderr)
        sys.exit(2)
    sys.stdout.write("\n".join(body).rstrip() + "\n")


if __name__ == "__main__":
    main(sys.argv)
