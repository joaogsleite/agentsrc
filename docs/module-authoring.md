# Module Authoring

An agentsrc module is data only. Do not include install hooks, adapter code, or executable setup steps.

```text
modules/release-workflow/
  module.json
  rules/release.md
  skills/release/SKILL.md
  skills/release/scripts/check.sh
```

Every path except `module.json` installs to the same relative path beneath a client project's `.agents/` directory. Module payloads cannot write `.agents/.agentsrc.json`, `.agents/config/`, `.agents/docs/`, `.agents/sessions/`, or `.agents/state/`; those paths are user-owned project knowledge or runtime data.

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
