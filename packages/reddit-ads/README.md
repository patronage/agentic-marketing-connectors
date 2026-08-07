# @patronage/reddit-ads

Worker-safe Reddit Ads reporting and account-read primitives for Patronage Core.

## Live Verification Required

No operation in this package has been executed against the live Reddit Ads API. Its coverage is unit-level with injected `fetch`, so endpoint paths, request shapes, response envelopes, and enum values are verified against documentation only—not observed provider behavior. Credentials are not currently held, so this cannot be completed today.

Before using this package for real client work, run a live, read-only verification pass against a real account and replace the hand-authored test fixtures with captured real responses. A mocked fixture can encode the author's assumption rather than the API's actual contract; this package's tests currently use hand-authored fixtures.

## Runtime Boundary

The root import is safe to load in Worker runtimes without `nodejs_compat`:

```ts
import { createRedditAdsClient } from "@patronage/reddit-ads";
```

Runtime code uses caller-provided access tokens and `fetch`. It does not read environment variables, import `dotenv`, create module-level clients, or use Node-only APIs.

## Basic Usage

```ts
const client = createRedditAdsClient({
  accessToken,
  adAccountId: "account-123",
});

const { campaigns } = await client.listCampaigns({ pageSize: 25 });
```

The default API base URL is `https://ads-api.reddit.com/api/v3`; it is an API root rather than a browsable documentation resource. Callers may override `apiBaseUrl` only for an explicitly compatible endpoint. See the [Reddit Ads v3 OpenAPI specification](https://ads-api.reddit.com/api/v3/openapi.json) for the documented provider contract.

## Read Canary and Contract Drift

Run the package-owned read-only canary with an authenticated client:

```ts
import { runRedditAdsReadCanary } from "@patronage/reddit-ads";

const results = await runRedditAdsReadCanary(client);
```

The canary reads the current member, configured ad account, campaign and ad entities, targeting lookups, and funding instruments. It never invokes a mutation method and continues after independent failures so callers have complete release evidence.

For a credentialed release canary, inject credentials explicitly:

```sh
REDDIT_ADS_ACCESS_TOKEN=... REDDIT_ADS_AD_ACCOUNT_ID=... \
  pnpm --filter @patronage/reddit-ads smoke:live
```

The command exits nonzero if any read fails. The package owns no credential lookup or approval policy.

## Reporting Timezones

When `getReport` receives no `timeZoneId`, it reads the configured account and sends its `time_zone_id` to Reddit. This prevents report date and spend rollups from silently defaulting to a different timezone. Callers can explicitly supply `timeZoneId` when they need a different reporting timezone.

Provider contracts are validated before normalization; malformed resources and pagination envelopes raise `RedditAdsApiError` rather than looking like plausible empty data. See the [Reddit Ads v3 OpenAPI specification](https://ads-api.reddit.com/api/v3/openapi.json) for the current provider contract.
