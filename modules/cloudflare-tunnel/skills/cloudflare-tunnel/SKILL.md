---
description: Start, inspect, restart, and stop temporary or persistent Cloudflare Tunnels for a local development project. Use when the user asks to expose a local app through Cloudflare or manage an existing project tunnel.
---

# Cloudflare Tunnel

Use this workflow only when the user asks to create or manage a Cloudflare Tunnel. Expose only the local service the user requested. Never run a production build or production server: use the project's development command.

## Storage

- `.agents/config/cloudflare-tunnel.json` is tracked, durable configuration for one persistent tunnel identity. Store only a hostname, token-variable name, and optional tunnel label. Never store an origin, port, process identifier, command, or secret value in it.
- `.agents/state/cloudflare-tunnel.json` is the sole ignored runtime-state record for this module. It represents exactly one managed tunnel and records the active origin and port, process metadata, PIDs, PM2 names or IDs, commands, URLs, log paths, Compose services, and whether each resource was started or reused. Never store secret values in it.
- Store logs and short-lived wrappers under `.agents/state/cloudflare-tunnel/`.

For the first successful persistent tunnel, create `.agents/config/cloudflare-tunnel.json` with this shape. This module manages one hostname only.

```json
{
  "formatVersion": 1,
  "hostname": "preview.example.com",
  "tokenEnv": "CLOUDFLARE_TUNNEL_TOKEN",
  "tunnelName": "optional-cloudflare-tunnel-name"
}
```

`tokenEnv` is the name of the environment variable containing the existing remotely managed tunnel token. It is not the token itself. `tunnelName` is optional metadata and is never used as a credential.

After a tunnel starts, create or update `.agents/state/cloudflare-tunnel.json` with this shape. This is the only state file for this module; keep the active origin and every process identifier here, not in persistent config.

```json
{
  "formatVersion": 1,
  "mode": "persistent",
  "hostname": "preview.example.com",
  "origin": "http://127.0.0.1:43127",
  "port": 43127,
  "processes": [
    {
      "role": "app",
      "manager": "pm2",
      "pm2Name": "agentsrc-example-app",
      "pid": 12345
    },
    {
      "role": "tunnel",
      "manager": "pm2",
      "pm2Name": "agentsrc-example-tunnel",
      "pid": 12346
    }
  ]
}
```

## Port Allocation

For every new temporary development-server process, allocate an available loopback port and save it in runtime state. Reuse a live module-managed process from state rather than starting a second instance. On a later fresh start, allocate a new port.

Use the operating system to select an ephemeral port instead of guessing from a fixed range:

```sh
PORT="$(node -e 'const net = require("node:net"); const server = net.createServer(); server.listen(0, "127.0.0.1", () => { process.stdout.write(String(server.address().port)); server.close() })')"
```

Port allocation is inherently a race. Start the server immediately with its explicit port; if it reports that the port is already in use, select another port and retry. Never terminate another project to claim a port. Record the final port, origin, command, process manager, and readiness URL in `.agents/state/cloudflare-tunnel.json`.

For a persistent remotely managed tunnel, the active origin is runtime state. Reuse a healthy recorded origin when possible; otherwise allocate a new port and record it only in state. Start `cloudflared` with that origin using `--url` where the tunnel configuration permits it. An existing tunnel token cannot update remote ingress rules: if Cloudflare has ingress rules, `--url` does not override them. Probe the public hostname and report an ingress mismatch instead of writing an origin into persistent config.

## Preflight

1. Read `.agents/docs/INDEX.md`, all `.agents/rules/*.md`, and project documentation relevant to local development.
2. Read `.agents/config/cloudflare-tunnel.json` and `.agents/state/cloudflare-tunnel.json` when present. Reconcile the one recorded tunnel's PIDs with `kill -0` and PM2 entries with `pm2 describe`; remove only stale records created by this workflow.
3. Inspect project evidence before choosing commands: package-manager files and `package.json` scripts, Compose files, framework files, Makefiles, and documented setup instructions. Check an existing state entry before starting anything.
4. Inspect the exact development script before starting it. Prefer a project-provided `dev` script such as `npm run dev`, `pnpm dev`, or `bun run dev`; never substitute `build` plus `start`.
5. Start required dependencies before the app. Use documented Compose or service commands when present. Do not invent database credentials, migrations, seed data, or startup commands. Ask the user only if the project does not document how a required dependency starts.
6. Bind the exposed HTTP server to loopback unless the project's documented command requires otherwise. Probe its local readiness endpoint before creating a tunnel.
7. Resolve the official `cloudflared` binary with `command -v cloudflared` and verify it with `cloudflared --version`. Never use `npm`, `npx`, `bunx`, or a Node `cloudflared` wrapper: Cloudflare does not distribute the connector through npm.
8. If the official binary is absent and the user requested a tunnel to be started, identify the operating system and install it with the official native package source. On macOS use `brew install cloudflared`. On Linux and Windows, follow Cloudflare's official package or release instructions. Verify the installed binary before continuing. Do not install it as a system background service; this workflow manages individual connector processes.

