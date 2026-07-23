---
description: Curate `.agents/state/memory-system/` session reports into durable project documentation. Use only when the user asks to consolidate session reports or maintain project documentation.
disable-model-invocation: true
argument-hint: "consolidate [session paths or date range]"
---

# Project Memory

Use this skill only for explicit documentation consolidation. Do not invoke it automatically after a session.

## Project Environment

When this workflow needs an environment variable, run the command through this helper. It loads the project-root `.env` when present without sourcing or evaluating it, preserves inherited environment values over `.env` values, and never prints secret values. Define it once for the current shell session, then use it for every credential-dependent command.

```sh
with_project_env() {
  if [ -f .env ]; then
    node --env-file=.env -e '
      const { spawn } = require("node:child_process")
      const [command, ...args] = process.argv.slice(1)
      const child = spawn(command, args, { stdio: "inherit", env: process.env })
      child.once("error", (error) => { console.error(error.message); process.exit(1) })
      child.once("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
    ' -- "$@"
  else
    "$@"
  fi
}
```

## Consolidate

When the user requests `/project-memory consolidate`, use the session paths or date range they provide. If they provide neither, ask which session reports to review rather than scanning an unbounded history.

1. Read `.agents/docs/INDEX.md`, the selected session reports in `.agents/state/memory-system/`, and any relevant linked docs.
2. Group related signals across the reports: repeated patterns, recurring user feedback, shared failures, architectural relationships, decisions, and contradictions with existing docs.
3. Treat a single report as insufficient unless it contains explicit user direction or a verified, high-impact decision. Promote cross-session patterns only when independent reports and current project evidence support them.
4. Verify each proposed fact against current code, configuration, tests, or an explicit user instruction. Do not promote repeated assumptions or stale implementation details.
5. Update existing docs when they are the natural home for the fact. Create a topical document only when it adds durable value; preserve the project's chosen layout.
6. Update `INDEX.md` only when navigation or concise always-relevant context changes.
7. Report the evidence, documentation changes, and candidates deliberately skipped. If no candidate meets the threshold, report `No documentation update warranted` and leave `.agents/docs/` unchanged.

## Promotion Criteria

Promote knowledge that will help future coding sessions make better decisions:

- Architecture boundaries, data flow, invariants, and component ownership.
- Intentional decisions, tradeoffs, and rejected approaches.
- Reusable local code patterns and conventions.
- User corrections or preferences that should persist.
- Non-obvious build, test, deployment, or debugging constraints.
- Repeated failures with proven resolutions.

Do not promote routine implementation details, per-file summaries, temporary plans, generic framework knowledge, raw command output, or unverified claims.
