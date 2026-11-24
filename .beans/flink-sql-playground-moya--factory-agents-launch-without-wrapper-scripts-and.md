---
# flink-sql-playground-moya
title: 'Factory agents: launch without wrapper scripts and report Rex process state'
status: completed
type: task
priority: normal
created_at: 2026-11-24T16:25:14Z
updated_at: 2026-11-24T16:43:50Z
---

Follow-up of d7p7 (criterion 8 dropped). jbaruch/software-factory runs agents directly with `rex run --shell=none` (no zsh wrapper, no tee), reads each pane's process state from Rex (running/exited/failed/lost, pinned to the server instance id), keeps the pane output before closing, and tidies finished tabs. Claude workers there still use `claude --print`; there is no OSC 7501.

- [x] Check why Rex shows no state for our Claude and Copilot blocks (non-TTY `claude -p | tee`, `copilot -p`).
- [x] Launch agents directly through Rex where possible, so Rex sees the real process.
- [x] Keep each pane output in the job folder before closing it (capture.txt), so status works offline.
- [x] Decide whether Claude agents should run interactively; the factory rule is that nobody answers permission prompts.

## Resolution

Rex tracked zsh (the wrapper), not the agent; program_status (OSC 7501) is empty for Claude and Copilot because -p mode reports nothing, so process state (rex block call process, rex wait) is the signal. Claude and Copilot now launch with rex run --shell=none (bin/run-agent execs Claude with the prompt on stdin and the answer in .raw); agent <job> state reports running/exited/failed/closed/lost with the server instance id; pane text is kept in capture-<name>.txt; Claude stays on claude -p. See factory/README.md.
