# AgentSrc

**AgentSrc** (`agentsrc`) is a TypeScript CLI that makes a project's
`.agents/` directory the source of truth for coding-agent configuration. It
generates complete Claude, Codex, Gemini, OpenCode, and `AGENTS.md` projections
from that directory and manages reusable modules.

## Repository

The `agentsrc` repository contains the CLI, first-party module catalog, and
target adapters. Target compatibility notes live next to each adapter, not in a
separate specification directory.

```text
agentsrc/
  package.json
  src/
    cli.ts
    commands/                       # init, validate, generate, status, module
    core/                           # discovery, composition, diagnostics, I/O
    modules/                        # source resolution and module lifecycle
    schemas/                        # JSON schemas and runtime validation
      project-v1.json
      module-v1.json
      mcp-server-v1.json
    targets/
      claude/
      codex/
      gemini/
      opencode/
      types.ts
  modules/                          # First-party catalog
    memory-system/
      module.json
      rules/
      skills/
    jira-tickets-workflow/
      module.json
      skills/
  examples/                         # Runnable representative client projects
    typescript-web-app/
    python-api-service/
    go-cli-tool/
    product-design-workflow/
  tests/
    unit/
    integration/
    fixtures/
```

Each `src/targets/<target>/` directory contains its adapter, tests, and a short
`README.md` listing the upstream tool version, documentation URLs, supported
canonical items, output paths, and known limitations. Adapters implement
`validate`, `plan`, and `render`; only shared core code writes files.

Modules contain data only. They can include skill-local scripts and assets, but
the CLI never executes module content. Install hooks and adapter code are not
allowed in modules.

Each project under `examples/` is a small but realistic client repository with
its own `.agents/` directory, tech-stack files, purpose-specific workflows, and
target selection. The example set covers web applications, backend services,
CLIs, and non-code workflows across Claude, Codex, Gemini, and OpenCode.
Integration tests install modules and run `validate`, `generate`, and
`generate --check` inside these projects. Generated target output remains
ignored by each example's managed `.gitignore` block.

## Project Contract

```text
.agents/
  .agentsrc.json                   # Targets and installed-module registry
  agents/
  commands/
  mcps/<server>.json               # One portable MCP server per file
  rules/
  skills/<skill>/                  # SKILL.md plus optional scripts/assets
  docs/                            # Durable, tracked project documentation
  docs/INDEX.md                    # Concise entry point for coding sessions
  sessions/                        # Append-only session reports
  state/                           # Local runtime state and caches
```

`.agents/` is the canonical location for all agent definitions, project
documentation, and agent runtime data. `init` creates a rule requiring agents
to store session reports, scratch data, and durable documentation under `.agents/`, never in target
directories or the project root.

`.agents/docs/` is tracked project knowledge. `.agents/sessions/` and `.agents/state/` are
ignored because they contain local runtime data; generated target output is always
ignored.

Generated target output also contains package-owned AgentSrc guidance. It directs
agents to edit canonical `.agents/` sources and regenerate output rather than
modifying `.claude/`, `.codex/`, `.gemini/`, `.opencode/`, or generated root
instruction files directly.

### Project Manifest

```json
{
  "$schema": "https://raw.githubusercontent.com/joaogsleite/agentsrc/main/src/schemas/project-v1.json",
  "formatVersion": 1,
  "targets": ["claude", "codex", "gemini", "opencode"],
  "modules": [
    {
      "name": "memory-system",
      "files": [
        "rules/project-memory.md",
        "skills/project-memory/SKILL.md"
      ]
    },
    {
      "name": "team-workflows",
      "source": {
        "local": "../shared-agent-modules",
        "github": "acme/shared-agent-modules"
      },
      "dependencies": ["memory-system"],
      "files": ["skills/release-workflow/SKILL.md"]
    },
    {
      "name": "jira-tickets-workflow",
      "source": { "github": "acme/shared-agent-modules" },
      "files": ["skills/jira-workflow/SKILL.md"]
    }
  ]
}
```

`modules` is the only module registry. Each entry records the module name, its
optional source, dependency names, and every
relative file path it installed below `.agents/`. It deliberately does not
record versions, commits, hashes, or generated-output state.

