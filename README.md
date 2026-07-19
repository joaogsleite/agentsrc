<div align='center' class='hidden'>
    <br/>
    <br/>
    <h3>agentsrc</h3>
    <p>Canonical coding-agent configuration for every supported coding tool.</p>
    <br/>
    <br/>
</div>

`agentsrc` keeps agent configuration in `.agents/` and generates ignored projections for Claude, Codex, Gemini, OpenCode, and `AGENTS.md`.

## Usage

```sh
npx agentsrc init --targets claude,codex,gemini,opencode
npx agentsrc module add memory-system
npx agentsrc validate --strict
npx agentsrc generate
```

Run `agentsrc --help` for all commands.

See [module authoring](docs/module-authoring.md) for the payload layout and safety rules.

## Project dotenv

For a local stdio MCP fragment with `transport.env`, generation creates a target-local POSIX wrapper. The wrapper reads the project-root `.env`, exports only the listed variable names, and starts the original MCP process without writing secret values to generated configuration. This works for Claude, Codex, Gemini, and OpenCode projections.

HTTP MCP headers cannot use a shell wrapper because the target client owns the HTTP connection. Those values must remain available through the target's normal environment mechanism.

## Shell Completions

```sh
agentsrc completions install
```

Restart the shell afterwards. Remove them with `agentsrc completions uninstall`.
