# agentsrc Source Of Truth

agentsrc-managed configuration is generated output. Never edit `.claude/`, `.codex/`, `.gemini/`, `.opencode/`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `opencode.json`, or `.mcp.json` directly.

When changing coding-agent configuration, edit the canonical `.agents/` source instead:

- Rules: `.agents/rules/`
- Skills: `.agents/skills/`
- Agents: `.agents/agents/`
- Commands: `.agents/commands/`
- MCP fragments: `.agents/mcps/`
- Targets and installed modules: `.agents/.agentsrc.json`

Use `npm run agents -- module add`, `remove`, or `update` to manage modules. After any agentsrc configuration change, run:

```sh
npm run agents -- validate --strict
npm run agents -- generate
```

If agentsrc cannot represent a requested target-specific setting, explain the compatibility limitation. Do not hand-edit generated output as a workaround.