## Development Server Port

Always select and record an explicit port for a new non-Compose development server. The port argument must reach the underlying framework command, not merely the package manager.

- With npm, forward framework arguments after `--`: `npm run dev -- <framework arguments>`.
- For a detected Next.js `next dev` script, use `npm run dev -- -H 127.0.0.1 -p <port>`. `--port <port>` is equivalent, but use `-p` in commands for consistency.
- For a detected Vite script, use `npm run dev -- --host 127.0.0.1 --port <port> --strictPort`.
- Use `PORT=<port> npm run dev` only when the project's detected framework or script explicitly supports the `PORT` environment variable. Do not assume every development command honors it.
- If a script hard-codes a port or rejects forwarded port arguments, inspect its underlying command and documented configuration. Do not start it on an untracked default port or kill another project; report the unsupported override when no documented mechanism exists.
- After startup, verify the selected loopback port responds and record the actual listener in `.agents/state/cloudflare-tunnel.json`. If the process reports a bind collision or listens on a different port, stop only that module-managed process, allocate another port, and retry with the correct override.

## Token Resolution

For a persistent tunnel, resolve the configured `tokenEnv` without displaying or writing its value.

1. Validate that `tokenEnv` matches `^[A-Za-z_][A-Za-z0-9_]*$`.
2. First use the current process environment.
3. If it is unset, read the project-root `.env` with Node's `--env-file` option. Do not `source`, `eval`, print, copy, or commit `.env`; it can contain arbitrary shell syntax and unrelated secrets.
4. Export the resolved value only to the command that starts `cloudflared`. Do not include it in a command string, PM2 process name, log, state file, config file, or user-facing response.
5. If the variable is unavailable, report its name and the expected locations. Do not ask the user to paste a secret into logs or project configuration.

Use this pattern when Node 20 or newer is available. It reads the inherited environment first, then only reads `.env` when the variable is unset and the file exists:

```sh
TOKEN_VALUE="$(node -e 'const value = process.env[process.argv[1]]; if (value) process.stdout.write(value)' "$TOKEN_ENV")"
if [ -z "$TOKEN_VALUE" ] && [ -f .env ]; then
  TOKEN_VALUE="$(node --env-file=.env -e 'const value = process.env[process.argv[1]]; if (value) process.stdout.write(value)' "$TOKEN_ENV")"
fi
[ -n "$TOKEN_VALUE" ] || exit 1
```

The inherited environment takes precedence over `.env`. If neither contains the variable, the command exits without revealing secret content. Do not write the value to a shell history, command-line argument, wrapper file, or PM2 name.

## Temporary Tunnel

Use a Quick Tunnel unless the user explicitly asks for a persistent hostname.

1. Start the discovered development server directly in the background with `nohup`, writing logs below `.agents/state/cloudflare-tunnel/` and recording its PID and readiness URL in state.
2. Wait until the local HTTP origin responds successfully.
3. Start `cloudflared tunnel --url <origin>` directly in the background, with a separate state log.
4. Parse the generated `trycloudflare.com` URL from the tunnel log, probe it, and report it to the user.
5. Record the public URL, origin, both processes, commands, log paths, and start time in state. Do not write `.agents/config/cloudflare-tunnel.json` for a temporary tunnel.

Quick Tunnels are for development and testing only. They are temporary, have a random hostname, do not support SSE, and must not be presented as a production deployment.

## Compose Projects

Use Docker Compose as the lifecycle manager for containerized dependencies and apps. Do not wrap containers with PM2.

1. Inspect the Compose files and run `docker compose config --services` to identify services without printing resolved environment values. Inspect declared profiles before selecting one.
2. Run `docker compose ps` before `up`. Record already-running services as `reused`; they are not owned by this workflow and must never be stopped by it.
3. For an application with a dedicated development database profile, start only its documented database services, for example `docker compose --profile dev up -d postgres`. Wait for the service to be running and healthy when the Compose file defines a health check before starting the local app process.
4. For a fully containerized application, run the documented `docker compose up -d` command only when required services are not already running. Wait for the HTTP proxy service to be ready.
5. Resolve a containerized HTTP origin from the proxy service's published port, for example `docker compose port nginx 80`, then normalize it to `http://127.0.0.1:<port>`. Do not tunnel directly to a database, PHP-FPM, or an unpublished container port.
6. If a Compose HTTP port collides, use a documented environment-variable port override when the project provides one. Do not rewrite tracked Compose files or stop another project. Report a hard-coded collision that the project does not support overriding.
7. Record the Compose project, service names, ownership, resolved origin, and published port in runtime state. On stop, run `docker compose stop` only for services marked `started` by this workflow.

