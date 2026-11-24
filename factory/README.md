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
