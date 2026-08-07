# @patronage/x-posts

Worker-safe X authored-post ingestion primitives for Patronage Core.

This package is the public-shaped X authored-post core. It supports promotion intake and boosting-report workflows that need recent authored posts, media hints, and engagement metrics without a browser session or CLI bootstrap.

## Runtime Boundary

The root import is safe to load in Worker runtimes without `nodejs_compat`:

```ts
import { listRecentPosts } from "@patronage/x-posts";
```

Runtime code uses `fetch` and explicit function inputs. It does not read environment variables, import `dotenv`, create module-level clients, or depend on the local `@patronage/cli` package.

Local operator access lives in the shared Patronage CLI:

```bash
patronage x posts list --handle ExampleCommunityFund --since 2026-03-31 --until 2026-03-31 --format json
patronage x posts compare --handle ExampleCommunityFund --since 2026-03-31 --until 2026-03-31
```

## Provider Library Spike

The official X TypeScript SDK (`@xdevplatform/xdk`) is a plausible future candidate because it is positioned for TypeScript and fetch-capable runtimes. This first slice does not adopt it because the existing authored-post workflow needs only two small request shapes, while the SDK currently adds a broader OAuth/client surface and a `node-fetch` peer dependency that should be proven in Worker import tests before adoption.

Use the current fetch implementation until a later spike proves the SDK materially improves coverage without weakening the Worker-safe boundary.

## Basic Usage

```ts
const result = await listRecentPosts({
  handle: "ExampleCommunityFund",
  since: "2026-03-31",
  until: "2026-03-31",
  xApiBearerToken,
});
```

`x-api` is the preferred authored-post path when `xApiBearerToken` is present. `xai-grok` remains available as a secondary comparison provider when `xAiApiKey` is provided.

## Runnable tutorial

[`examples/recent-post-intake.ts`](examples/recent-post-intake.ts) includes a synthetic credential-free run and the same function shape used with a caller-resolved provider credential.
