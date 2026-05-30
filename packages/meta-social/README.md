# @patronage/meta-social

Worker-safe Meta organic social Graph API primitives for Patronage Core.

This package covers Facebook Page and Instagram Business media reads used by content promotion, creative analysis, and boosting-report inputs. Paid account insights, Ad Library, audiences, leads, Conversions API, and mutations belong in `@patronage/meta-ads`.

## Runtime Boundary

The root import is safe to load in Worker runtimes without `nodejs_compat`:

```ts
import { createMetaSocialClient } from "@patronage/meta-social";
```

Runtime code uses caller-provided auth material and `fetch`. It does not read environment variables, import `dotenv`, import `automation/meta`, load local client config, create module-level clients, or use Node-only APIs.

## Provider Library Spike

The official `facebook-nodejs-business-sdk` / Meta Business SDK remains a candidate for the paid ads package, but this organic social first slice does not adopt it. The current needs are a small set of Graph API read edges, and the SDK brings a broad generated business object model plus Node/browser packaging that still needs explicit Cloudflare Worker import and module-load proof before it should sit behind a public package boundary.

Use the current fetch implementation until a later spike proves an SDK improves coverage without weakening the Worker-safe contract.

## Basic Usage

```ts
const client = createMetaSocialClient({ accessToken: pageAccessToken });

const posts = await client.getPagePosts({
  pageId: "416707608450706",
  since: "2026-03-31",
  until: "2026-03-31",
});
```

Pass a page token for Page/Instagram edges. If an appsecret proof is required, compute it outside this package and pass `appSecretProof` with the client options.
