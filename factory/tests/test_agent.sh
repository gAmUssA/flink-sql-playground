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
case $1 in
  whoami)  n=$(cat "$REX_STATE/whoami" 2>/dev/null || echo 0); echo $((n+1)) > "$REX_STATE/whoami"
           echo "{\"instance_id\":\"inst-$([[ ${REX_RESTART:-} == 1 && $n -ge 1 ]] && echo 2 || echo 1)\"}" ;;
  run)     echo '{"block_ids":["block:run1"]}' ;;
  wait)    exit ${REX_WAIT_RC:-0} ;;
  capture) [[ ${REX_EMPTY_CAPTURE:-} == 1 ]] || echo "pane text of $3 $4" ;;
  block)   if [[ $2 == call ]]; then
             case $5 in
               block:running) echo '{"last_exit":null,"child":{"pid":1,"name":"claude"}}' ;;
               block:ok)      echo '{"last_exit":{"exit_code":0}}' ;;
               block:bad)     echo '{"last_exit":{"exit_code":7,"error":"exit status 7"}}' ;;
               *)             exit 1 ;;
             esac
           fi ;;
esac
exit 0
EOF
chmod +x "$tmp/stub/rex"
mkdir -p "$tmp/rexstate"
export PATH="$tmp/stub:$PATH" REX_LOG="$tmp/rex.log" REX_STATE="$tmp/rexstate"

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

# --- run-agent: the agent itself runs, stdin and stdout come from files, no shell re-parses arguments
printf 'prompt line\n' > "$tmp/in.txt"
"$repo/factory/bin/run-agent" "$tmp/in.txt" "$tmp/out.txt" /bin/sh -c 'cat; printf "%s|" "$@"' x "a b" "it's" '$HOME "q"'
printf 'prompt line\na b|it'"'"'s|$HOME "q"|' > "$tmp/expect.txt"
check "run-agent: stdin from the file, stdout to the file, arguments intact" "cmp -s \"\$tmp/out.txt\" \"\$tmp/expect.txt\""
"$repo/factory/bin/run-agent" - - /bin/sh -c 'exit 4'; rc=$?
check "run-agent: the agent's exit status is the script's (4)" "(( rc == 4 ))"

