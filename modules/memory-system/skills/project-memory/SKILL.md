---
description: Curate `.agents/sessions/` into durable project documentation. Use only when the user asks to consolidate session reports or maintain project documentation.
disable-model-invocation: true
argument-hint: "consolidate [session paths or date range]"
---

# Project Memory

Use this skill only for explicit documentation consolidation. Do not invoke it automatically after a session.

## Consolidate

When the user requests `/project-memory consolidate`, use the session paths or date range they provide. If they provide neither, ask which session reports to review rather than scanning an unbounded history.

1. Read `.agents/docs/INDEX.md`, the selected session reports, and any relevant linked docs.
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
