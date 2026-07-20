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

Forward every command through it:

```sh
npm run agents -- init --targets claude,codex,gemini,opencode
npm run agents -- module add memory-system
npm run agents -- validate --strict
npm run agents -- generate
```

The Git dependency runs TypeScript source directly through its included `tsx` runtime. No `dist/` output or npm publishing is required.

Pin the Git dependency to a release tag or commit SHA when reproducibility matters.

## Local Development Override

Keep the Git dependency in every consumer repository. It is the portable default for collaborators and CI. When actively changing AgentSrc locally, replace only the installed copy with a symlink:

```sh
# Run once from the AgentSrc checkout
npm link

# Run from a consumer repository
npm link agentsrc
```

The consumer keeps its Git dependency in `package.json` and `package-lock.json`; `npm link agentsrc` changes only that machine's `node_modules/agentsrc` to point at the local checkout. Source changes are available immediately through the same command:

```sh
npm run agents -- validate --strict
```

After `npm install`, npm can restore the pinned Git dependency. Reapply the local override with `npm link agentsrc`. To stop using the local checkout, run `npm unlink agentsrc`; the next `npm install` restores the Git dependency.

See [module authoring](docs/module-authoring.md) for the payload layout and safety rules.

## Project dotenv

For a local stdio MCP fragment with `transport.env`, generation creates a target-local POSIX wrapper. The wrapper reads the project-root `.env`, exports only the listed variable names, and starts the original MCP process without writing secret values to generated configuration. This works for Claude, Codex, Gemini, and OpenCode projections.

HTTP MCP headers cannot use a shell wrapper because the target client owns the HTTP connection. Those values must remain available through the target's normal environment mechanism.

## Shell Completions

```sh
npm run agents -- completions install
```

Restart the shell afterwards. Remove them with `agentsrc completions uninstall`.
