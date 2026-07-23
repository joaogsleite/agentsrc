# agentsrc Repository Guide

This repository is the source for `agentsrc`, a TypeScript CLI that maintains canonical coding-agent configuration in a consumer project's `.agents/` directory and generates target-specific projections for Claude Code, Codex, Gemini CLI, and OpenCode.

This file is hand-authored guidance for the agentsrc source repository. It is not generated consumer-project output.

## Source Layout

```text
src/
  cli.ts                 CLI commands and user-facing orchestration
  core/                  discovery, filesystem, manifests, validation
  modules/               module resolution and transactional lifecycle
  targets/               target adapters and generated-output planning
  *.test.ts              unit and integration tests
modules/<name>/          first-party module source payloads
schemas/                 versioned JSON schemas for manifests
docs/                    user-facing reference documentation
examples/                representative initialized consumer projects
```

- Keep CLI behavior in `src/`; do not put executable setup hooks in modules.
- Keep target-specific behavior behind `src/targets/<target>/adapter.ts`.
- Update the relevant target README when changing a target's supported features or output layout.
- Treat `schemas/` and Zod parsing in `src/core/manifest.ts` as the contract for project, module, and MCP manifests.

## Consumer Project Model

`.agents/` is the consumer project's canonical source of truth:

```text
.agents/
  .agentsrc.json         Project manifest: targets and installed modules
  agents/                Specialized agent definitions
  artifacts/             Ignored user-facing generated output
  commands/              Reusable command prompts
  config/                Tracked, durable non-secret configuration
  docs/                  Tracked project knowledge and INDEX.md
  mcps/                  Portable MCP fragments
  rules/                 Always-applicable instructions
  skills/                On-demand workflows
  state/                 Ignored temporary and module-specific state
```

Generated target folders and root instruction files are disposable projections. Consumer agents must edit `.agents/`, then run `agentsrc validate --strict` and `agentsrc generate`; they must not manually edit `.claude/`, `.codex/`, `.gemini/`, `.opencode/`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `opencode.json`, or `.mcp.json`.

## Storage Boundaries

Respect these boundaries whenever writing a skill or adding CLI behavior:

- `.agents/config/` is tracked shared configuration. Store durable, non-secret project values only.
- `.agents/docs/` is tracked curated documentation. `INDEX.md` is the durable entry point.
- `.agents/artifacts/` is ignored user-facing generated output: screenshots, reports, exports, and other deliverables belong here.
- `.agents/state/` is ignored temporary and module-specific state: PIDs, temporary ports, logs, lock files, temporary wrappers, process state, and module-scoped entries belong here.
- Secrets never belong in `.agents/artifacts/`, `.agents/config/`, `.agents/docs/`, `.agents/state/`, generated configuration, or module payloads. Reference environment-variable names or an existing secret-manager integration instead.
- Do not create runtime data in repository roots or generated target directories.

`init` owns the generated `.gitignore` block. Keep `.agents/artifacts/` and `.agents/state/` ignored while leaving `.agents/config/` tracked.

## Module Authoring

A module is a portable, data-only payload installed beneath a consumer's `.agents/` directory.

```text
modules/<module-name>/
  module.json
  rules/<name>.md
  skills/<skill-name>/SKILL.md
  skills/<skill-name>/references/<name>.md
  skills/<skill-name>/scripts/<name>.sh
```

`module.json` must match `schemas/module-v1.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/joaogsleite/agentsrc/main/schemas/module-v1.json",
  "name": "module-name",
  "description": "Focused workflow description.",
  "dependencies": [],
  "files": ["rules/example.md"]
}
```

Module rules:

- Use lowercase hyphenated names for module names and manifest dependencies.
- Every payload path must install below a canonical module directory: `agents/`, `commands/`, `mcps/`, `rules/`, or `skills/`. Do not create arbitrary top-level `.agents/` directories.
- Do not add install hooks, adapter code, package dependencies, or automatic executable setup.
- Never include `.agentsrc.json`, `artifacts/`, `config/`, `docs/`, or `state/` in a module payload. Those destinations are owned by the consumer project at runtime.
- A module skill may instruct an agent to create or update consumer-owned `.agents/artifacts/`, `.agents/config/`, `.agents/docs/`, or `.agents/state/` files when the user explicitly invokes that workflow; the module source itself must not ship those files.
- Keep modules portable. Local sources install as relative symlinks; catalog and GitHub sources install as copies.
- Keep module-specific tests out of `src/`. Test the module manually in a temporary consumer project with `agentsrc module add`, `validate --strict`, `generate`, `module update`, and `module remove` when applicable.

Write skills for agents: state trigger conditions in frontmatter, use imperative instructions, include concrete commands, preserve project conventions, and keep mutable runtime details in state rather than durable configuration.

## TypeScript And CLI Conventions

- Use ESM TypeScript with explicit relative `.ts` import extensions.
- Preserve strict TypeScript and `noUncheckedIndexedAccess`; do not weaken `tsconfig.json` to bypass an error.
- This repository uses errors as values. Expected failures return `Error | T`; callers check `instanceof Error` and return early. Use `fail()` and `AgentsrcError` for domain failures. Do not throw expected errors or introduce `try`/`catch` control flow.
- At external async boundaries, convert rejections to domain errors with `.catch((cause) => fail("context", cause))`.
- Keep happy paths flat with early returns and avoid unnecessary mutable variables.
- CLI commands use Goke and Zod. Preserve the existing command vocabulary and schema-based option parsing. Keep action behavior concise and use the injected `console` and `process` context.
- Do not add a color library; Goke provides colors if a CLI change needs them.

## Module Lifecycle

The CLI resolves first-party catalog modules from this repository's `modules/` directory. It can also install from a relative local source or a GitHub repository.

- `module add` resolves the full dependency closure before making changes.
- Installation rejects payload collisions and reserved consumer-owned destinations.
- Local module files are symlinked so source edits are immediately visible to the consumer, but add and update require a clean committed source worktree.
- Downloaded and catalog modules are copied.
- Add, update, and remove are transactional. Preserve that behavior when changing lifecycle code.
- A consumer manifest records only the requested module; dependency payloads are installed with it and inferred from the dependency graph.

## Validation And Testing

Run these after behavior or module-lifecycle changes:

```sh
npm test
npm run check
```

Also validate representative consumer configuration when changing adapters, discovery, manifests, or module installation:

```sh
npm run agents -- validate --strict
npm run agents -- generate
npm run agents -- generate --check
```

Use temporary directories in integration tests. Never require live credentials, external Cloudflare accounts, browsers, Docker daemons, or network access for the normal test suite.

## Change Discipline

- Read existing source, schemas, docs, and tests before changing behavior.
- Make the smallest correct change; do not add compatibility paths without a concrete consumer need.
- Preserve unrelated worktree changes. Do not revert user changes.
- Update `README.md` or `docs/` when public workflow, module authoring, storage semantics, or CLI behavior changes.
- Generated files in `examples/` should be regenerated through the CLI, never edited as authoritative source.
