---
name: manage-agentsrc
description: Change AgentSrc-managed coding-agent configuration from canonical `.agents/` sources and regenerate target output.
---

# Manage AgentSrc

Use this workflow when the user asks to add, remove, or change coding-agent rules, skills, agents, commands, MCP servers, targets, or modules.

1. Read the target-local `rules/agentsrc-source-of-truth.md` rule.
2. Inspect `.agents/.agentsrc.json` and the relevant canonical `.agents/` path.
3. Make the requested change only in `.agents/`, or use the AgentSrc module command when managing a module.
4. Run `npm run agents -- validate --strict`.
5. Run `npm run agents -- generate` after validation passes.
6. Never edit generated target output. If the requested setting is not portable, explain the target compatibility limitation instead.
