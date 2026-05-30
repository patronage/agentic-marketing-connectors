# @patronage/linkedin-ads

Worker-safe LinkedIn Ads reporting primitives for Patronage Core.

This package provides Worker-safe LinkedIn Ads reads and explicit write contracts for token checks, campaign listing, ad analytics, campaign creation/status updates, boosted-post creatives, Lead Gen forms, and lead downloads. Local execution mode and run logs live in `@patronage/cli`.

## Runtime Boundary

The root import is safe to load in Worker runtimes without `nodejs_compat`:

```ts
import { createLinkedInAdsClient } from "@patronage/linkedin-ads";
```

Runtime code uses caller-provided auth material and `fetch`. It does not read environment variables, import `dotenv`, import `automation/linkedin`, create module-level clients, or use Node-only APIs.

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