`source` is optional. When it is omitted, the module is installed from the
AgentSrc catalog. Its optional `local` key is a path relative to the client
project; its optional `github` key is an `owner/repository` name. When both are
set, `local` takes priority when it exists; otherwise `github` is used. Missing
or empty `source` uses the AgentSrc GitHub repository.

## Modules

A source repository exposes modules at `modules/<module-name>/`. The only
required metadata is `module.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/joaogsleite/agentsrc/main/src/schemas/module-v1.json",
  "name": "memory-system",
  "description": "Session reporting and curated project documentation workflows.",
  "dependencies": []
}
```

Module installation is a generic filesystem merge. Except for `module.json`,
every payload path under `modules/<module-name>/` maps to the same relative path
under `.agents/`; directories are created as needed. The installer has no skill,
rule, command, MCP, or documentation specific behavior. For example:

```text
modules/memory-system/skills/project-memory/SKILL.md
.agents/skills/project-memory/SKILL.md
```

Reserved destinations are `.agents/.agentsrc.json`, `.agents/docs/`, `.agents/sessions/`, and `.agents/state/`.
Modules cannot install into either. The installer rejects absolute paths,
directory traversal, symlinks that escape the source root, and destination-path
collisions.

```text
agentsrc module add memory-system
agentsrc module add team-workflows --local ../shared-agent-modules --github acme/shared-agent-modules
agentsrc module add jira-tickets-workflow --github acme/shared-agent-modules
agentsrc module list
agentsrc module remove <module-name>
agentsrc module update <module-name>
```

- A local source installs relative symlinks for its payload files.
- A GitHub or default source downloads and copies its payload files.
- A broken local symlink is reported by `validate`; `module update` uses the
  GitHub fallback when configured. Generation never repairs modules.
- `remove` deletes the module's recorded files and then empty directories.
- `update` resolves and stages the complete current payload, removes every file
  recorded for the prior installation, installs the new payload, and replaces
  the manifest file list. Installed module files are disposable: removal and
  update always delete their recorded paths, including manual edits.

Dependencies are module names declared in `module.json`. `add` resolves them
recursively from the same effective source repository as the requested module:
the usable local source first, then its GitHub source. When a dependency is not
present in that repository's `modules/` folder, it falls back to the AgentSrc
catalog. Module names are globally unique; a dependency already installed from a
different source is an error. Dependencies install before their dependents and
are installed with their payloads but are not recorded as module entries. The
CLI infers them from the dependency lists of the recorded user-requested modules.

`update` refreshes the requested module and its complete dependency closure,
then replaces the recorded aggregate payload file list. `remove` refuses to
remove a requested module while another requested module names it as a
dependency. Shared dependency files remain until no recorded module references
them. Cycles are errors.

The manifest update and filesystem changes must behave transactionally: validate
and stage first, restore the prior payload if replacement fails, and write the
new manifest only after installation succeeds.

## MCP Fragments

Each `.agents/mcps/<name>.json` defines one MCP server. The filename stem must
match `name` and use lowercase letters, numbers, and hyphens only. This avoids
server-name incompatibilities across engines. The v1 schema is:

```json
{
  "$schema": "https://raw.githubusercontent.com/joaogsleite/agentsrc/main/src/schemas/mcp-server-v1.json",
  "name": "github",
  "enabled": true,
  "transport": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@github/github-mcp-server"],
    "env": ["GITHUB_PERSONAL_ACCESS_TOKEN"],
    "cwd": "."
  },
  "timeoutMs": 30000
}
```

Remote servers use the same envelope with an HTTP transport:

```json
{
  "$schema": "https://raw.githubusercontent.com/joaogsleite/agentsrc/main/src/schemas/mcp-server-v1.json",
  "name": "context7",
  "transport": {
    "type": "http",
    "url": "https://mcp.context7.com/mcp",
    "headers": {
      "Authorization": "CONTEXT7_AUTHORIZATION"
    }
  }
}
```

