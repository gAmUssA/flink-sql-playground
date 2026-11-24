#!/usr/bin/env python3
"""Put a round's review material in one folder, for reviewers that cannot run git (Bob).

  context.py <worktree> <out-dir> [base=origin/main]

Writes <out-dir>/change.diff (base...HEAD) and <out-dir>/files/<path, / as __> with the
branch version of every changed text file up to 2000 lines (whole files give a diff its
context; reviews of a bare diff over-report). Prints the @-references to paste in a prompt.
"""
import os, subprocess, sys


def git(worktree, *args):
    return subprocess.run(["git", "-C", worktree, *args], check=True, capture_output=True, text=True).stdout


def main(argv):
    if len(argv) < 3:
        sys.exit(__doc__)
    worktree, out = argv[1], argv[2]
    base = argv[3] if len(argv) > 3 else "origin/main"
    os.makedirs(os.path.join(out, "files"), exist_ok=True)
    with open(os.path.join(out, "change.diff"), "w") as f:
        f.write(git(worktree, "diff", f"{base}...HEAD"))
    refs = ["@change.diff"]
    for path in git(worktree, "diff", "--name-only", "--diff-filter=d", f"{base}...HEAD").split():
        try:
            text = git(worktree, "show", f"HEAD:{path}")
        except subprocess.CalledProcessError:
            continue
        if "\0" in text or text.count("\n") > 2000:
            continue
        name = path.replace("/", "__")
        with open(os.path.join(out, "files", name), "w") as f:
            f.write(text)
        refs.append(f"@files/{name}")
    print(" ".join(refs))


if __name__ == "__main__":
    main(sys.argv)
