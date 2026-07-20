# Gemini CLI Adapter

Verified with Gemini CLI `0.51.0` against the [MCP](https://geminicli.com/docs/tools/mcp-server/), [settings](https://geminicli.com/docs/cli/settings/), and [GEMINI.md](https://geminicli.com/docs/cli/gemini-md/) documentation.

- Output: `.gemini/settings.json`, `.gemini/rules/`, `.gemini/skills/`, and `GEMINI.md`; the root context file points Gemini to the generated built-in rule and skill.
- Supports stdio and header-free streamable HTTP MCPs. `timeoutMs` maps to Gemini milliseconds.
- Stdio MCP fragments with `transport.env` or a non-root `cwd` receive a `.gemini/agentsrc-mcps/<name>.sh` wrapper.
- Gemini cannot safely represent environment-backed HTTP headers, so those fragments are errors.
- Canonical agents and commands are unsupported and reported as compatibility warnings, or errors under `--strict`. Skills remain in `.agents/skills/`; the generated bootstrap instructs Gemini to read a relevant `SKILL.md` when the user explicitly requests its workflow.
