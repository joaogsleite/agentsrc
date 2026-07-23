# Module Authoring

An agentsrc module is data only. Do not include install hooks, adapter code, or executable setup steps.

```text
modules/release-workflow/
  module.json
  rules/release.md
  skills/release/SKILL.md
  skills/release/scripts/check.sh
```

Every path except `module.json` installs to the same relative path beneath a client project's `.agents/` directory. A module payload must live below `agents/`, `commands/`, `mcps/`, `rules/`, or `skills/`; arbitrary top-level directories are rejected. Modules cannot ship user-owned files under `.agents/artifacts/`, `.agents/config/`, `.agents/docs/`, or `.agents/state/`.

A module skill may create or update consumer-owned files in those directories only when the user explicitly invokes the workflow. Keep module-specific mutable data under `.agents/state/<module-name>/` and user-facing outputs under `.agents/artifacts/<workflow>/`.

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

Names use lowercase letters, numbers, and hyphens. `files` must list every payload file exactly, relative to the module root; it excludes `module.json`. Dependencies resolve from the same source repository before falling back to the agentsrc catalog. Each resolved module is pinned by its Git commit SHA in the consumer manifest, while this source manifest remains the owner of its dependencies and payload paths. Keep module files portable: the CLI installs local sources as relative symlinks and downloaded sources as copied files.

Local module sources must be clean Git worktrees. `agentsrc module add` and `agentsrc module update` reject uncommitted source changes, then record the current commit SHA. Commit a source change before updating a consumer project.

Test modules with a temporary client project using `agentsrc module add`, `agentsrc validate --strict`, `agentsrc module update`, and `agentsrc module remove`.
