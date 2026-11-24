#!/usr/bin/env python3
"""Pull an agent's document out of its raw output and check its first line.

  extract.py <raw-file> <MARK> [--first REGEX] > <document.md>

Agents print their document between a line <<<MARK>>> and a line <<<END>>>. The raw file is
a `claude -p` transcript, a Copilot --share file or a `rex capture` of Bob's TUI, so the last
block must appear exactly once on lines of its own (prompts mention the markers only inline),
and TUI decoration is stripped: a leading "• ", box-drawing borders and trailing padding. Exit 2 when no block is found or the
first line does not match REGEX.
"""
import re, sys, textwrap

BORDER = re.compile(r"^(\s*)[│┃] ?")  # a box border before a line; its indentation is kept
TRAIL = re.compile(r"[\s│┃]*$")


def bare(line):  # a line as compared with a marker: no indentation, no leading bullet
    return line.strip().lstrip("•●⏺").strip()


def main(argv):
    if len(argv) < 3:
        sys.exit(__doc__)
    raw, mark = argv[1], argv[2]
    first = argv[argv.index("--first") + 1] if "--first" in argv else None
    lines = open(raw, encoding="utf-8", errors="replace").read().splitlines()
    # Copilot's --share file is markdown and escapes "<" and ">" as "\<" and "\>".
    clean = [TRAIL.sub("", BORDER.sub(r"\1", line)).replace("\\<", "<").replace("\\>", ">") for line in lines]
    starts = [i for i, line in enumerate(clean) if bare(line) == f"<<<{mark}>>>"]
    ends = [i for i, line in enumerate(clean) if bare(line) == "<<<END>>>"]
    # Exactly one block, on lines of its own. A document that quotes another marker block (a
    # CHANGES review quoting a PASS one) is malformed, not "the last block wins".
    if len(starts) != 1 or len(ends) != 1 or ends[0] < starts[0]:
        print(f"extract.py: want one <<<{mark}>>> ... <<<END>>> block in {raw}, found {len(starts)} start and {len(ends)} end lines", file=sys.stderr)
        sys.exit(2)
    start, end = starts[0] + 1, ends[0]
    # The TUI indents the whole answer; remove only that common indentation, so nested lists and
    # code blocks keep theirs.
    body = textwrap.dedent("\n".join(clean[start:end])).split("\n")
    while body and not body[0].strip():
        body.pop(0)
    if first and (not body or not re.match(first, body[0].strip())):
        print(f"extract.py: first line {body[0] if body else '(empty)'!r} does not match {first}", file=sys.stderr)
        sys.exit(2)
    sys.stdout.write("\n".join(body).rstrip() + "\n")


if __name__ == "__main__":
    main(sys.argv)
