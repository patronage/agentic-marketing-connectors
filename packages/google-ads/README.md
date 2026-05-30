# @patronage/google-ads

Worker-safe Google Ads REST primitives for Patronage Core.

This package is currently a workspace package, shaped for future open-source publication. It is not a full clone of `google-ads-api`; it supports the Google Ads workflows needed by Patronage tools while keeping the runtime boundary safe for Cloudflare Workers.

## Runtime Boundary

The root import is safe to load in Worker runtimes without `nodejs_compat`:

```ts
import { createGoogleAdsClient } from "@patronage/google-ads";
```

Runtime code uses `fetch` and explicit client construction. It does not read environment variables, create module-level Google Ads clients, or import Node-only Google Ads libraries.

## Basic Usage

```ts
import { createGoogleAdsClient } from "@patronage/google-ads";
import { getCampaignPerformance } from "@patronage/google-ads/reports";

const client = createGoogleAdsClient({
  auth: {
    async getAccessToken() {
      return accessToken;
    },
  },
  developerToken,
  loginCustomerId,
});

const campaigns = await getCampaignPerformance(client, {
  customerId: "1234567890",
  days: 30,
});
```

The connector accepts already-resolved auth material. Tenant policy, logical secret handles, run permits, approvals, and audit sinks belong in the calling Loop or broker layer.

## Migrating from `google-ads-api`

The upstream `google-ads-api` package is a useful semantic reference, but it is Node-oriented. Migrating code should move from long-lived `GoogleAdsApi` / `Customer` instances to explicit Worker-safe clients:

```ts
// Before
const customer = client.Customer({
  customer_id,
  refresh_token,
});

const rows = await customer.query(gaql);
```

```ts
// After
const client = createGoogleAdsClient({
  auth,
  developerToken,
  loginCustomerId,
});

const { rows } = await client.search({
  customerId,
  query: gaql,
});
```

Key differences:

- no module-level singleton client or customer;
- no `process.env` or `.env` loading in the connector;
- no runtime `customer.query()` compatibility shim;
- REST `searchStream` returns flattened rows from JSON batches, not a Node stream;
- writes must pass an explicit `validateOnly` value.

For reports, prefer package report helpers such as `getCampaignPerformance()`, `getKeywordPerformance()`, `getSearchTerms()`, and `getVideoPerformance()` when the workflow is supported. Those helpers normalize REST lower-camel rows and legacy snake-case parity fixtures into stable metric objects.

`getVideoPerformance()` is the Worker-safe helper for YouTube / video campaign reporting. It includes TrueView views, view rate, average CPV, and quartile completion metrics so channel reports do not have to infer video performance from CPC-only campaign rows. `getReachFrequencyPerformance()` adds campaign-level unique-user and average-frequency evidence for video reach checks.

## Writes

The first supported write workflow is campaign-level negative keyword creation through a typed helper. It defaults to validation mode:

```ts
import { addCampaignNegativeKeywords } from "@patronage/google-ads/workflows/negative-keywords";

await addCampaignNegativeKeywords(client, {
  campaignId: "111",
  customerId: "1234567890",
  keywords: [{ matchType: "PHRASE", text: "bad query" }],
});
```

Live execution requires `mode: "execute"`, but that is only a provider capability. The calling system must still enforce campaign-write authorization, approvals, and audit logging before executing mutations.

## Validation

The deterministic test suite does not call live Google Ads. Validate package changes with:

```bash
pnpm --filter @patronage/google-ads test
pnpm --filter @patronage/google-ads typecheck
```
