# Cloudflare development from a Claude Code Cloud session

Findings from setting this repo up end-to-end. Every item below was an actual
blocker, verified by hitting it.

## 1. Network egress

Cloud sessions run behind a policy proxy. The default "trusted" policy allows
GitHub and npm but **blocks every Cloudflare domain**.

Whitelist:

```
*.cloudflare.com
*.workers.dev
*.cloudflarestorage.com
```

Minimum viable is `api.cloudflare.com` alone — `https://api.cloudflare.com/client/v4`
is the base for all Wrangler operations. The rest, by need:

| Domain | Needed for |
| --- | --- |
| `api.cloudflare.com` | **Required.** All deploys and API calls |
| `dash.cloudflare.com`, `welcome.developers.workers.dev` | `wrangler login` OAuth (skip if using `CLOUDFLARE_API_TOKEN`) |
| `*.workers.dev` | Reaching your deployed Worker |
| `developers.cloudflare.com` | Docs |
| `registry.cloudflare.com` | Workers Containers image push |
| `*.r2.cloudflarestorage.com`, `catalog.cloudflarestorage.com` | R2 S3 API / Data Catalog |

Deliberately omitted: `sparrow.cloudflare.com` is telemetry — set
`CLOUDFLARE_TELEMETRY_DISABLED=1` instead. `workers.cloudflare.com` appears only
in doc links, never in request paths.

Already allowed, no action needed: `github.com`, `codeload.github.com`,
`raw.githubusercontent.com`, `registry.npmjs.org`. Package registries bypass the
proxy entirely, which is why `npm install` and the `workerd` binary download work
before any whitelisting.

## 2. MCP server

Installing the Cloudflare plugin in the **desktop app** does not reach cloud
sessions — that config lives on the local machine. Cloud sessions only see
connectors added at **claude.ai → Settings → Connectors**. These are brokered
through `mcp-proxy.anthropic.com`, which is in the proxy bypass list, so the
connector works without whitelisting `*.mcp.cloudflare.com`.

## 3. GitHub access

Two independent grants, easily confused:

- **OAuth user authorization** — identity. Determines what Claude can *enumerate*.
  Not repo-scoped; no per-org control exists.
- **GitHub App installation** — per account/org, with its own repo selection.
  Determines what Claude can actually *read and push*.

A push failing with 403 while tooling reports `can_push: true` means the OAuth
grant exists but the App isn't installed on that account. Install at
`github.com/apps/claude/installations/select_target`.

Work/personal separation: installations are fully independent per account, so a
personal install grants nothing at work. But repo *enumeration* rides on your
user identity and spans every org you belong to. Only separate GitHub accounts
close that; session-level repo scoping limits operations but not enumeration.

## 4. Toolchain gotchas

**`compatibility_date` cannot be today's date.** The bundled `workerd` lags the
calendar. Exceeding it fails at startup with:

```
This Worker requires compatibility date "...", but the newest date supported
by this server binary is "...".
```

Use the date the error names.

**npm 10.9.x crashes** on this dependency graph with
`Cannot read properties of null (reading 'edgesOut')`. Use `--legacy-peer-deps`,
or npm 12. The resolved tree is correct either way.

**`@cloudflare/vitest-pool-workers` 0.22 removed the `/config` subpath.**
`defineWorkersConfig` is gone; configuration is now a Vite plugin:

```ts
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
});
```

It requires vitest ^4 (not 5), and `cloudflare:test` types come from adding
`@cloudflare/vitest-pool-workers/types` to `tsconfig.json` `types`.

**`worker.fetch()` needs an incoming-typed request** in tests:

```ts
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;
```

## 5. Deploying

Locally, the normal path:

```sh
npx wrangler login && npm run deploy
```

From a cloud session without a `CLOUDFLARE_API_TOKEN`, deploying is still
possible through the Cloudflare MCP connector, which holds its own OAuth:

1. `POST /accounts/{id}/workers/scripts/{name}/assets-upload-session` with a
   manifest of `{ "/path": { hash, size } }`. The hash is
   `blake3(base64(contents) + extension).hex().slice(0, 32)`.
2. `POST /accounts/{id}/workers/assets/upload?base64=true` with the returned
   JWT as a bearer token (this step needs direct HTTPS, not the MCP, since the
   JWT is the credential).
3. `PUT /accounts/{id}/workers/scripts/{name}` as multipart, with the completion
   JWT in `metadata.assets.jwt` and an `assets` binding.
4. `POST /accounts/{id}/workers/scripts/{name}/subdomain` with `enabled: true`.

Deployed and verified at https://hello-world.bryce-lohr.workers.dev
