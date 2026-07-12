# Ads Sync Reference Deployment

This private workspace package is the deployable reference shell for operators running `@patronage/ads-sync` on Cloudflare.

It is intentionally nested inside the package directory so the public repo-tree artifact includes both the composer-facing package and the operator-facing deployment. The deployment must import `@patronage/ads-sync` through public entry points only.

The current reference Worker exposes `GET /health` and provider metadata at `GET /`. It does not yet include the full private runner endpoints such as `/migrations`, `/runs`, or `/backfill-plans`; compose those endpoints from the package primitives before using this shell as a production runner.

## Operator Checklist

1. Create a Cloudflare account with Workers Paid enabled.
2. Create an R2 bucket for Ads Sync artifacts.
3. Provision a standard Postgres database reachable from Cloudflare. PlanetScale Postgres is the reference backend; any compatible Postgres can work.
4. Create a Hyperdrive config for Worker-side Postgres reads and bind it as `HYPERDRIVE`. Hyperdrive is the reference deployment default, not a public package contract; destination containers still write directly to Postgres.
5. Create source provider credentials for each configured Supported Provider.
6. Store secrets in Cloudflare Worker secrets or the deployment's chosen secret backend. Do not commit local dotenv files, provider tokens, OAuth refresh tokens, or Postgres credentials.
7. Configure `ads-sync.config.ts` with source secret names, selected streams, destination schemas, stream groups, and schedules. Start from the example below and keep credential values in secrets; config stores names only.
8. Run the local checks before deploying.

## Commands

```bash
pnpm --filter @patronage/ads-sync-deploy check
pnpm --filter @patronage/ads-sync-deploy build
pnpm --filter @patronage/ads-sync-deploy dev
pnpm --filter @patronage/ads-sync-deploy deploy
```

`check` runs TypeScript, tests, and the public-import boundary guard. `build` performs a Wrangler dry run. `dev` and `deploy` prebuild `@patronage/ads-sync`, then run Wrangler with the configuration in this directory.

## Minimal Config Shape

Create `ads-sync.config.ts` beside this README when adapting the reference deployment into a real operator repo:

```ts
import { defineAdsSyncConfig } from "@patronage/ads-sync";

const metaCampaignDailyConfiguredCatalog = {
  // Replace with the Airbyte configured catalog produced by discover/select
  // for the stream names below. Keep catalog JSON in repo; keep credentials in
  // Worker secrets.
  streams: [],
};

export const adsSyncConfig = defineAdsSyncConfig({
  connections: [
    {
      catalog: metaCampaignDailyConfiguredCatalog,
      connectionId: "meta_ads_performance",
      destinationSchema: "airbyte_meta_ads",
      provider: "meta_ads",
      reportingEnabled: true,
      scheduleEveryMinutes: 6 * 60,
      selectedStreams: ["customcampaign_daily_performance"],
      sourceConfigSecret: "META_ADS_SOURCE_CONFIG_JSON",
      stateSecret: "META_ADS_SOURCE_STATE_JSON",
      streamGroup: "performance",
    },
  ],
});
```

Use the same shape for Google Ads with `provider: "google_ads"`, an isolated destination schema, and a Google Ads source-config secret name. For Meta split deployments, use separate performance and metadata connections with different `streamGroup` values.

## Launch Runbook

1. Deploy the Worker and required connector containers.
2. Run migrations against the control schema and reporting views:

   ```bash
   pnpm --filter @patronage/ads-sync build
   node -e "import('@patronage/ads-sync').then(({ controlSchemaSql, reportingViewSql }) => console.log(`${controlSchemaSql}\\n${reportingViewSql}`))" \
     | psql "$DATABASE_URL"
   ```

   Use the same Postgres database that the Worker reads through Hyperdrive and the destination container writes to directly. The campaign reporting view supports Google-only, Meta-only, and dual-provider deployments; absent provider campaign tables remain empty until the corresponding destination schema exists.

3. Confirm `GET /health` returns `ok: true`.
4. Confirm `GET /` returns the supported provider list.
5. Build operator-specific run, migration, and backfill endpoints around the package primitives before using the deployment for live ingestion.
6. Run the Historical Comparison Gate over stable provider windows for Google Ads and Meta Ads once the operator runner has written historical data.
7. Preserve the Source Comparison Artifact from each provider gate run as launch evidence.

The Historical Comparison Gate passes only when the artifact has `summary.passed: true` and `readinessRecommendation: "ready"`.

## Cost Envelope

Pricing references checked on 2026-06-19:

- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare Containers pricing](https://developers.cloudflare.com/containers/pricing/)
- [Cloudflare Container instance types](https://developers.cloudflare.com/containers/platform-details/limits/)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [PlanetScale pricing](https://planetscale.com/pricing)

Ads Sync has four cost drivers:

1. Workers Paid floor Cloudflare Containers require Workers Paid. Cloudflare currently documents a $5 USD/month Workers Paid minimum for an account.

2. Container active time The reference deployment uses `standard-1` connector containers. Containers are billed while actively running, with included monthly memory, CPU, and disk usage under Workers Paid and usage-based charges after that. Cloudflare currently defines `standard-1` as 1/2 vCPU, 4 GiB memory, and 8 GB disk. A normal sync run should be estimated as:

   ```text
   measured source active minutes
   + measured destination active minutes
   + startup/shutdown overhead
   + configured sleepAfter tail
   = billable standard-1 active minutes

   billable vCPU-minutes = billable standard-1 active minutes * 0.5
   billable GiB-minutes = billable standard-1 active minutes * 4
   billable GB-minutes = billable standard-1 active minutes * 8
   ```

   Compare those measured units with Cloudflare's included Workers Paid monthly usage and current overage rates. A backfill plan multiplies that run cost by the number of windows executed. Keep `windowStepDays` and `maxWindowsPerRun` conservative until the first provider/account shape is measured.

3. R2 artifact storage and operations Each run writes replayable source stdout/stderr, state input, configured catalog, destination input, destination stdout/stderr, and summary artifacts. R2 billing is driven by stored bytes plus Class A/Class B operations. Retain artifacts long enough for audit and rollback; prune old replay artifacts when the operator no longer needs them.

4. Postgres storage and query work The reference backend is PlanetScale Postgres. PlanetScale currently lists a Base plan with single-node Postgres starting at $5/month for development and low-traffic workloads, and Metal starting at $50/month for higher performance needs. Start with the smallest tier that can hold Direct Load history plus reporting views for the operator's configured accounts, then scale on measured storage, write volume, and comparison/report query latency.

### Sizing Notes

- Initial backfills are the cost peak because they run many historical windows.
- Steady-state scheduled syncs are usually cheaper because each run covers only a small recent window.
- Google Ads and Meta Ads should be measured separately; connector runtime, row volume, and provider lag differ.
- If a run leaves live containers after work completes, treat that as a lifecycle bug and clean it up before trusting cost estimates.
- Keep launch estimates in formulas plus observed measurements. Cloud provider prices and included usage can change.

## Required Operator Evidence

Before publishing or marking a deployment ready, capture:

- the Wrangler dry-run output for this deployment
- the first successful Backfill Plan status for each launch provider
- the Historical Comparison Gate artifact for Google Ads
- the Historical Comparison Gate artifact for Meta Ads
- the Postgres tier and region used for the launch measurement
- the R2 bucket retention policy chosen by the operator

Do not publish provider tokens, account IDs, refresh tokens, database URLs, or raw artifact payloads containing sensitive campaign data.
