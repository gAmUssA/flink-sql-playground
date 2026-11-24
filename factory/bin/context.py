#!/usr/bin/env python3
"""Put a round's review material in one folder, for reviewers that cannot run git (Bob).

  context.py <worktree> <out-dir> [base=origin/main]

Writes <out-dir>/change.diff (base...HEAD) and <out-dir>/files/<path, / as __> with the
branch version of every changed text file up to 2000 lines (whole files give a diff its
context; reviews of a bare diff over-report). Prints the @-references to paste in a prompt.
"""
import os, subprocess, sys


def git(worktree, *args, binary=False):
    out = subprocess.run(["git", "-C", worktree, *args], check=True, capture_output=True).stdout
    return out if binary else out.decode("utf-8", errors="replace")


def main(argv):
    if len(argv) < 3:
        sys.exit(__doc__)
    worktree, out = argv[1], argv[2]
    base = argv[3] if len(argv) > 3 else "origin/main"
    os.makedirs(os.path.join(out, "files"), exist_ok=True)
    with open(os.path.join(out, "change.diff"), "w") as f:
        f.write(git(worktree, "diff", f"{base}...HEAD"))
    refs = ["@change.diff"]
    for path in git(worktree, "diff", "--name-only", "--diff-filter=d", f"{base}...HEAD").splitlines():
        try:
            data = git(worktree, "show", f"HEAD:{path}", binary=True)
        except subprocess.CalledProcessError:
            continue
        if b"\0" in data or data.count(b"\n") > 2000:   # binary (images, fonts) or too long
            continue
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            continue
        name = path.replace("/", "__")
        with open(os.path.join(out, "files", name), "w") as f:
            f.write(text)
        refs.append(f"@files/{name}")
    print(" ".join(refs))


if __name__ == "__main__":
    main(sys.argv)
