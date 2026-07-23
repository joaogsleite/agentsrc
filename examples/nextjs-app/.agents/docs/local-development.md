# Local Development And Remote Review

## Application

Install dependencies with `npm install`, then start the development server with `npm run dev`. The Next.js script accepts forwarded arguments, so a tunnel workflow can bind it safely to a selected loopback port with:

```sh
npm run dev -- -H 127.0.0.1 -p <port>
```

Use `npm run lint`, `npm run check`, and `npm run build` before merging application changes.

## Cloudflare Tunnel

The `cloudflare-tunnel` module is installed for explicit requests to share a local review session with remote reviewers or exercise the feedback endpoint from an external service. It discovers this project command, selects an ephemeral loopback port, and stores process records and logs only below `.agents/state/`.

Use a Quick Tunnel by default. It creates a temporary `trycloudflare.com` URL and must never be presented as a production deployment. For a persistent hostname, configure the non-secret hostname and environment-variable name in `.agents/config/cloudflare-tunnel.json`; never commit the token value or an origin URL.
