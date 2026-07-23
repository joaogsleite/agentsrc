<div align='center' class='hidden'>
    <br/>
    <br/>
    <h3>agentsrc</h3>
    <p>Canonical coding-agent configuration for every supported coding tool.</p>
    <br/>
    <br/>
</div>

agentsrc keeps coding-agent configuration in one tracked `.agents/` directory and generates ignored projections for Claude Code, Codex, Gemini CLI, and OpenCode.

## Install

Install agentsrc directly from Git. No npm publishing or compiled `dist/` output is required:

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
  .agentsrc.json                 # Selected targets and installed modules
  agents/
    <name>.md                     # Specialized agent definition
  commands/
    <name>.md                     # Reusable command prompt
  config/                         # Shared persistent agent configuration
  docs/
    INDEX.md                      # Durable documentation entry point
    <topic>.md                    # Project-defined reference material
  mcps/
    <name>.json                   # One portable MCP server per JSON file
  rules/
    <name>.md                     # Always-applicable project instruction
  sessions/                       # Append-only reports, ignored by Git
    <date>-<topic>.md
  skills/
    <name>/
      SKILL.md                    # On-demand workflow entry point
      references/
        <name>.md                 # Optional reference material
      scripts/
        <name>.sh                 # Optional supporting script
  state/                          # Temporary scratch data, ignored by Git
```

`init` creates this layout, adds a storage rule, and owns the generated block in `.gitignore`. Project documentation belongs under `.agents/docs/`; session reports and scratch data belong under `.agents/`, not at the repository root or in generated target directories.

`.agents/config/` is tracked shared configuration for durable agent-managed values, such as a stable tunnel domain. Do not store secrets there; use the project environment configuration for secret values.

## Generated Configuration

agentsrc projects a built-in source-of-truth rule and `manage-agentsrc` skill into every selected target folder. They instruct coding agents to edit only `.agents/`, validate with `npm run agents -- validate --strict`, and regenerate with `npm run agents -- generate`. Generated output is disposable: agents must not edit `.claude/`, `.codex/`, `.gemini/`, `.opencode/`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `opencode.json`, or `.mcp.json` directly.

## Authoring Configuration

### Rules

Put always-applicable project instructions in `.agents/rules/*.md`. Generated root instruction files direct agents to read these files from the canonical source.

```md
# Testing

Run `npm test` after changing behavior covered by tests.
```

### Skills

Put an on-demand workflow in `.agents/skills/<name>/SKILL.md`. A skill can include supporting `references/`, `scripts/`, and assets in the same directory.

```md
---
name: review-api
description: Review API changes for project conventions.
---

# Review API

Check validation, error responses, and tests.
```

### Commands

Put reusable command prompts in `.agents/commands/<name>.md`.

```md
# Release Check

Run the release validation steps and report any blockers.
```

### Agents

Put specialized agent definitions in `.agents/agents/<name>.md`. Include the target-supported frontmatter and a focused role prompt. Agent and command support varies by target; run `validate --strict` to detect incompatible configurations.

### MCP Servers

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

For local stdio servers with `transport.env`, agentsrc generates a target-local wrapper that reads the project-root `.env` at runtime and exports only the declared variables. Secret values never enter generated configuration. HTTP MCP header support depends on the target; `validate --strict` reports incompatible fragments.

### Project Manifest

`.agents/.agentsrc.json` selects target adapters and records modules installed in this consumer project:

```json
{
  "$schema": "https://raw.githubusercontent.com/joaogsleite/agentsrc/main/schemas/project-v1.json",
  "formatVersion": 1,
  "targets": ["claude", "opencode"],
  "modules": [
    {
      "name": "memory-system",
      "revision": "0123456789abcdef0123456789abcdef01234567"
    }
  ]
}
```

Module entries contain only their lowercase-hyphenated `name`, immutable Git `revision`, and, when applicable, the install `source` (`local` or `github`). Dependencies and payload paths remain in each pinned source `module.json`; agentsrc reconstructs that metadata from the recorded revision for safe updates and removal. No hidden module-state directory is created under `.agents/`.

#### Modules

`modules/<name>/` is a module **source** layout used by the first-party catalog, a local source repository, or a GitHub repository. It is not a directory that consumers create inside their projects.

When a consumer installs a module, agentsrc records it in `.agents/.agentsrc.json` and installs each payload file directly into the matching `.agents/` subdirectory. For example, a source file at `modules/memory-system/rules/project-memory.md` installs as `.agents/rules/project-memory.md`.

```sh
npm run agents -- module add memory-system
npm run agents -- module add team-workflows --local ../shared-agent-modules
npm run agents -- module add team-workflows --github acme/shared-agent-modules
npm run agents -- module list
npm run agents -- module update memory-system
npm run agents -- module remove memory-system
```

Dependencies declared by a source module's `module.json` are resolved and recorded as pinned module entries with the requested module. This gives each installed payload an immutable owner and lets dependency changes remove stale files safely. Local sources install relative symlinks, but `module add` and `module update` require their source repository to have no uncommitted changes and record its current commit SHA. GitHub and first-party catalog sources install copied payloads and are pinned to their resolved commit SHA. See [module authoring](docs/module-authoring.md) for the source layout and safety rules.

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

## Local Development Override

Keep the Git dependency in every consumer repository. It is the portable default for collaborators and CI. When actively changing agentsrc locally, replace only the installed copy with a symlink:

```sh
# Run once from the agentsrc checkout
npm link

# Run from a consumer repository
npm link agentsrc
```

The consumer keeps its Git dependency in `package.json` and `package-lock.json`; `npm link agentsrc` changes only that machine's `node_modules/agentsrc` to point at the local checkout. Source changes are available immediately through the same command:

```sh
npm run agents -- validate --strict
```

After `npm install`, npm can restore the pinned Git dependency. Reapply the local override with `npm link agentsrc`. To stop using the local checkout, run `npm unlink agentsrc`; the next `npm install` restores the Git dependency.
