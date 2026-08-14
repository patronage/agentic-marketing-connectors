# Hello World: Campaign Snapshot

Start here if you want to see what using `@patronage/google-ads` feels like in a real app.

This example fetches one Google Ads campaign snapshot and returns a small JSON payload you could use in a dashboard card, a cron job, or a server-side reporting route. It is intentionally small, but it is shaped like real application code.

The point is simple: you own auth, routing, and delivery. The library handles the Google Ads request and gives you app-ready data back.

## What Problem This Solves

Use this when your app needs to answer a simple marketing question:

> What is our top-spending campaign doing right now?

The example makes one read-only Google Ads query, picks the top-spending campaign from the last 30 days, and returns normalized JSON with the campaign name, spend, impressions, clicks, and conversions.

That is a small problem, but it is a real one. Internal marketing tools, lightweight reporting endpoints, and daily health checks all need this exact shape of data.

## Where It Fits In A Real App

The reusable code lives in [src/campaign-snapshot.ts](./src/campaign-snapshot.ts). Put that function behind a server route, Worker handler, or job runner, not browser client code.

Typical places this fits:

- a `/api/google-ads/campaign-snapshot` route for an internal dashboard;
- a scheduled Worker or cron that posts a daily summary;
- a health-check endpoint that powers alerts or reporting automation.

## From Checkout To Output

From the repository root:

```bash
corepack enable
pnpm install
pnpm --filter @patronage/example-hello-world-connector start
pnpm --filter @patronage/example-hello-world-connector typecheck
```

Requirements:

- Node.js `24.x`
- `pnpm` via Corepack (`packageManager` in the repository root)

No environment variables are required for the default run. The `start` path uses synthetic data and a fake `fetch` implementation, so you can see the integration shape immediately.

Run command:

```bash
pnpm --filter @patronage/example-hello-world-connector start
```

Expected output:

```json
{
  "mode": "demo",
  "campaignName": "Spring Donor Drive | Search",
  "clicks": 128,
  "conversions": 6,
  "customerId": "1234567890",
  "impressions": 3120,
  "requestId": "example-request-id",
  "spend": 245.5
}
```

## Switch From Demo To Live

The demo run uses `createDemoClient()`, which supplies a fake access token, fake developer token, and fake `fetch` response. For a live setup, keep `fetchCampaignSnapshot()` and replace only the client construction.

You need to provide these values from your own server runtime:

- `accessToken` - a valid Google Ads OAuth access token. Your app owns token refresh or token exchange.
- `developerToken` - your Google Ads developer token.
- `customerId` - the Google Ads customer ID to query.
- `loginCustomerId` - optional manager account ID when your Google Ads account requires one.

Do not put this code in browser client code. Resolve secrets in your server route, Worker, cron job, or job runner, then pass the resolved values into `createGoogleAdsClient()`:

```ts
import { createGoogleAdsClient } from "@patronage/google-ads";

import { fetchCampaignSnapshot } from "./campaign-snapshot";

const client = createGoogleAdsClient({
  auth: {
    async getAccessToken() {
      return accessToken;
    },
  },
  developerToken,
  loginCustomerId,
});

const snapshot = await fetchCampaignSnapshot(client, customerId);
```

In a real Patronage connector setup, `@patronage/google-ads` is only the Google Ads request layer. Your app still owns tenant selection, secret storage, OAuth refresh, routing, approvals, logging, and delivery. The live output has the same JSON shape as the demo output, but the campaign metrics come from Google Ads instead of the synthetic `createDemoClient()` response.

## Use This In Your App

The reusable piece is `fetchCampaignSnapshot()`. It accepts any `GoogleAdsClient`, so you can keep the demo client for local examples and use a live client in production without changing the query or response-normalization code.

That is the whole pattern: keep auth outside the library, construct the client in your own runtime, and reuse `fetchCampaignSnapshot()` wherever you need campaign-level reporting data.
