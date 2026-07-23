# Jira Workflow

Read the ticket, identify acceptance criteria, implement the smallest correct change, and verify the result before reporting completion.

## Project Environment

When this workflow needs an environment variable, run the command through this helper. It loads the project-root `.env` when present without sourcing or evaluating it, preserves inherited environment values over `.env` values, and never prints secret values. Define it once for the current shell session, then use it for every credential-dependent command.

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
