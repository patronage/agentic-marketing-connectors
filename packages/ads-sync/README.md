# Ads Sync

`@patronage/ads-sync` contains the public Ads Sync ingestion contract shared by Patronage's private deployment and the nested reference deployment.

## Release Boundary

Ads Sync is released through the `github.com/patronage/agentic-marketing-connectors` public monorepo as `packages/ads-sync`. The source of truth remains `src/packages/ads-sync` in Paitronage until an explicit migration says otherwise.

The nested `deploy/` package is included in the public repo tree as operator reference content, but it is not part of the npm package tarball. Patronage's private `apps/ads-sync` deployment stays private and must continue consuming this package through the public `@patronage/ads-sync` entry point.

Do not publish to npm or make additional release visibility changes without explicit approval of package versioning, npm org/access, dependency policy, and release notes.

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
- Meta Ads: `window.endDate` must be at least 28 days before `window.stableAsOf`.

The gate is considered passing only when the artifact summary has `passed: true` and `readinessRecommendation: "ready"`. Known deltas are allowed only when recorded with an account/entity/date/metric reason in the artifact. A launch rerun should persist the emitted artifact at a deterministic path chosen by the deployment or release workflow.
