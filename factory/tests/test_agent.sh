#!/usr/bin/env bash
# agent: cwd independence (criterion 7) and close-blocks (criteria 9, 10), in a temp git repo and
# worktree with a stubbed `rex` on PATH. Run: factory/tests/test_agent.sh
set -u
here=$(cd "$(dirname "$0")" && pwd -P)
src=$(cd "$here/.." && pwd -P)
tmp=$(mktemp -d); tmp=$(cd "$tmp" && pwd -P)
trap 'rm -rf "$tmp"' EXIT
fail=0
ok()  { echo "ok   $1"; }
bad() { echo "FAIL $1"; fail=1; }
check() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }

# --- a repo that holds a copy of factory/, an origin/main ref and a worktree for job "tj"
repo=$tmp/repo
git init -q "$repo" && cd "$repo" || exit 1
git config user.email t@example.com; git config user.name t
mkdir -p factory && cp -R "$src/bin" "$src/agents" factory/
echo base > README.md
git add -A && git commit -qm base
git update-ref refs/remotes/origin/main HEAD
git worktree add -q .claude/worktrees/tj -b factory/tj
echo '{}' > .claude/worktrees/tj/Dockerfile
git -C .claude/worktrees/tj add -A && git -C .claude/worktrees/tj commit -qm "touch Dockerfile"
wt=$repo/.claude/worktrees/tj

# --- stub rex: logs every call; "block close" fails for ids that end in -gone
mkdir -p "$tmp/stub"
cat > "$tmp/stub/rex" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$REX_LOG"
if [[ $1 == block && $2 == close ]]; then [[ $3 == *-gone ]] && exit 1; fi
exit 0
EOF
chmod +x "$tmp/stub/rex"
export PATH="$tmp/stub:$PATH" REX_LOG="$tmp/rex.log"

# --- criterion 7: same output from everywhere, REPO is the main checkout
outs=()
for bin in "$repo/factory/bin/agent" "$wt/factory/bin/agent"; do
  for cwd in "$repo" "$repo/factory" "$wt" "$wt/factory" /; do
    a=$(cd "$cwd" && "$bin" tj reviewers 1 2>&1; echo "rc=$?")
    b=$(cd "$cwd" && "$bin" tj needs-human-paths 2>&1; echo "rc=$?")
    outs+=("$a|$b")
  done
done
first=${outs[0]}
same=1; for o in "${outs[@]}"; do [[ $o == "$first" ]] || { same=0; echo "  differs: $o"; }; done
check "agent gives the same output from repo, factory/, worktree and / (${#outs[@]} calls)" "(( same ))"
check "reviewers 1 is code=copilot security=copilot ux=bob ui=bob" "[[ \$first == *'code=copilot security=copilot ux=bob ui=bob'*'rc=0'* ]]"
check "needs-human-paths lists Dockerfile and exits 10" "[[ \$first == *Dockerfile*'rc=10'* ]]"
cd "$tmp/repo/factory" && rel=$(bin/agent tj reviewers 2 2>&1)
check "agent works with a relative \$0 (bin/agent from factory/)" "[[ \$rel == 'code=bob security=bob ux=copilot ui=copilot' ]]"

# --- close-blocks
agent=$repo/factory/bin/agent
board() { python3 "$repo/factory/bin/board.py" "$@" >/dev/null; }
mkdir -p "$repo/factory/jobs/tj/.run" "$repo/factory/jobs/tj/.raw"
echo block:aaa      > "$repo/factory/jobs/tj/.run/spec.zsh.block"
echo block:bbb-gone > "$repo/factory/jobs/tj/.run/build-1.zsh.block"
echo block:ccc      > "$repo/factory/jobs/tj/.raw/review-ux-1.txt.block"
mkdir -p "$repo/factory/jobs/other/.run"
echo block:zzz      > "$repo/factory/jobs/other/.run/spec.zsh.block"
board init tj bean=x stage=build

: > "$REX_LOG"
out=$("$agent" tj close-blocks 2>&1); rc=$?
check "close-blocks refuses while the stage is build (rc=$rc)" "(( rc != 0 )) && [[ \$out == *build* ]] && [[ ! -s \$REX_LOG ]]"
for st in review approve pr; do
  board set tj stage=$st; : > "$REX_LOG"
  "$agent" tj close-blocks >/dev/null 2>&1; rc=$?
  check "close-blocks refuses at stage $st" "(( rc != 0 )) && [[ ! -s \$REX_LOG ]]"
done
: > "$REX_LOG"; "$agent" nojob close-blocks >/dev/null 2>&1; rc=$?
check "close-blocks refuses an unknown job" "(( rc != 0 )) && [[ ! -s \$REX_LOG ]]"

for st in merged needs-human; do
  board set tj stage=$st; : > "$REX_LOG"; before=$(cat "$repo/factory/board.json")
  "$agent" tj close-blocks >/dev/null 2>&1; rc=$?
  check "close-blocks exits 0 at stage $st, though one block is already gone" "(( rc == 0 ))"
  check "  it closed all three of the job's blocks" "[[ \$(grep -c '^block close' \"\$REX_LOG\") == 3 ]] && grep -q 'block:aaa' \"\$REX_LOG\" && grep -q 'block:bbb-gone' \"\$REX_LOG\" && grep -q 'block:ccc' \"\$REX_LOG\""
  check "  it left the other job's block alone" "! grep -q zzz \"\$REX_LOG\""
  check "  it did not touch board.json" "[[ \$(cat \"\$repo/factory/board.json\") == \"\$before\" ]]"
done

exit $fail
