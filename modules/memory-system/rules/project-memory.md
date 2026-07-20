# Memory System

## Documentation

Before making substantive project decisions, read `.agents/docs/INDEX.md` and load only the linked documentation relevant to the task. Treat `.agents/docs/` as durable, curated project knowledge; its structure beyond `INDEX.md` is project-defined.

## Session Reports

For each coding session that performs project work, create or update an append-only report in `.agents/sessions/`. Finalize it before the final response when possible. Use a date and concise topic in the filename, and include the session ID when available.

Keep reports concise and useful for later consolidation:

- Outcome or current status.
- Durable signals: non-obvious facts, architecture, decisions, patterns, or recurring failures.
- User feedback that should influence future work.
- Evidence: relevant paths, commands, issues, pull requests, or user messages.
- Unresolved risks or questions.

Do not use session reports as raw transcripts, exhaustive file-change logs, command dumps, secret storage, or a place for unverified claims. A session with no durable signals may state that explicitly.

## Consolidation

Do not update `.agents/docs/` merely because a session completed. Consolidate only when the user requests it or when explicitly asked to maintain documentation.

When multiple session reports show a repeated pattern, recurring user correction, stale documentation, or a verified high-impact decision, tell the user that consolidation may be valuable and cite the supporting reports. Repetition alone is not evidence: verify candidates against the current code and documentation before promoting them.
