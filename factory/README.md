# The factory

A small, visible software factory for this repo. One Claude Code session runs `/factory` and
becomes the **orchestrator**: it takes a bean through the loop below, starts every agent in its
own Rex block, and is the only writer of `board.json`. **Claude writes the spec and the code;
GitHub Copilot and IBM Bob only review.**

```
                   ┌──────────────────┐
                   │       bean       │   /factory next · /factory <bean-id> · /factory <feature>
                   └─────────┬────────┘
                             ▼
                   ┌──────────────────┐
                   │   spec-writer    │
                   │      Claude      │
                   └─────────┬────────┘
                             ▼
                   ┌──────────────────┐
                   │     builder      │◄────────────────────┐
                   │      Claude      │                     │
                   └─────────┬────────┘                     │
        ┌─────────────┬──────┴──────┬─────────────┐         │
        ▼             ▼             ▼             ▼         │
  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐   │
  │  security │ │     ux    │ │ ui design │ │    code   │   │
  │  odd: Cop │ │  odd: Bob │ │  odd: Bob │ │  odd: Cop │   │
  │ even: Bob │ │ even: Cop │ │ even: Cop │ │ even: Bob │   │
  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └─────┬─────┘   │
        └─────────────┴──────┬──────┴─────────────┘         │
                             ▼                              │
                   ┌──────────────────┐   any CHANGES:      │
                   │   WAIT FOR ALL   ├─────────────────────┘
                   │   4 reviews in   │   resume builder
                   └─────────┬────────┘   (max 2 reworks)
                             ▼ all PASS
                   ┌──────────────────┐
                   │     approver     │
                   │      Claude      │
                   └─┬───────────────┬┘
             APPROVE │               │ ESCALATE, red CI, or a risky path
                     ▼               ▼
          ┌────────────────────┐ ┌─────────────┐
          │ PR → CI → merge →  │ │ needs-human │ ◄── /factory approve <job>
          │ deploy check       │ │   (PR open) │ ◄── /factory rework <job> <note>
          └────────────────────┘ └─────────────┘
```

Merging to `main` deploys to production, so an APPROVE merges only after green CI, and a diff
that touches deploy, CI, dependencies, migrations, the SQL guard, embed framing or the factory
itself always waits for a human.

## Files

```
.claude/skills/factory/SKILL.md   the orchestrator's instructions (/factory)
factory/
  agents/                         one file per agent: what it reads, does and writes
    spec-writer.md  builder.md  review-security.md  review-ux.md  review-ui.md  review-code.md  approver.md
  bin/
    agent        runs one agent for one job in a Rex block and saves its file;
                 `agent <job> close-blocks` closes the job's blocks once it is merged or needs-human
    claude-sub   runs claude on the claude.ai subscription only
    bob-review   drives Bob's chat TUI through Rex (Bob has no usable headless mode here)
    board.py     the only writer of board.json
    extract.py   pulls an agent's document out of its raw output
    context.py   a diff plus whole files, for reviewers that can't run git
  dashboard.html  the board, polls board.json every 3 s
  board.json      state (gitignored)
  jobs/<job>/     one folder per job (gitignored; the PR carries the record)
    spec.md  build.md  decision.md
    round-1/review-security.md  review-ux.md  review-ui.md  review-code.md
    round-2/…
```

Every agent owns one file. Read-only agents (the reviewers, spec-writer, approver) print their
document between markers and the orchestrator saves it. A review starts with `VERDICT: PASS` or
`VERDICT: CHANGES`; `decision.md` starts with `APPROVE` or `ESCALATE`.

## Watch it

```bash
brew install static-web-server
static-web-server -p 8799 -d factory --compression false   # http://localhost:8799/dashboard.html
```

Not 8790: the Playwright suite reuses a server on that port. Jobs move across the columns;
each review round is a row of chips (role · reviewer: C for Copilot, B for Bob) that turn green or
amber as verdicts land; needs-human cards are red. Click a card to read its files. Each agent's
Rex block is labelled `factory <job> <agent>` and stays open after it finishes, until
`agent <job> close-blocks`.

## Tests

`factory/tests/run.sh` runs the script tests (Python `unittest` for `extract.py`, bash with a stubbed
`rex` and `bob` for `agent` and `bob-review`). It is not part of `./gradlew build` or CI.

## Requirements

Rex, `beans`, `gh`, GitHub Copilot CLI, Bob 2.x logged in, and `claude` logged in to claude.ai
(`claude-sub` refuses to run on an API key, a gateway or Bedrock).

## How agents run in Rex (measured 2026-11-24, Rex 0.1.0-preview.21)

- **Direct launch.** Claude and Copilot run with `rex run --shell=none`, not through a generated zsh script.
  `bin/run-agent` `exec`s Claude with the prompt on stdin and the answer in `.raw/<name>.out` (no `tee`), so
  the pane's process is the agent. Claude's own stderr stays in the pane; its answer does not, so a Claude
  pane looks quiet while it works. Bob stays a keystroke-driven TUI (`bin/bob-review`).
- **What Rex knows.** `rex block call process` answers `last_exit: null` while the program runs, then
  `{exit_code, error}`; `rex wait` returns that exit code for a `--keep-open` block. With the old wrapper
  Rex tracked `zsh`, not the agent: the state was real but named the shell. `program_status` (OSC 7501) stayed
  empty for every block, because neither `claude -p` nor `copilot -p` reports a status. So there is nothing to
  wire up there; process state is the signal.
- **State.** `agent <job> state` prints `running`, `exited 0`, `failed N`, `closed` (the block is gone, the text
  is in `capture-<name>.txt`) or `lost`. A Rex restart kills every pane process, so each launch records the
  server `instance_id`; a different one on the next look is `lost`, and a stage that sees it exits 70.
- **Capture.** The pane's text is saved to `jobs/<job>/capture-<name>.txt` when a stage ends and again before
  `close-blocks` closes the block.
- **Claude stays on `claude -p` with `dontAsk`.** Nobody answers permission prompts in this factory; an interactive
  Claude would need someone to, so switching would break that rule. Revisit only with a way to keep it.
- Tests: `bash factory/tests/run.sh` (a stubbed `rex` plays the server; the real `claude` path was checked by
  running `agent <job> spec` for real).
