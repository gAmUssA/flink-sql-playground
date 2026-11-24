#!/usr/bin/env python3
"""Pull an agent's document out of its raw output and check its first line.

  extract.py <raw-file> <MARK> [--first REGEX] [--last] > <document.md>

Agents print their document between a line <<<MARK>>> and a line <<<END>>>. The raw file is
a `claude -p` transcript, a Copilot --share file or a `rex capture` of Bob's TUI, so the block
must appear on lines of its own (prompts mention the markers only inline), and TUI decoration
is stripped: a leading "• ", box-drawing borders and trailing padding.

One block is the answer. The same block twice with identical bodies is one answer too. Two
different blocks are malformed, unless --last is given (agent passes it for Copilot --share
files only): then the last block wins. --first is checked on the chosen block.

Exit 2 when there is no block, a start without an end, an end before a start, differing blocks
without --last, or the first line does not match REGEX.
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
    last = "--last" in argv
    lines = open(raw, encoding="utf-8", errors="replace").read().splitlines()
    # Copilot's --share file is markdown and escapes "<" and ">" as "\<" and "\>".
    clean = [TRAIL.sub("", BORDER.sub(r"\1", line)).replace("\\<", "<").replace("\\>", ">") for line in lines]
    starts = [i for i, line in enumerate(clean) if bare(line) == f"<<<{mark}>>>"]
    ends = [i for i, line in enumerate(clean) if bare(line) == "<<<END>>>"]
    # Blocks must pair up in order: start, end, start, end. Anything else (no block, a start
    # without an end, an end before its start) is malformed.
    events = sorted([(i, "S") for i in starts] + [(i, "E") for i in ends])
    kinds = "".join(k for _, k in events)
    if not kinds or kinds != "SE" * (len(kinds) // 2):
        print(f"extract.py: want <<<{mark}>>> ... <<<END>>> blocks in {raw}, found {len(starts)} start and {len(ends)} end lines in order {kinds or '(none)'}", file=sys.stderr)
        sys.exit(2)
    blocks = list(zip(starts, ends))
    bodies = ["\n".join(clean[s + 1:e]).strip() for s, e in blocks]
    # One block is the normal case. The same block twice, word for word, is one answer: Copilot's
    # --share file can print its final answer twice. Differing blocks stay malformed (a CHANGES
    # review quoting a PASS one is not "last wins"), except with --last, which agent passes for
    # Copilot --share files only (ADR 0010): there the last block is the answer.
    if len(blocks) > 1 and len(set(bodies)) > 1 and not last:
        print(f"extract.py: {len(blocks)} different <<<{mark}>>> blocks in {raw}; want one", file=sys.stderr)
        sys.exit(2)
    start, end = blocks[-1][0] + 1, blocks[-1][1]
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
