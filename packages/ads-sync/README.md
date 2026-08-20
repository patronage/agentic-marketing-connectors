# Ads Sync

`@patronage/ads-sync` contains composable ingestion contracts for Cloudflare-hosted ad platform data pipelines.

## Release Boundary

Ads Sync is published from `packages/ads-sync` in the `github.com/patronage/agentic-marketing-connectors` monorepo.

The nested `deploy/` workspace provides operator reference content but is not part of the npm package tarball. It consumes only the public `@patronage/ads-sync` entry point.

`@patronage/ads-sync` 0.3.0 is on npm as `latest`. Install with `pnpm add @patronage/ads-sync@0.3.0`. 0.2.0 and 0.1.0 remain available.

## Docs

The Ads Sync docs at [adsync.patronage.com](https://adsync.patronage.com) route by task:

- [Quickstart](https://adsync.patronage.com/tutorial/quickstart): deploy the nested Ads Sync Reference Deployment (`deploy/`) to your own Cloudflare account and Postgres with one Supported Provider, one Sync Connection, and single-tenant custody (ADR 0047), and complete one scheduled Qualified Run in under an hour.
- [Ejection Path](https://adsync.patronage.com/how-to/eject-from-loop): how a Loop tenant resumes single-tenant on this package. Same seam, same schema contract, documented re-enrollment of credentials and state; an informal posture, not a guarantee.
- [Google Search Console caveats](https://adsync.patronage.com/explanation/google-search-console-caveats): the seven-day Testing-mode refresh token, the seam's cold-start retry, final versus provisional data, and the two image auth modes.
- [Public contract reference](https://adsync.patronage.com/reference/public-contract) and the [connector image HTTP contract](https://adsync.patronage.com/reference/connector-image-http-contract).

## Runnable Source Tutorials

Build the package, then run any tutorial from the public repository root:

```bash
pnpm --filter @patronage/ads-sync build
node --experimental-strip-types packages/ads-sync/src/tutorials/configure-connections.ts
```

- [`configure-connections.ts`](src/tutorials/configure-connections.ts) defines isolated Google Ads, Meta performance, and Meta metadata connections.
- [`prepare-bounded-run.ts`](src/tutorials/prepare-bounded-run.ts) validates a canary request and prints its request hash, backfill policy, and artifact keys.
- [`run-historical-comparison.ts`](src/tutorials/run-historical-comparison.ts) runs the Historical Comparison Gate with in-memory provider and warehouse adapters.

The tutorial test executes all three examples. Run it with `pnpm --filter @patronage/ads-sync test`.

## Public contract

The package publishes eight entry points:

- `@patronage/ads-sync` — configuration, protocol, provider registry, canary, comparison, and SQL surface
- `@patronage/ads-sync/instance` — Reference Deployment instance spec and mode transitions
- `@patronage/ads-sync/providers` — provider registry and provider-neutral dispatch
- `@patronage/ads-sync/google-ads`, `@patronage/ads-sync/google-search-console`, `@patronage/ads-sync/meta-ads` — provider modules, configured catalogs, and access-token builders
- `@patronage/ads-sync/sql` — control-store and reporting SQL text
- `@patronage/ads-sync/run` — the Qualified Run seam

Every public export of every entry point has a written contract at [adsync.patronage.com/reference/public-contract](https://adsync.patronage.com/reference/public-contract). Six functions carry a full inputs, outputs, invariants, and failure-modes contract:

- `compileDestinationInput()` keeps only `RECORD`, `STATE`, and `STREAM_STATUS` trace messages, in source order, and counts every other line as dropped. It throws instead of truncating when the compiled input exceeds a byte or line limit.
- `enforceTextArtifactLimits()` measures UTF-8 bytes and non-empty lines. Text at the exact limit passes. One byte or one line above a limit throws an error that names the label.
- `committedStateAfterSuccessfulDestinationWrite()` reads state only from destination stdout and keeps the latest state per stream descriptor. It returns `null` when the destination emitted no state, even when the source did.
- `destinationConfigForProvider()` returns a clone with the provider's isolated Airbyte schema. An explicit schema wins over the provider default. A non-object config comes back unchanged.
- `supportedImageVersions` pins one destination image and one source image per Supported Provider, each by digest.
- `createQualifiedRunAdapter()` returns the run adapter. It verifies the exact image pin, bounds and redacts artifacts, and commits state only after a successful destination write and a fresh lifecycle check.

`src/public-contract.test.ts` pins those contracts by name, with `src/core.test.ts` and `src/run.test.ts`.

Each provider module also ships a fully configured catalog, and Google Search Console and Meta Ads ship an access-token-only source-config builder. Reach them through the provider entry points (`googleAdsConfiguredCatalog`, `googleSearchConsoleConfiguredCatalog`, `googleSearchConsoleAccessTokenSourceConfig`, `metaAdsConfiguredCatalog`, `metaAdsAccessTokenSourceConfig`) or through the provider-neutral helpers in `@patronage/ads-sync/providers` (`configuredCatalogForProvider()`, `accessTokenSourceConfigForProvider()`, `accessTokenSourceConfigProviders`). The root entry point does not re-export them. Google Ads has no access-token builder, because its pinned source image requires OAuth refresh-token credentials. The Google Search Console token-only config requires the derived image built with `GSC_AUTH_MODE=access_token`. Builders never read an environment variable or a secret store; dates are ISO `YYYY-MM-DD` and `endDate` is exclusive.

The docs test `documents every public export of every package entry point` in `apps/ads-sync-docs/test/site.test.ts` parses the `exports` map, collects each entry file's exported names, and fails when any public export is missing from the reference page.

## Qualified Run Seam

`@patronage/ads-sync/run` is the one entry point that executes a Sync Connection. `createQualifiedRunAdapter(dependencies)` returns an adapter whose methods are the durable step boundaries of a run, plus `run()` for an inline execution. The seam owns, with tests:

- source-container invocation with an exact `connectorImage` + `wrapperVersion` metadata pin and a bounded, unavailable-only cold-start retry;
- artifact bounds and redaction, including Python-repr and other non-JSON secret forms, and bounded failure text;
- destination write;
- state commit only after destination success and a fresh lifecycle check.

The caller supplies Cloudflare bindings and app policy: container handles and pins, an R2 bucket, a postgres.js client factory, the configured catalog for a connection, and a custody adapter. Custody follows ADR 0047: the seam never reads deployment env fields itself. `workerSecretsCustodyAdapter(env)` is the single-tenant implementation; it reads only names in `ADS_SYNC_MANAGED_SECRET_NAMES`. The entry point's module doc in `src/run.ts` is the reference for the dependency shape.

## Historical Comparison Gate

`runHistoricalComparisonGate()` is the launch gate harness for reporting correctness. It accepts a provider API adapter and a warehouse adapter, reads both sides for the same stable historical window, and emits a Source Comparison Artifact from `ads_sync_reporting.ads_campaign_daily` rows and provider campaign/day rows:

- `apiValue`, `warehouseValue`, `delta`, and `relativeDelta` per metric
- missing-row detection by account/campaign/day
- duplicate-row detection by account/campaign/day
- explicit per-metric tolerances
- provider-specific stable-window checks
- documented known deltas
- `readinessRecommendation: "ready" | "review"`

The warehouse adapter receives the SQL and parameters from `warehouseCampaignDailyComparisonQuery()`. The provider adapter receives the launch provider's read spec from `historicalProviderApiReadSpecs`. For test fixtures or pre-fetched data, call `buildHistoricalComparisonArtifact()` directly with normalized provider and warehouse rows.

Provider reads must use stable historical windows:

- Google Ads: `window.endDate` must be at least 30 days before `window.stableAsOf`.
- Google Search Console: `window.endDate` must be at least 7 days before `window.stableAsOf`.
- Meta Ads: `window.endDate` must be at least 28 days before `window.stableAsOf`.

The gate is considered passing only when the artifact summary has `passed: true` and `readinessRecommendation: "ready"`. Known deltas are allowed only when recorded with an account/entity/date/metric reason in the artifact. A launch rerun should persist the emitted artifact at a deterministic path chosen by the deployment or release workflow.