### Next.js With A Compose Database

When a Next.js project has `npm run dev` and a Compose `dev` profile for PostgreSQL:

1. Reuse a live managed Next.js process when state confirms its local readiness.
2. Otherwise start only the documented PostgreSQL service with its `dev` profile, such as `docker compose --profile dev up -d postgres`, and wait for it to be available.
3. Allocate an available port and start Next.js as `npm run dev -- -H 127.0.0.1 -p <port>`. If the selected port races, retry with a newly allocated port.
4. Store the PostgreSQL service ownership, Next.js PID or PM2 name, final port, and `http://127.0.0.1:<port>` origin in state before opening the tunnel.

### WordPress With Compose

When Compose defines PHP, MySQL, and Nginx services:

1. Inspect `docker compose ps`; if the required services are running, reuse them and derive the Nginx published HTTP port.
2. Otherwise run the documented Compose command to start the application stack, normally `docker compose up -d`, and wait for MySQL and Nginx readiness.
3. Use the Nginx host port as the origin. Do not start `npm run dev`, PHP's built-in server, or a second Nginx process.
4. Record ownership per Compose service and tunnel the Nginx origin only.

### Vite Without A Database

When the selected `package.json` script starts Vite:

1. Allocate an available port for a new process.
2. Start it with forwarded arguments: `npm run dev -- --host 127.0.0.1 --port <port> --strictPort`.
3. If Vite reports the port as unavailable, allocate another port and retry. Do not allow Vite to silently choose an unrecorded port.
4. Record the final port, PID or PM2 name, origin, readiness URL, command, and log path before opening the tunnel.

## Persistent Tunnel

Use this path only when the user explicitly requests a persistent hostname.

1. Require an existing remotely managed tunnel and a configured public hostname. A tunnel token can run that tunnel but cannot create it, modify its Cloudflare ingress rules, or create DNS records.
2. Confirm the configured `hostname` and `tokenEnv` with the user if persistent config does not exist. Determine the active origin from the one healthy state record or the newly started development service.
3. Verify the local origin before starting the tunnel. Pass the state origin with `--url` when the tunnel has no remote ingress rules. If a remote ingress rule takes precedence, verify the public hostname and report a mismatch rather than persisting the origin.
4. Resolve `tokenEnv` from the environment or project-root `.env` according to **Token Resolution**.
5. Use PM2 for every non-Compose app process and the connector process. Use a project-specific, collision-resistant PM2 prefix derived from the project root and hostname. For non-Node commands, use PM2's shell interpreter rather than changing the project's runtime. Docker Compose remains the manager for containerized app and database services.
6. Start `cloudflared tunnel run --url <state-origin>` through a short ignored wrapper in `.agents/state/cloudflare-tunnel/`. Pass the configured environment-variable name, not its value, to the wrapper. The wrapper must read that variable, set Cloudflare's `TUNNEL_TOKEN` environment variable, and run the connector without a `--token` command-line argument. Never interpolate the token into the PM2 command, wrapper contents, logs, state, or config.
7. Confirm PM2 reports both processes online, probe the local origin, then probe `https://<hostname>`. Record PM2 names or IDs, PIDs, commands, origin, port, hostname, logs, and start time in state.
8. Write or update the one non-secret persistent config object after startup. Do not add runtime origin or process data to it.

When a project uses Docker Compose for a database or another dependency, let Compose manage its own containers and record their service names in state. PM2 manages the development app and `cloudflared`; it does not replace Compose.

## Lifecycle

- **status**: Reconcile state, inspect PM2 or PIDs, probe the local origin and public URL or hostname, and report actionable failures.
- **restart**: Reuse the stored mode and non-secret metadata. For a persistent connector, resolve `tokenEnv` again before restarting it.
- **stop**: Stop only PM2 entries, PIDs, and Compose services explicitly recorded as managed by this workflow. Remove `.agents/state/cloudflare-tunnel.json`. Do not remove persistent config or Cloudflare-side resources unless the user explicitly requests it.
- **switch mode**: Stop the recorded temporary processes before creating a persistent process pair. Replace the sole runtime-state record and preserve persistent configuration when temporarily stopping its processes.

Do not start a second tunnel when `.agents/state/cloudflare-tunnel.json` records a healthy one; reuse it or stop it before replacing it. Do not stop a process merely because it uses the same port. A state file that does not identify a process as module-managed is not authorization to terminate it.