`env` lists host environment-variable names forwarded unchanged to a local
server. HTTP `headers` map a header name to the host environment variable whose
value is the complete header value, for example
`CONTEXT7_AUTHORIZATION="Bearer <token>"`. Secrets therefore never appear in
the fragment. `cwd` is optional and project-relative; `enabled` defaults to
`true`; `timeoutMs` is optional and adapters convert it to their native unit.

Only `stdio` and streamable `http` are portable v1 transports. SSE, WebSocket,
dynamic header commands, static secrets, tool approval policies, and custom OAuth
client credentials are rejected. Remote OAuth uses each target's normal automatic
OAuth flow when no authorization header is provided.

Adapters translate the portable fields to their native configuration: Claude,
Codex, Gemini, and OpenCode all support local stdio servers and remote HTTP
servers. An adapter must report an error rather than silently drop an MCP field
or write a resolved secret when its native format cannot safely express an
environment-backed header.

## Generation

The core discovers and normalizes canonical definitions, including skills,
rules, agents, commands, MCP fragments, and memories. Target adapters declare
their capabilities and render only their own target tree.

`generate` fully rebuilds selected target outputs. Users do not edit target
outputs, so the CLI deletes and recreates the complete target directory or file:

| Target | Rebuilt output |
| --- | --- |
| Base projection | `AGENTS.md` (always generated) |
| `claude` | `.claude/`, `CLAUDE.md`, and `.mcp.json` |
| `codex` | `.codex/` |
| `gemini` | `.gemini/` and `GEMINI.md` |
| `opencode` | `.opencode/` and `opencode.json` |

There is no generated-output ledger, `clean` command, or `--force` mode.
`generate --check` renders to a temporary location and compares the complete
expected target output without changing the project. Unsupported canonical items
are warnings by default and errors with `--strict`.

### Git Ignore Block

`init` creates and owns this exact block in the client project's `.gitignore`:

```gitignore
# BEGIN agentsrc generated
.agents/state/
.claude/
.codex/
.gemini/
.opencode/
AGENTS.md
CLAUDE.md
GEMINI.md
opencode.json
.mcp.json
# END agentsrc generated
```

The block ignores local state and every generated target path. Users must not
edit it. The CLI never changes other `.gitignore` lines; `init` and writing
commands restore the block when needed, while `validate` reports a changed or
missing block as an error.

## CLI

```text
agentsrc init [--targets claude,codex,gemini,opencode]
agentsrc validate [--strict]
agentsrc generate [target...] [--check] [--strict]
agentsrc status

agentsrc module add <module-name> [--local <path>] [--github <owner/repo>]
agentsrc module list
agentsrc module remove <module-name>
agentsrc module update <module-name>
```

`validate` checks manifests, dependency graphs, MCP fragment schemas, canonical
metadata, payload paths, broken module links, collisions, target compatibility,
and the managed `.gitignore` block without writing. `status` reports installed
modules, broken links, and target output drift.

## Delivery Plan

1. Build the TypeScript CLI foundation: schemas, diagnostics, safe filesystem
   operations, `init`, `validate`, and the mandatory `.agents` storage rule.
2. Implement generic module installation, dependency resolution, source
   fallback, transactional update/removal, and the module registry. Test copied
   and symlinked payloads, cycles, collisions, broken links, rollback, blocked
   dependency removal, and stale-file removal.
3. Implement canonical discovery and the OpenCode adapter first. Add exact
   fixtures for full target rebuilds, stdio and HTTP MCP projection, and
   `generate --check`.
4. Implement `AGENTS.md`, Claude, Codex, and Gemini adapters using current
   upstream documentation recorded beside each adapter.
5. Add end-to-end fixtures, the managed `.gitignore` block, CI for
   `validate --strict` and `generate --check`, representative example projects,
   module-authoring documentation, and a prerelease validated on real projects.

## Out Of Scope For V1

- Hosted registries, publishing, signatures, authentication, or telemetry.
- Executable install hooks or automatically running module scripts.
- Remote state sync or mutation of agent runtime memory by the CLI.
- User-authored target adapters or automatic target detection.

## MVP Done

The MVP initializes `.agents/`, installs, updates, and removes generic modules
from default, local, and GitHub sources; rebuilds all selected target outputs
from canonical content; keeps agent data in `.agents/`; and verifies the result
in CI without mutating the working tree.
