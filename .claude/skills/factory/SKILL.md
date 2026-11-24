---
name: factory
description: Run this repo's software factory - take a bean through spec, build, four-way adversarial review, approval, PR, CI, merge and deploy, with Claude writing and Copilot and Bob reviewing, each agent in its own Rex block. Use for /factory, "/factory next", "/factory <bean-id or feature>", "/factory approve <job>", "/factory rework <job> <note>", "/factory status", and whenever Vik asks to work on a bean, fix and deploy a bean, or get Copilot or Bob to review a change.
---

# /factory

The session that runs this skill is the **orchestrator**. It runs the loop, starts every agent in
a Rex block, and is the only writer of `factory/board.json`. It writes no product code itself.
`factory/README.md` shows the loop; this file is how to run it. `factory/bin/agent` runs each
agent (read its header for exit codes). Repo rules (`AGENTS.md`) win over anything here.

## Commands

| Command | Does |
|---|---|
| `/factory next` | the highest-priority `todo` bean (critical > high > normal > low, then oldest; not an epic or milestone, not blocked) |
| `/factory <bean-id>` | that bean |
| `/factory <feature text>` | `beans create` it (`-t feature -s todo`), then run it |
| `/factory approve <job>` | merge a `needs-human` job: Vik's go-ahead for that job only |
| `/factory rework <job> <note>` | send a job back to the builder with Vik's note |
| `/factory status` | print the board; start the dashboard if it isn't running |

## The loop

```
bean → spec-writer → builder → review round (4 reviewers, WAIT FOR ALL)
          any CHANGES and round < 3 → resume builder → next round
          any CHANGES at round 3    → needs-human
          all PASS → approver → APPROVE → PR → CI green → merge → deploy check → merged
                              → ESCALATE (or a rule below) → PR → needs-human
```

| Agent | File | Runner | Writes |
|---|---|---|---|
| spec-writer | `factory/agents/spec-writer.md` | Claude, read-only | `spec.md` |
| builder | `factory/agents/builder.md` | Claude, one session per job, resumed each round | commits, `build.md` |
| review-code, review-security | `factory/agents/review-*.md` | Copilot on odd rounds, Bob on even | `round-<n>/review-<role>.md` |
| review-ux, review-ui | `factory/agents/review-*.md` | Bob on odd rounds, Copilot on even | `round-<n>/review-<role>.md` |
| approver | `factory/agents/approver.md` | Claude, fresh session, read-only | `decision.md` |

Claude only writes code; Copilot and Bob only review. Reviewers and read-only agents print their
document between markers; the orchestrator saves it verbatim with `factory/bin/extract.py`, so every
agent still owns exactly one file. **All Claude runs go through `factory/bin/claude-sub`** (Vik's
subscription only; it strips API-key, gateway and Bedrock variables and stops on any other login).

## Rules

- Agents get context from files, never from this conversation.
- A review starts with `VERDICT: PASS` or `VERDICT: CHANGES`; `decision.md` starts with `APPROVE`
  or `ESCALATE`. `extract.py --first` enforces it; a malformed answer is rerun once, then the job
  goes to `needs-human`.
- **WAIT FOR ALL**: a round is done only when all four `review-*.md` files exist in its folder.
  Never resume the builder mid-round.
- The builder is one Claude session per job (`--session-id` in round 1, `--resume` after), named
  `builder-<job>`; its session id is on the board.
