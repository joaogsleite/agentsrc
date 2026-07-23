# Example Project

`nextjs-app` is a realistic Next.js App Router project used as the live test harness for the first-party `cloudflare-tunnel` module. It models a feedback-review workspace that a product team shares with remote reviewers through a temporary Cloudflare Tunnel and can use to exercise its public feedback endpoint locally.

The module is installed from this checkout with relative symlinks. Changes to its rule, skill, script, or asset payload are immediately reflected in the example.

Run the complete workflow from the repository root:

```sh
npm run test:examples
```

The command copies each example into an isolated temporary client project, runs `validate --strict`, regenerates every configured target, and verifies `generate --check`. Copying follows the example symlinks, so it tests the current module content without changing the checked-in examples.

To exercise the tunnel workflow manually, work from the example directory:

```sh
cd nextjs-app
npm install
node ../../bin.mjs validate --strict
node ../../bin.mjs generate
npm run dev
```

When a user requests a tunnel, the installed skill discovers the `dev` script, allocates a loopback port, and manages its runtime state below `.agents/state/`. It never stores credentials in the repository.
