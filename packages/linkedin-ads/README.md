# @patronage/linkedin-ads

Worker-safe LinkedIn Ads reporting primitives for Patronage Core.

This package provides Worker-safe LinkedIn Ads reads and explicit write contracts for token checks, campaign listing, ad analytics, campaign creation/status updates, boosted-post creatives, Lead Gen forms, and lead downloads. Local execution mode and run logs live in `@patronage/cli`.

## Runtime Boundary

The root import is safe to load in Worker runtimes without `nodejs_compat`:

```ts
import { createLinkedInAdsClient } from "@patronage/linkedin-ads";
```

Runtime code uses caller-provided auth material and `fetch`. It does not read environment variables, import `dotenv`, import `automation/linkedin`, create module-level clients, or use Node-only APIs.

The package exposes two declared entry points: the root connector interface and `@patronage/linkedin-ads/deployment` for resumable compound writes. Raw provider requests and non-resumable compound execution are not part of the client interface. All provider adapters, response validation, optimization policy, and deployment helpers remain private implementation behind those interfaces.

## Provider Library Spike

The existing LinkedIn automation code is a local REST client rather than a reusable public SDK. No fetch-compatible LinkedIn Marketing API package in this repo currently replaces the narrow reporting edges without bringing CLI/env assumptions. Keep direct fetch REST until a later spike proves a public SDK is Worker-safe, actively maintained, and covers the Marketing API surfaces we need.

## Basic Usage

```ts
const client = createLinkedInAdsClient({
  accessToken,
  adAccountId: "urn:li:sponsoredAccount:123",
});

const rows = await client.getAnalytics({
  pivot: "CAMPAIGN",
  since: { year: 2026, month: 3, day: 31 },
  until: { year: 2026, month: 4, day: 1 },
});
```

The default `LinkedIn-Version` is `202606` and remains overridable with the `apiVersion` client option. LinkedIn sunsets monthly Marketing API versions; unsupported overrides are sent unchanged so the provider failure remains visible instead of being silently rewritten.

Successful read responses are validated before normalization. Malformed JSON or a `200` response without the expected `elements` collection fails explicitly rather than being converted into plausible empty reporting data.

Run the complete credentialed, read-only surface canary with an already configured client:

```ts
import { runLinkedInAdsReadCanary } from "@patronage/linkedin-ads";

const results = await runLinkedInAdsReadCanary(client, {
  analytics: {
    since: { year: 2026, month: 7, day: 1 },
    until: { year: 2026, month: 7, day: 2 },
  },
  organizationUrn: "urn:li:organization:123",
});
```

The canary performs no mutations. Creative and lead-response reads are marked as skipped when the account has no campaign or lead form to scope them to.

The example is directly executable in a Worker or local TypeScript runner when the host injects `accessToken`, `adAccountId`, and `organizationUrn`. The connector never loads those values itself. For repository verification without credentials, run:

```sh
pnpm --dir src/packages/linkedin-ads test -- read-canary.test.ts
```

For a credentialed release canary, inject the account, token, and organization scope explicitly:

```sh
LINKEDIN_ACCESS_TOKEN=... \
LINKEDIN_AD_ACCOUNT_ID=123 \
LINKEDIN_ORGANIZATION_URN=urn:li:organization:123 \
  pnpm --filter @patronage/linkedin-ads smoke:live
```

Optional `LINKEDIN_ADS_CANARY_SINCE` and `LINKEDIN_ADS_CANARY_UNTIL` values use `YYYY-MM-DD`. Treat any failed matrix row or unexpected skip as release evidence to review; the command exits nonzero on failure, is read-only, and must never be extended with mutation calls.

Validate a boost plan without network access:

```ts
import { buildBoostPostPlan } from "@patronage/linkedin-ads";

const plan = buildBoostPostPlan(
  {
    campaignGroup: "urn:li:sponsoredCampaignGroup:123",
    postUrn: "urn:li:share:456",
  },
  "urn:li:sponsoredAccount:123"
);
```

## Runnable tutorial

[`examples/preview-boost-plan.ts`](examples/preview-boost-plan.ts) builds a paused sponsored-post plan without credentials, network access, or a provider mutation.
