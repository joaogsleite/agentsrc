# Example Projects

The projects in this directory are the live test harness for first-party modules.

`typescript-web-app` and `product-design-workflow` install first-party modules from this checkout with relative symlinks. Edit a rule, skill, script, or asset under `modules/` and the linked payload changes immediately in those examples.

Run the complete workflow from the repository root:

```sh
npm run test:examples
```

The command builds AgentSrc, copies each example into an isolated temporary client project, runs `validate --strict`, regenerates every configured target, and verifies `generate --check`. Copying follows the example symlinks, so it tests the current module content without changing the checked-in examples.

To exercise a new module manually, install it into a compatible example from that example directory:

```sh
node ../../dist/cli.js module add my-module --local ../..
node ../../dist/cli.js validate --strict
node ../../dist/cli.js generate
```

Commit the resulting `.agents/.agentsrc.json` entry and relative links when the example should permanently cover that module.
