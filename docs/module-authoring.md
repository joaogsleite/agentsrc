# Module Authoring

An agentsrc module is data only. Do not include install hooks, adapter code, or executable setup steps.

```text
modules/release-workflow/
  module.json
  rules/release.md
  skills/release/SKILL.md
  skills/release/scripts/check.sh
```

Every path except `module.json` installs to the same relative path beneath a client project's `.agents/` directory. Module payloads cannot write `.agents/.agentsrc.json`, `.agents/docs/`, `.agents/sessions/`, or `.agents/state/`; those paths are user-owned project knowledge or runtime data.

```json
{
  "name": "release-workflow",
  "description": "Release preparation workflow.",
  "dependencies": ["memory-system"]
}
```

Names use lowercase letters, numbers, and hyphens. Dependencies resolve from the same source repository before falling back to the agentsrc catalog. Dependency payloads are installed with the requested module but are not separate project-manifest entries. Keep module files portable: the CLI installs local sources as relative symlinks and downloaded sources as copied files.

Test modules with a temporary client project using `agentsrc module add`, `agentsrc validate --strict`, `agentsrc module update`, and `agentsrc module remove`.