# --- launch: a spec run goes straight to Rex with --shell=none, no zsh, no tee
board set tj stage=build
J=$repo/factory/jobs/tj; rm -f "$J"/capture-*.txt "$J"/.run/*.block
: > "$REX_LOG"; rm -f "$REX_STATE/whoami"
"$agent" tj spec >/dev/null 2>&1
runline=$(tr '\n' ' ' < "$REX_LOG")   # the system prompt argument spans lines
check "launch: rex run --shell=none in the job worktree" "[[ \$runline == *'--shell=none'*'--cwd $wt'* ]]"
check "launch: no zsh and no tee in the command" "[[ \$runline != *zsh* && \$runline != *tee* ]]"
check "launch: claude-sub runs behind run-agent with the denied tools" "[[ \$runline == *'bin/run-agent'*'bin/claude-sub'*'--disallowedTools'*'Bash(node:*)'* ]]"
check "launch: the pane text is kept in capture-spec.txt" "grep -q 'pane text' \"\$J/capture-spec.txt\""
check "launch: the block id is recorded" "[[ \$(cat \"\$J/.run/spec.block\") == block:run1 ]]"

: > "$REX_LOG"; rm -f "$REX_STATE/whoami"
REX_WAIT_RC=3 "$agent" tj spec >/dev/null 2>&1; rc=$?
check "launch: the agent's exit status 3 is the stage's (rc=$rc)" "(( rc == 3 ))"

rm -f "$REX_STATE/whoami"; : > "$REX_LOG"
REX_RESTART=1 "$agent" tj spec >/dev/null 2>&1; rc=$?
check "launch: a Rex restart during the run is lost, exit 70 (rc=$rc)" "(( rc == 70 ))"

# --- Copilot launches directly too; a missing copilot binary fails clearly
mkdir -p "$tmp/cop" && printf '#!/bin/sh\n' > "$tmp/cop/copilot" && chmod +x "$tmp/cop/copilot"
mkdir -p "$repo/factory/jobs/tj/round-1"; echo spec > "$J/spec.md"; echo build > "$J/build.md"
: > "$REX_LOG"; rm -f "$REX_STATE/whoami"
PATH="$tmp/cop:$PATH" "$agent" tj review-code 1 >/dev/null 2>&1
cl=$(tr '\n' ' ' < "$REX_LOG")
check "copilot: rex run --shell=none with the absolute copilot path, no zsh" "[[ \$cl == *'--shell=none'*'--cwd $wt'*\"$tmp/cop/copilot -p\"*'--share'* && \$cl != *zsh* ]]"
: > "$REX_LOG"
out=$(PATH="/usr/bin:/bin:$tmp/stub" "$agent" tj review-code 1 2>&1); rc=$?
check "copilot: not on PATH is an error and starts nothing (rc=$rc)" "(( rc != 0 )) && [[ \$out == *'copilot is not on PATH'* ]] && ! grep -q '^run ' \"\$REX_LOG\""

# --- state: running, exited, failed, closed, lost
rm -f "$J"/.run/*.block "$J"/.run/*.instance "$J"/capture-*.txt
echo block:running > "$J/.run/a.block"; echo block:ok > "$J/.run/b.block"; echo block:bad > "$J/.run/c.block"
echo block:gone > "$J/.run/d.block"; echo block:gone2 > "$J/.run/e.block"; echo 'saved text' > "$J/capture-d.txt"
st=$("$agent" tj state 2>&1)
check "state: running" "grep -qx 'a running' <<<\"\$st\""
check "state: exited 0" "grep -qx 'b exited 0' <<<\"\$st\""
check "state: failed with the code" "grep -qx 'c failed 7' <<<\"\$st\""
check "state: a closed block with a capture answers offline" "grep -q '^d closed' <<<\"\$st\""
check "state: a block that is gone and has no capture is lost" "grep -qx 'e lost' <<<\"\$st\""
echo inst-9 > "$J/.run/a.instance"
check "state: another Rex instance than the launch's is lost" "\"\$agent\" tj state | grep -q '^a lost'"

# state also lists Bob's blocks (.raw/*.txt.block)
echo block:ok > "$J/.raw/review-ux-1.txt.block"
check "state: a Bob block under .raw is listed" "\"\$agent\" tj state | grep -qx 'review-ux-1 exited 0'"
rm -f "$J/.raw/review-ux-1.txt.block"

# --- an already-gone block must not blank a saved capture
rm -f "$J"/.run/* "$J"/capture-*.txt; echo block:gone > "$J/.run/g.block"; echo 'earlier text' > "$J/capture-g.txt"; board set tj stage=needs-human
REX_EMPTY_CAPTURE=1 "$agent" tj close-blocks >/dev/null 2>&1
check "close-blocks: an empty capture keeps the earlier text" "[[ \$(cat \"\$J/capture-g.txt\") == 'earlier text' ]]"

# --- a Rex restart: the pane is a fresh shell, so close-blocks must not overwrite the saved capture
rm -f "$J"/.run/* "$J"/capture-*.txt; echo block:r > "$J/.run/r.block"; echo inst-OLD > "$J/.run/r.instance"; echo 'agent output' > "$J/capture-r.txt"; board set tj stage=needs-human
"$agent" tj close-blocks >/dev/null 2>&1
check "close-blocks: after a Rex restart the saved capture stays" "[[ \$(cat \"\$J/capture-r.txt\") == 'agent output' ]] && grep -q 'block close block:r' \"\$REX_LOG\""

# --- an exited-0 Claude run with an empty answer file is flagged
rm -f "$J"/.run/* "$J"/.raw/*.out; echo block:ok > "$J/.run/spec.block"; : > "$J/.raw/spec.out"
check "state: exited 0 with an empty answer says so" "\"\$agent\" tj state | grep -qx 'spec exited 0 (empty output)'"
echo text > "$J/.raw/spec.out"
check "state: exited 0 with an answer is plain" "\"\$agent\" tj state | grep -qx 'spec exited 0'"
rm -f "$J/.raw/spec.out" "$J/.run/spec.block"

# --- close-blocks keeps the pane text before it closes
rm -f "$J"/.run/* "$J"/capture-*.txt; echo block:cap > "$J/.run/z.block"; board set tj stage=needs-human; : > "$REX_LOG"
"$agent" tj close-blocks >/dev/null 2>&1
check "close-blocks: capture-z.txt exists and the capture came before the close" "[[ -s \"\$J/capture-z.txt\" ]] && [[ \$(grep -n '^capture' \"\$REX_LOG\" | head -1 | cut -d: -f1) -lt \$(grep -n '^block close' \"\$REX_LOG\" | head -1 | cut -d: -f1) ]]"

exit $fail
