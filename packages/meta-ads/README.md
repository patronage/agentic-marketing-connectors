# @patronage/meta-ads

Worker-safe Meta paid ads reporting primitives for Patronage Core.

This package is the public-shaped paid counterpart to `@patronage/meta-social`. It exposes read/reporting surfaces plus explicit write contracts for guarded campaign deployment, boosts, audiences, Lead Ads, Conversions API, and token/account utilities. Local execution mode and run logs live in `@patronage/cli`.

## Runtime Boundary

The root import is safe to load in Worker runtimes without `nodejs_compat`:

```ts
import { createMetaAdsClient } from "@patronage/meta-ads";
```

Runtime code uses caller-provided auth material and `fetch`. It does not read environment variables, import `dotenv`, import `automation/meta`, load local client config, create module-level clients, or use Node-only APIs.

## Provider Library Spike

The official Meta Business SDK (`facebook-nodejs-business-sdk`) remains the main candidate for a later paid package spike because it covers Marketing API object surfaces. This first slice keeps direct fetch REST because the required read/reporting edges are narrow and the SDK's broad generated model, mutation-heavy surface, and Worker import/runtime behavior still need explicit proof before adoption.

## Basic Usage

```ts
const client = createMetaAdsClient({
  accessToken,
  adAccountId: "act_123",
});

const adsets = await client.getInsights({
  level: "adset",
  since: "2026-03-31",
  until: "2026-03-31",
});
```

Validate a boost plan without network access:

```ts
import { buildBoostPostPlan } from "@patronage/meta-ads";

const plan = buildBoostPostPlan({
  budget: 50,
  days: 2,
  pageId: "123",
  postId: "123_456",
});
```
