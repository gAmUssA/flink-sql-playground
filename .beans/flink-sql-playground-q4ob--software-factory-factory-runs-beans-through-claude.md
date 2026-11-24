---
# flink-sql-playground-q4ob
title: 'Software factory: /factory runs beans through Claude build and Copilot/Bob review'
status: in-progress
type: feature
priority: normal
created_at: 2026-11-24T00:27:56Z
updated_at: 2026-11-24T00:27:56Z
---

One skill, `/factory`, run by a Claude Code session in Rex: it takes a bean through spec → build → review → approve → PR → CI → merge, and replaces the user-level `bean-to-pr` skill. Claude writes the spec and the code; Copilot and Bob only review, alternating the four review roles per round. Every agent runs in its own Rex block. `factory/board.json` is the state, `factory/dashboard.html` shows it.

Decisions (Vik, 2026-11-24):
- Reviewers alternate per round: odd rounds Copilot does code + security and Bob does ux + ui; even rounds swap.
- APPROVE opens a PR, waits for green CI and merges (which deploys). Red CI, or a diff touching deploy/CI/deps/migrations/security/the factory itself, becomes ESCALATE (needs-human).
- The backlog is beans: `/factory next` takes the highest-priority todo bean.
- Spec-writer, builder and approver are `claude -p` sessions in Rex blocks; the builder is resumed per round with `--resume`.

- [x] .claude/skills/factory/SKILL.md (orchestrator) + references for the runners
- [x] factory/agents/: spec-writer, builder, 4 reviewers, approver
- [x] factory/dashboard.html polling board.json; factory/README.md with the loop
- [x] .gitignore: track .claude/skills/, keep the rest of .claude ignored; ignore factory runtime state
- [x] Smoke-check every runner command with a trivial prompt
- [ ] Remove ~/.claude/skills/bean-to-pr once /factory is on main

## Smoke test (2026-11-24, throwaway job smoke-akvl, not pushed)

- `claude -p` in a Rex block with `--session-id`, then `--resume`: the resumed session remembered round 1. Prompts go on stdin: claude's variadic tool flags swallow a trailing prompt.
- `claude-sub` (subscription only): without it, Rex blocks inherit this machine's API-key/Bedrock variables and claude bills those.
- spec-writer on bean akvl: a full spec with 9 testable criteria, saved through `extract.py`.
- review-code r1 (Copilot) and review-ux r1 (Bob) in parallel on a one-line commit: Bob PASS (nothing user-visible), Copilot CHANGES (the commit does not implement the spec, which is right). Copilot's `--share` file escapes `<` as `\<`; `extract.py` unescapes it.
- Dashboard on static-web-server :8799: cards, round chips, file dialog; no horizontal scroll at 1400 px dark or 390 px light.
- Not exercised yet: a full builder round with its tool allow-list, the approver, PR/CI/merge. The first real job will.

## Copilot review of the factory (2026-11-24)

12 findings, all fixed in the second commit: `node`/`npx`/`npm` and `VAR=… anything` prefixes off every allow-list; one marker block exactly (a quoted PASS inside a CHANGES review no longer wins); strict verdict lines; renames and the factory, AGENTS.md, .claude and .gitignore count as needs-human paths, and that check now answers CLEAN or fails loudly; job ids validated and every path `%q`-quoted in generated scripts; `claude-sub` checks `claude auth status` (authMethod claude.ai, first-party, no API-key source) before it runs; rework notes land where the builder reads; CHANGES after round 3 opens a PR and goes to needs-human; dashboard escapes round numbers and can't stall on a stray `#` line; board.py locks; table pipes survive extraction.
