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
npx agentsrc init --targets agents-md,claude,codex,gemini,opencode
npx agentsrc module add memory-system
npx agentsrc validate --strict
npx agentsrc generate
```

Run `agentsrc --help` for all commands.

## Shell Completions

```sh
agentsrc completions install
```

Restart the shell afterwards. Remove them with `agentsrc completions uninstall`.
