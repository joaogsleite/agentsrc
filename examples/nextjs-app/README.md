# Review Loop

Review Loop is a small Next.js App Router workspace for collecting focused feedback on a product release. It is intentionally useful beyond a toy page: a product owner can run it locally, share it with remote reviewers through a temporary Cloudflare Tunnel, and receive feedback through a public API route without committing a tunnel URL or credential.

## Local development

```sh
npm install
npm run dev
```

Run checks before changing the app:

```sh
npm run lint
npm run check
npm run build
```

## Agent configuration

`.agents/` is the canonical configuration for coding agents. The project uses all supported agentsrc targets and has the local `cloudflare-tunnel` module installed from this repository.

```sh
node ../../bin.mjs validate --strict
node ../../bin.mjs generate
node ../../bin.mjs generate --check
```

Ask an agent to expose the local app only when a reviewer needs access. The tunnel skill uses the `dev` script with an explicit loopback host and ephemeral port, records only runtime data under `.agents/state/`, and keeps secrets out of the project.

The feedback endpoint is `POST /api/feedback`. It is deliberately in-memory for this example; production applications should validate authentication, authorize the sender, and persist feedback through their own service.
