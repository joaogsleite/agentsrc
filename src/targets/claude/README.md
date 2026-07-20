# Claude Code Adapter

Verified with Claude Code `2.1.215` against the [MCP](https://code.claude.com/docs/en/mcp) and [memory](https://code.claude.com/docs/en/memory) documentation.

- Output: `.claude/`, `CLAUDE.md`, and root `.mcp.json`.
- Supports canonical agents, commands, skills, instructions, stdio MCPs, and streamable HTTP MCPs.
- Generates the built-in source-of-truth rule in `.claude/rules/` and the `manage-agentsrc` skill in `.claude/skills/`.
- Stdio MCP fragments with `transport.env` or a non-root `cwd` receive an `.claude/agentsrc-mcps/<name>.sh` wrapper.
- `timeoutMs` maps to Claude's millisecond `timeout` field.
- Limitation: Claude does not document an MCP `cwd` field, so AgentSrc handles it only through the launcher wrapper.
