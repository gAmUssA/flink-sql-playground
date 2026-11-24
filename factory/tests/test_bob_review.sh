#!/usr/bin/env bash
# bob-review against a stubbed `rex` that plays Bob's TUI (criteria 1 to 3). Run: factory/tests/test_bob_review.sh
set -u
here=$(cd "$(dirname "$0")" && pwd -P)
bob=$here/../bin/bob-review
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
ok()  { echo "ok   $1"; }
bad() { echo "FAIL $1"; fail=1; }
check() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }

mkdir -p "$tmp/stub" "$tmp/ws"
cat > "$tmp/stub/rex" <<'EOF'
#!/usr/bin/env bash
# Plays Bob. Env: SUBMIT_ON=n (the nth effective Enter submits; 0 = never), POPUP=1 (a dialog eats
# Enter until Escape), NOREVIEW=1 (Bob accepts the prompt and then says nothing).
S=$STATE
echo "$*" >> "$S/calls"
case $1 in
  run) echo '{"block_ids":["blk1"]}' ;;
  capture)
    echo "Ask Mode"
    [[ -e $S/popup ]] && echo "Press Esc to close"
    if [[ -e $S/submitted ]]; then
      [[ ${NOREVIEW:-} == 1 ]] || printf '<<<REVIEW>>>\nVERDICT: PASS\n<<<END>>>\n'
    else
      printf '❯ %s\n' "$(cat "$S/input" 2>/dev/null)"
    fi ;;
  send)
    [[ $4 == 3 ]] && exit 0     # rex send -b BLOCK TEXT
    printf '%s' "$4" > "$S/input"; cp "$S/input" "$S/sent"; [[ ${POPUP:-} == 1 ]] && : > "$S/popup"
    [[ ${DROP:-} == 1 ]] && rm -f "$S/input" ;;   # DROP=1: Bob's box was not ready, the text is lost
  send-key)
    case $4 in                  # rex send-key -b BLOCK KEY
      escape) rm -f "$S/popup" ;;
      enter)
        [[ -e $S/popup ]] && exit 0
        n=$(( $(cat "$S/enters" 2>/dev/null || echo 0) + 1 )); echo $n > "$S/enters"
        (( ${SUBMIT_ON:-1} > 0 && n >= ${SUBMIT_ON:-1} )) && : > "$S/submitted" ;;
    esac ;;
esac
exit 0
EOF
chmod +x "$tmp/stub/rex"
export PATH="$tmp/stub:$PATH" BOB_REVIEW_PAUSE=0

printf 'Read @spec.md and @build.md, then (see @diff.patch).\nMail a@b.com about /x/@types/node.\n<<<REVIEW>>> and <<<END>>> are the markers.\n' > "$tmp/prompt.txt"

scenario() {  # scenario <name> <env...>: runs bob-review, leaves rc, $STATE
  name=$1; shift
  export STATE=$tmp/$name; rm -rf "$STATE"; mkdir -p "$STATE"
  out=$tmp/$name.out
  rc=0; env "$@" "$bob" "$tmp/ws" "$tmp/prompt.txt" "$out" "label" 20 >/dev/null 2>"$tmp/$name.err" || rc=$?
}
enters() { cat "$STATE/enters" 2>/dev/null || echo 0; }

scenario plain SUBMIT_ON=1
check "criterion 3: a review on screen exits 0 and saves it" "(( rc == 0 )) && grep -q '<<<REVIEW>>>' \"\$out\" && grep -q '<<<END>>>' \"\$out\""
check "criterion 1: no word-initial @ is typed" "! grep -qE '(^|[ (])@' \"\$STATE/sent\""
check "criterion 1: other text is unchanged (email, @types path, markers, newlines to spaces)" \
  "[[ \$(cat \"\$STATE/sent\") == 'Read spec.md and build.md, then (see diff.patch). Mail a@b.com about /x/@types/node. <<<REVIEW>>> and <<<END>>> are the markers. ' ]]"
check "criterion 2: one Enter when the first one works" "[[ \$(enters) == 1 ]]"

scenario retry SUBMIT_ON=3
check "criterion 2: presses Enter again until the box is empty (3 presses)" "(( rc == 0 )) && [[ \$(enters) == 3 ]]"

scenario popup SUBMIT_ON=1 POPUP=1
check "criterion 2: a popup is dismissed with Escape before Enter" "(( rc == 0 )) && grep -q 'send-key -b blk1 escape' \"\$STATE/calls\""

scenario never SUBMIT_ON=0
check "criterion 2: exits 5 after four Enter presses" "(( rc == 5 )) && [[ \$(enters) == 4 ]]"
check "criterion 2: saves the capture to <raw-out>" "grep -q 'Ask Mode' \"\$out\""
check "criterion 2: quits Bob (ctrl+c twice)" "[[ \$(grep -c 'send-key -b blk1 ctrl+c' \"\$STATE/calls\") == 2 ]]"
check "criterion 2: says why on stderr" "grep -q 'never accepted' \"\$tmp/never.err\""

scenario dropped SUBMIT_ON=1 DROP=1
check "criterion 2: typed text that never shows exits 5 without any Enter" "(( rc == 5 )) && [[ \$(enters) == 0 ]]"

scenario timeout SUBMIT_ON=1 NOREVIEW=1
check "criterion 3: a submitted prompt with no review times out with 4" "(( rc == 4 ))"

exit $fail
