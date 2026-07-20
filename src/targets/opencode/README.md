# OpenCode Adapter

Verified with OpenCode `1.18.3` against the [MCP](https://opencode.ai/docs/mcp-servers/), [configuration](https://opencode.ai/docs/config/), and [rules](https://opencode.ai/docs/rules/) documentation.

- Output: `.opencode/` and root `opencode.json`, including the built-in source-of-truth rule at `.opencode/rules/` and `manage-agentsrc` skill.
- Supports canonical agents, commands, skills, instructions, stdio MCPs, and remote HTTP MCPs.
- Local MCP commands use OpenCode command arrays. Remote headers retain `{env:NAME}` references.
- Stdio MCP fragments with `transport.env` or a non-root `cwd` receive an `.opencode/agentsrc-mcps/<name>.sh` wrapper.
- `timeoutMs` maps to OpenCode's discovery timeout, not per-tool execution time.
