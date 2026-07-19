# Codex CLI Adapter

Verified with Codex CLI `0.144.6` against the [MCP](https://developers.openai.com/codex/extend/mcp/), [configuration](https://developers.openai.com/codex/config-file/config-reference/), and [AGENTS.md](https://developers.openai.com/codex/agent-configuration/agents-md/) documentation.

- Output: `.codex/config.toml`; the shared root `AGENTS.md` provides instructions.
- Supports stdio and HTTP MCPs. `timeoutMs` rounds up to Codex `tool_timeout_sec`.
- Stdio MCP fragments with `transport.env` or a non-root `cwd` receive a `.codex/agentsrc-mcps/<name>.sh` wrapper.
- Canonical agents, commands, and skills are unsupported and reported as compatibility warnings, or errors under `--strict`.
