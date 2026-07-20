<div align='center' class='hidden'>
    <br/>
    <br/>
    <h3>agentsrc</h3>
    <p>Canonical coding-agent configuration for every supported coding tool.</p>
    <br/>
    <br/>
</div>

AgentSrc keeps coding-agent configuration in one tracked `.agents/` directory and generates ignored projections for Claude Code, Codex, Gemini CLI, OpenCode, and `AGENTS.md`.

## Install

Install AgentSrc directly from Git. No npm publishing or compiled `dist/` output is required:

```sh
npm install -D github:joaogsleite/agentsrc#main
```

Add one script to the consumer project's `package.json`:

```json
{
  "scripts": {
    "agents": "agentsrc"
  }
}
```

Forward every command through that script:

```sh
npm run agents -- init --targets claude,codex,gemini,opencode
npm run agents -- validate --strict
npm run agents -- generate
```

Pin the Git dependency to a release tag or commit SHA when reproducibility matters.

## Canonical Configuration

`.agents/` is the source of truth. Edit its contents, never generated target output.

```text
.agents/
  .agentsrc.json       # Selected targets and requested modules
  agents/              # Agent definitions
  commands/            # Reusable commands
  mcps/                # One portable MCP server per JSON file
  rules/               # Project instructions
  skills/<name>/       # SKILL.md and optional scripts/assets
  docs/                # Durable, tracked project documentation
  docs/INDEX.md        # Concise entry point for every coding session
  sessions/            # Append-only session reports, always ignored
  state/               # Temporary scratch state, always ignored
```

`init` creates this layout, adds a storage rule, and owns the generated block in `.gitignore`. Project documentation belongs under `.agents/docs/`; session reports and scratch data belong under `.agents/`, not at the repository root or in generated target directories.

## Generated Configuration

AgentSrc projects a built-in source-of-truth rule and `manage-agentsrc` skill into every selected target folder. They instruct coding agents to edit only `.agents/`, validate with `npm run agents -- validate --strict`, and regenerate with `npm run agents -- generate`. Generated output is disposable: agents must not edit `.claude/`, `.codex/`, `.gemini/`, `.opencode/`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `opencode.json`, or `.mcp.json` directly.

## Session Documentation

Install the optional `memory-system` module to establish a portable session-to-documentation workflow:

```sh
npm run agents -- module add memory-system
```

Generated `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md` are small bootstraps: they instruct agents to read the live documentation index and current rules from `.agents/`, rather than embedding stale copies. The module instructs agents to record concise, append-only reports under `.agents/sessions/` and to use `.agents/docs/INDEX.md` as the durable documentation entry point. Session reports are ignored; documentation is tracked. Consolidation is deliberately user-invoked so routine implementation details do not become permanent context:

```text
/project-memory consolidate <session paths or date range>
```

The skill promotes only verified, high-value decisions, architecture, patterns, constraints, and recurring user feedback. It leaves documentation unchanged when no durable improvement is warranted. Targets without skill support follow the same workflow when asked to consolidate session documentation.

## Project Manifest

`.agents/.agentsrc.json` selects target adapters and records only modules explicitly requested by the user:

```json
{
  "formatVersion": 1,
  "targets": ["claude", "opencode"],
  "modules": [
    {
      "name": "memory-system",
      "dependencies": [],
      "files": [
        "rules/project-memory.md",
        "skills/project-memory/SKILL.md"
      ]
    }
  ]
}
```

Dependencies declared by a module's `module.json` are installed with its payload but are inferred from the dependency graph rather than added as separate manifest entries.

## Modules

Modules are data-only payloads under `modules/<name>/`. Every payload file except `module.json` maps to the same relative path in `.agents/`.

```sh
npm run agents -- module add memory-system
npm run agents -- module add team-workflows --local ../shared-agent-modules
npm run agents -- module add team-workflows --github acme/shared-agent-modules
npm run agents -- module list
npm run agents -- module update memory-system
npm run agents -- module remove memory-system
```

Local sources install relative symlinks, so edits to the source module are immediately visible in the client project. GitHub and first-party catalog sources install copied payloads. See [module authoring](docs/module-authoring.md) for the module layout and safety rules.

## MCP Servers

Put one portable MCP fragment in `.agents/mcps/<name>.json`. The filename must match `name`.

```json
{
  "name": "github",
  "transport": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@github/github-mcp-server"],
    "env": ["GITHUB_TOKEN"]
  },
  "timeoutMs": 30000
}
```

For local stdio servers with `transport.env`, AgentSrc generates a target-local wrapper that reads the project-root `.env` at runtime and exports only the declared variables. Secret values never enter generated configuration. HTTP MCP header support depends on the target; `validate --strict` reports incompatible fragments.

## Generate And Check

`AGENTS.md` is always generated. Selected targets rebuild their complete output:

| Target | Generated output |
| --- | --- |
| Claude | `.claude/`, `CLAUDE.md`, `.mcp.json` |
| Codex | `.codex/` |
| Gemini | `.gemini/`, `GEMINI.md` |
| OpenCode | `.opencode/`, `opencode.json` |

```sh
npm run agents -- generate
npm run agents -- generate claude opencode
npm run agents -- generate --check
npm run agents -- status
```

`generate --check` changes nothing and fails when generated output has drifted. Use it in CI after `validate --strict`.

## Shell Completions

```sh
npm run agents -- completions install
```

Restart the shell afterwards. Remove completions with:

```sh
npm run agents -- completions uninstall
```

## Local Development Override

Keep the Git dependency in every consumer repository. It is the portable default for collaborators and CI. When actively changing AgentSrc locally, replace only the installed copy with a symlink:

```sh
# Run once from the AgentSrc checkout
npm link

# Run from a consumer repository
npm link agentsrc
```

The consumer keeps its Git dependency in `package.json` and `package-lock.json`; `npm link agentsrc` changes only that machine's `node_modules/agentsrc` to point at the local checkout. Source changes are available immediately through the same command:

```sh
npm run agents -- validate --strict
```

After `npm install`, npm can restore the pinned Git dependency. Reapply the local override with `npm link agentsrc`. To stop using the local checkout, run `npm unlink agentsrc`; the next `npm install` restores the Git dependency.
