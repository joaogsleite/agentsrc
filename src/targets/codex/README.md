# Codex CLI Adapter

Verified with Codex CLI `0.144.6` against the [MCP](https://developers.openai.com/codex/extend/mcp/), [configuration](https://developers.openai.com/codex/config-file/config-reference/), and [AGENTS.md](https://developers.openai.com/codex/agent-configuration/agents-md/) documentation.

- Output: `.codex/config.toml`, `.codex/rules/`, and `.codex/skills/`; the shared root `AGENTS.md` points Codex to the generated built-in rule and skill.
- Supports stdio and HTTP MCPs. `timeoutMs` rounds up to Codex `tool_timeout_sec`.
- Stdio MCP fragments with `transport.env` or a non-root `cwd` receive a `.codex/agentsrc-mcps/<name>.sh` wrapper.
- Canonical agents and commands are unsupported and reported as compatibility warnings, or errors under `--strict`. Skills remain in `.agents/skills/`; the generated bootstrap instructs Codex to read a relevant `SKILL.md` when the user explicitly requests its workflow.