- **Max 3 review rounds** (the first plus two reworks). `/factory rework` may add one more.
- **Needs a human, whatever the approver says**: red CI (a pre-existing red check too: say so,
  e.g. the Lighthouse embed flake, issue #87); a diff touching
  `^(\.railway/|Dockerfile|\.github/|build\.gradle\.kts|gradle\.properties|settings\.gradle|gradle/|package(-lock)?\.json|src/main/resources/db/|src/main/resources/application.*\.properties|.*SqlSecurityValidator|.*EmbedFraming|\.claude/skills/factory/|factory/(agents|bin)/)`;
  a builder that wrote `BLOCKED:`; a reviewer that can't run twice. These are guardrails, not a
  sandbox: the builder runs `./gradlew`, so code it writes can run anything. What protects `main`
  is that only this orchestrator pushes and merges, after four reviews and CI.
- Push only with `zsh -ic 'git push-external -u origin <branch>'`, then check `git ls-remote` shows
  the head (a push can exit 0 and push nothing). Merge with `--match-head-commit`.
- Never answer another agent's permission prompt; never `railway config apply`; never give Copilot
  `write` or `--allow-all`; never give Bob `--trust` or use `bob run`; never read secrets.

## Running a job

Paths: `REPO` is the main checkout, `F=$REPO/factory`, `J=$F/jobs/<job>`, `WT=$REPO/.claude/worktrees/<job>`.
Every `$F/bin/agent …` call blocks until its Rex block exits (a builder round can take 30 minutes):
run it with the Bash tool in the background and act on the notification. Exit 0 means its file is
saved; 2 a malformed answer (rerun once); 3 Claude not on the subscription (stop, tell Vik); 4 a
reviewer timeout (rerun once).

1. **Start.** Clean `main`, `git fetch`. Job id `<bean suffix>-<2-4 word slug>` (`akvl-drop-missing-400`).
   `git worktree add $WT -b factory/<job> origin/main`, `npm ci` in it.
   `$F/bin/board.py init <job> bean=<bean-id> title="<title>" branch=factory/<job>`; set the bean
   `in-progress` in the worktree (the builder commits it). Start the dashboard if nothing listens on
   8799: `rex run --focus=false --label "factory dashboard" -- static-web-server -p 8799 -d $F --compression false`.
2. **Spec.** `$F/bin/agent <job> spec` → `$J/spec.md`. `board.py set <job> stage=build`.
3. **Build.** `$F/bin/agent <job> build 1` → commits on `factory/<job>` and `$J/build.md`.
4. **Review round n.** `board.py round <job> <n> $($F/bin/agent <job> reviewers <n>)`. Start
   `$F/bin/agent <job> review-<role> <n>` for code, security, ux and ui at once (four background
   calls). As each exits 0: `board.py review <job> <n> <role> <first word after VERDICT:>`.
   When all four `$J/round-<n>/review-*.md` exist:
   - all PASS → step 5;
   - any CHANGES and n < 3 → `board.py set <job> stage=build`, `$F/bin/agent <job> build <n+1>`, then round n+1;
   - any CHANGES at n ≥ 3 → push and open the PR as in step 6 (body: spec, build notes and the
     open findings), `stage=needs-human note="CHANGES after <n> rounds"`. Stop.
5. **Approve.** `stage=approve`, `$F/bin/agent <job> approve <n>` → `$J/decision.md`. Then
   `$F/bin/agent <job> needs-human-paths`: only exit 0 with `CLEAN` lets an APPROVE through;
   exit 10 (paths listed) or any other exit means needs-human.
6. **PR.** Push, check `ls-remote`. If `gh pr list --head factory/<job> --state open` finds a PR
   (a reworked job), `gh pr edit <n> --body-file` it; otherwise `gh pr create --body-file`. The body
   is the `## PR body` section of `decision.md`. `board.py set <job> stage=pr pr.number=<n>
   pr.url=<url> pr.ci=pending`, and watch CI for the new head commit, not an earlier run.
   - ESCALATE or a rule hit: `stage=needs-human note="<why>"`, tell Vik what to look at. Stop.
   - APPROVE: `gh pr checks <n> --watch` in the background. Green: `pr.ci=green`,
     `gh pr merge <n> --squash --match-head-commit <sha>`, wait until the app's build-info reports
     the merge commit (AGENTS.md "Deploy"), `stage=merged`. Red: `pr.ci=red`, `stage=needs-human`.
7. **Clean up** after `merged`: pull `main`, `git worktree remove $WT`, delete the local branch,
   close the job's Rex blocks (`rex block close "factory <job> …"`, labels in `$J/.run/*.block`).
   Job files stay in `$J` (gitignored); the PR carries the record.

`/factory approve <job>`: the job must be `needs-human` with an open PR. Check CI on the head
commit; if it is red only from a known pre-existing failure, say which and merge only if Vik's
command was for that. Then step 6's merge and deploy check, then step 7.

`/factory rework <job> <note>`: write the note to `$J/round-<n>/human-note.md` (n is the job's
current round), run `$F/bin/agent <job> build <n+1>` (it reads round n's folder, note first),
then review round n+1 and continue the loop. A rework round may go past 3; CHANGES then goes
straight back to needs-human.

Report to Vik at every `needs-human` and at `merged`: job, PR link, rounds, what each reviewer found.
