# @patronage/google-ads

Worker-safe Google Ads REST primitives for Patronage Core.

Version 0.1 is the initial public preview. It is not a full clone of `google-ads-api`; it supports the Google Ads workflows needed by Patronage tools while keeping the runtime boundary safe for Cloudflare Workers.

## Runtime Boundary

The root import is safe to load in Worker runtimes without `nodejs_compat`:

```ts
import { createGoogleAdsClient } from "@patronage/google-ads";
```

Runtime code uses `fetch` and explicit client construction. It does not read environment variables, create module-level Google Ads clients, or import Node-only Google Ads libraries.

The default provider version is exported as `DEFAULT_GOOGLE_ADS_API_VERSION` and is currently `v24`. Callers may override `apiVersion` during a provider migration; overrides are sent unchanged so unsupported versions fail visibly. Review the default when Google publishes or sunsets a major Ads API version.

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

## Campaign Briefs

Parse Markdown or JSON source through one validated interface:

```ts
import {
  CampaignBriefParseError,
  parseCampaignBrief,
} from "@patronage/google-ads/deploy/parse-brief";

const brief = parseCampaignBrief(source, {
  defaultBidding: "maximize-conversions",
  format: "markdown",
});
```

Successful parsing returns a valid Campaign Brief. `defaultBidding` applies only when frontmatter omits `bidding`; it defaults to `manual-cpc` when omitted. Invalid syntax or campaign input throws `CampaignBriefParseError` with the source format and ordered `{ path, message }` findings. Grammar helpers and direct validation functions are implementation details; deployment still validates Campaign Brief objects supplied without parsing.

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

## Public Interfaces

The package exposes deliberate interfaces for `core`, `rest`, `reports`, `research`, `resolvers`, `compliance`, `cloudflare`, `partial-failure`, `planning`, campaign brief parsing, and individual guarded workflows. The package export map is the canonical list; release verification fails when an exported interface is not built or cannot load in a Worker runtime.

## Writes

Write helpers use one public subpath per Google Ads operation:

```ts
import { addKeywords } from "@patronage/google-ads/workflows/add-keywords";
import { updateCampaignBudget } from "@patronage/google-ads/workflows/update-campaign-budget";
```

These per-operation subpaths are the intentional workflow contract. They let consumers depend on one narrowly scoped capability without turning every write helper into a single workflow barrel. Only subpaths declared in `package.json` are public; sibling source files such as `workflows/shared.ts` remain private implementation details. New operations must add an explicit package export and matching build entry rather than a wildcard export.

Campaign-level negative keyword creation defaults to validation mode:

Guarded interfaces cover campaign deployment, keywords, ad groups, URLs, budgets, bidding, conversion goals, recommendations, responsive search ads, assets, Performance Max groups, locations, demographics, frequency caps, and experiments. Each workflow requires an explicit validation/execution mode or `validateOnly` value. For example:

```ts
import { addCampaignNegativeKeywords } from "@patronage/google-ads/workflows/negative-keywords";

await addCampaignNegativeKeywords(client, {
  campaignId: "111",
  customerId: "1234567890",
  keywords: [{ matchType: "PHRASE", text: "bad query" }],
});
```

Live execution requires `mode: "execute"`, but that is only a provider capability. The calling system must still enforce campaign-write authorization, approvals, and audit logging before executing mutations.

Compound campaign deployment returns a caller-persisted execution receipt. Retry the same operation with its receipt to reconcile completed steps; ambiguous steps stop for reconciliation or manual review instead of being blindly replayed.

## Credentialed Read Canary

The package-owned canary accepts an already configured client and performs a bounded, read-only campaign, keyword, and search-term matrix:

```ts
import { runGoogleAdsReadCanary } from "@patronage/google-ads";

const results = await runGoogleAdsReadCanary(client, { customerId });
```

For an operator smoke test, run `pnpm --filter @patronage/google-ads smoke:live -- --customer-id <id>`. It builds first, resolves local credentials in the script (outside the Worker-safe package), and exits nonzero when any canary read fails. This default is always read-only.

Mutation coverage requires both the unmistakable opt-in flag and an operator-reviewed fixture file:

```sh
pnpm --filter @patronage/google-ads smoke:live -- \
  --customer-id <smoke-account-id> \
  --allow-mutations \
  --mutation-fixtures /absolute/path/to/google-ads-smoke-fixtures.json
```

The nine #442 baseline results identify `provider-validate-only` for the seven Google Ads API `validateOnly: true` requests and `local-preview` for recommendation apply/dismiss, whose endpoints do not support provider validation. The runner has no execute mode and never discovers or creates a fixture. See [Run connector smokes](../../../apps/developer-docs/docs/how-to/run-connector-smokes.mdx) for the operator contract.

Successful provider responses are shape-checked at high-value transport seams. A malformed search envelope throws `GoogleAdsContractError` with version, operation, and request-id evidence rather than becoming plausible empty data. The one shape that reads as empty rather than malformed is a response object with no `results` key at all, which is how the API returns a page of zero rows: proto3 JSON drops empty repeated fields. A `results` value that is present but not an array, and any body that is not a JSON object, still throw. The cost of that carve-out is that a future rename of `results` would read as zero rows instead of raising.

## Validation

The deterministic test suite does not call live Google Ads. Validate package changes with:

```bash
pnpm --filter @patronage/google-ads test
pnpm --filter @patronage/google-ads typecheck
```

## Runnable tutorials

- [`examples/hello-world-campaign-snapshot.ts`](examples/hello-world-campaign-snapshot.ts) is the credential-free first path through the Worker-safe REST client.
- [`examples/flue-search-term-review.ts`](examples/flue-search-term-review.ts) shows a Flue-owned task composing report and validate-only mutation primitives without moving Flue into the connector package.
