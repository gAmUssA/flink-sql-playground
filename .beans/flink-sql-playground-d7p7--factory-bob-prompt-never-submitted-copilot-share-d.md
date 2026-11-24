---
# flink-sql-playground-d7p7
title: 'Factory: Bob prompt never submitted, Copilot --share duplicate answer, agent runs only from factory/'
status: completed
type: bug
priority: high
created_at: 2026-11-24T10:12:47Z
updated_at: 2026-11-24T16:05:17Z
---

Found running akvl-drop-missing-400 on 2026-11-24.

- [x] `factory/bin/bob-review`: the prompt had @file references; Bob's TUI opened a file picker and the popup swallowed Enter, so the prompt sat unsent for 20 minutes. Fix (already tried locally, uncommitted in the main checkout): strip the @, press Enter until the input box no longer holds the prompt, dismiss a stray dialog with Escape, exit 5 after four tries.
- [x] `factory/bin/extract.py`: Copilot's --share file can print its final answer twice. Accept identical copies. Round 3 of the same job printed two differing PASS blocks; decide whether to take the last block for Copilot files only.
- [x] `factory/bin/agent`: it resolves REPO from the caller's cwd (`git rev-parse --git-common-dir` returns a relative path), so it fails unless called from inside `factory/`. Make it cwd-independent.
- [ ] ~~Report agent state to Rex over OSC 7501~~ moved to a follow-up bean (launch without wrapper scripts, Rex process state).
- [x] Close the job's Rex blocks when a job ends (merged or needs-human): `agent` records block ids in `.run/*.block`; add a `close-blocks <job>` subcommand and use it from the skill's clean-up. Never close a block of a running job.
- [x] A local patch of the first two fixes is at factory/jobs/d7p7-factory-agent-fixes/local-fixes.patch (diff of the main checkout's uncommitted edits). Apply or redo it; once merged, the orchestrator discards the uncommitted edits in the main checkout.

## Resolution

Fixed in this PR: Bob submit (strip @, Enter loop, exit 5), extract.py duplicates (identical copies; --last for Copilot only), cwd-independent agent, close-blocks, SKILL.md step 7, tests under factory/tests (run by hand: bash factory/tests/run.sh). OSC 7501 dropped; see the follow-up bean.
