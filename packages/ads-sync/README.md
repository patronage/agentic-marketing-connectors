# Ads Sync

`@patronage/ads-sync` contains composable ingestion contracts for Cloudflare-hosted ad platform data pipelines.

## Release Boundary

Ads Sync is published from `packages/ads-sync` in the `github.com/patronage/agentic-marketing-connectors` monorepo.

The nested `deploy/` workspace provides operator reference content but is not part of the npm package tarball. It consumes only the public `@patronage/ads-sync` entry point.

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
