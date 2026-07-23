# Module Authoring

An agentsrc module is data only. Do not include install hooks, adapter code, or executable setup steps.

```text
modules/release-workflow/
  module.json
  rules/release.md
  skills/release/SKILL.md
  skills/release/scripts/check.sh
```

Every path except `module.json` installs to the same relative path beneath a client project's `.agents/` directory. A module payload must live below `agents/`, `commands/`, `config/`, `mcps/`, `rules/`, or `skills/`; arbitrary top-level directories are rejected. Modules cannot ship user-owned files under `.agents/artifacts/`, `.agents/docs/`, or `.agents/state/`.

A module may ship a non-secret initial configuration file below `config/`. On add or update, agentsrc copies the config file only when the consumer's target file is absent. It never overwrites, symlinks, or removes config files; after initial installation they are consumer-owned. A module skill may create or update consumer-owned files in those directories only when the user explicitly invokes the workflow. Keep module-specific mutable data under `.agents/state/<module-name>/` and user-facing outputs under `.agents/artifacts/<workflow>/`.

```json
{
  "name": "release-workflow",
  "description": "Release preparation workflow.",
  "dependencies": ["memory-system"],
  "files": [
    "rules/release.md",
    "skills/release/SKILL.md",
    "skills/release/scripts/check.sh"
  ]
}
```

Names use lowercase letters, numbers, and hyphens. `files` must list every payload file exactly, relative to the module root; it excludes `module.json`. Dependencies resolve from the same source repository before falling back to the agentsrc catalog. Each resolved module is pinned by its Git commit SHA in the consumer manifest, while this source manifest remains the owner of its dependencies and payload paths. Keep module files portable: the CLI installs local non-config sources as relative symlinks, while config files and downloaded sources are copied.

## Environment Variables

Every module skill must document a safe project-root `.env` wrapper for commands that require environment variables. The wrapper must use Node's `--env-file` support rather than `source` or `eval`, preserve inherited environment values over `.env` values, and never print or persist secret values. The skill should define the wrapper once per shell session and use it for every credential-dependent command.

```sh
with_project_env() {
  if [ -f .env ]; then
    node --env-file=.env -e '
      const { spawn } = require("node:child_process")
      const [command, ...args] = process.argv.slice(1)
      const child = spawn(command, args, { stdio: "inherit", env: process.env })
      child.once("error", (error) => { console.error(error.message); process.exit(1) })
      child.once("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
    ' -- "$@"
  else
    "$@"
  fi
}
```

Local module sources must be clean Git worktrees. `agentsrc module add` and `agentsrc module update` reject uncommitted source changes, then record the current commit SHA. Commit a source change before updating a consumer project.

Test modules with a temporary client project using `agentsrc module add`, `agentsrc validate --strict`, `agentsrc module update`, and `agentsrc module remove`.
