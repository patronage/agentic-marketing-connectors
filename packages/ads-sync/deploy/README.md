# Ads Sync Reference Deployment

This non-published workspace package is the deployable reference shell for operators running `@patronage/ads-sync` on Cloudflare.

It is intentionally nested inside the package directory so the public repo-tree artifact includes both the composer-facing package and the operator-facing deployment. The deployment must import `@patronage/ads-sync` through public entry points only.

The reference Worker runs one Sync Connection on one Cron trigger through the package Qualified Run seam (`@patronage/ads-sync/run`) and exposes `GET /health`, provider metadata at `GET /`, and a small `/runs` surface. It does not include backfill plans or migrations endpoints; the launch runbook below applies the schema with `psql`.

To deploy this shell to your own Cloudflare account and Postgres, follow the [quickstart](https://adsync.patronage.com/tutorial/quickstart) in the Ads Sync docs: one Supported Provider, one Sync Connection, single-tenant custody (ADR 0047), one scheduled Qualified Run in under an hour. The docs also cover the [Google Search Console caveats](https://adsync.patronage.com/explanation/google-search-console-caveats) and the [Ejection Path](https://adsync.patronage.com/how-to/eject-from-loop) for a Loop tenant that resumes single-tenant here.

Start with the package's runnable [`configure-connections.ts`](../src/tutorials/configure-connections.ts) tutorial before adapting this shell. The [`prepare-bounded-run.ts`](../src/tutorials/prepare-bounded-run.ts) and [`run-historical-comparison.ts`](../src/tutorials/run-historical-comparison.ts) tutorials cover the package evidence that an operator runner should preserve.

## Scheduled Qualified Runs

`wrangler.jsonc` declares one Cron trigger (`0 6 * * *`, UTC). Each tick:

1. Upserts the connection row from `ads-sync.config.ts` so the seam can load it by id.
2. Computes the provider's Final-Data Horizon: UTC midnight `lag` days before the tick date (`DEFAULT_FINAL_DATA_LAG_DAYS`; Search Console 3, Google Ads 2, Meta Ads 3). Override with the `SCHEDULE_FINAL_DATA_LAG_DAYS` var.
3. Plans one window from the committed watermark to the horizon. The window is capped at `windowStepDays * maxWindowsPerRun` from the provider backfill policy, so a stale watermark catches up over several ticks. Before the first commit the window starts `SCHEDULE_INITIAL_LOOKBACK_DAYS` before the horizon (default: the provider `windowStepDays`).
4. When the horizon has not moved past the watermark, the tick records a `sync_runs` row with status `no_new_final_data` and starts no containers. That is a first-class run result, not an error.
5. Otherwise it creates a `sync_runs` row (`trigger_type = cron`) and hands the queued run to the `RunDispatcher` Durable Object, whose alarm executes the Qualified Run for that window. Just before the seam starts, the alarm re-reads the committed watermark; when it moved after the plan, the run finishes as `no_new_final_data` (`error_type = 'stale_window'`) and starts nothing. The watermark commits inside the seam's success transaction and never moves backwards (`WatermarkRegressionError` fails the run). A failed run leaves the watermark alone.

Both the Cron tick and `POST /runs` only plan; the dispatcher alarm executes. Neither run depends on the invocation that planned it. Cloudflare limits Cron and alarm handlers in CPU time, not wall clock, so a long run that spends its time awaiting Containers is not cut off by that limit. If an alarm is interrupted (eviction), Cloudflare retries it; the retry does not run the record again but fails the run closed. It releases the run's lease only when the lease has expired (see below).

### Orphan sweep and active-run dedupe

Every tick first fails closed the orphans of earlier ticks. Liveness comes from the seam's stream lease (`ads_sync.sync_stream_leases.expires_at`), not from age: a run that holds an unexpired lease is live and is never swept. A run still `queued` or `running` after 20 minutes (`ORPHANED_RUN_AFTER_MS`) with no unexpired lease has lost its executor; the tick marks it `failed` (`error_type = 'orphaned'`), releases its expired lease, and lists it in `orphanedRunIds`.

A tick then defers to an active run: while a run of the connection is `queued` or `running`, the tick records a ledger row with `result = 'already_active'` and the in-flight `run_id`, returns that run (`result: "already_active"`), and plans nothing. `POST /runs` is therefore idempotent while a run is in flight.

An alarm retry (the platform interrupted the earlier attempt) is different from the sweep: the earlier attempt's JavaScript is provably gone, so the dispatcher fails that run closed at once (`error_type = 'orphaned'`). Its Containers are not provably gone: the wrapper runs the connector as a subprocess that finishes on its own, so a destination write may still be committing rows. The dispatcher therefore releases the lease only when it has expired; an unexpired lease stays until its two-hour TTL ends, which is longer than the wrapper's write timeout. A tick inside that window plans a new run as usual; that run fails closed at `acquireStreamLease` (`A sync is already running for <key>`) and leaves the watermark alone. The first tick after expiry acquires the key and runs.

Every tick is written to `ads_sync.sync_schedule_ticks` (horizon, window, read mode, result: `queued`, `no_new_final_data`, or `already_active`). The watermark lives in `ads_sync.sync_watermarks`. Both tables come from `scheduleSchemaSql`, applied after the package control schema.

Provisional reads are an explicit, audited mode: set the `SCHEDULE_PROVISIONAL_READS` var to the literal `"true"`. The horizon then becomes UTC midnight of the tick date, run rows carry `trigger_type = cron_provisional` (or `manual_provisional`), and the tick ledger records `read_mode = provisional`. The default is final-data reads.

The connection's `scheduleEveryMinutes` is informational here; the Cron trigger is the cadence. Multi-connection scheduling and fan-out belong to Loop.

### `/runs`

`/runs` requires `Authorization: Bearer <ADS_SYNC_RUNNER_TOKEN>` (the Ads Sync Deployment Token, a Worker secret). Without the secret the routes answer `503`.

| Route | Purpose |
| --- | --- |
| `POST /runs` | Runs one tick now. Answers `200 { result: "no_new_final_data", runId, watermark, orphanedRunIds }`, `200 { result: "already_active", runId, status, orphanedRunIds }`, or `202 { result: "queued", execution: "durable_object_alarm", runId, window, orphanedRunIds }`. A queued run executes from the `RunDispatcher` Durable Object alarm, so the response never waits for Containers and the run does not depend on the request. Poll `GET /runs/:runId` until `status` is `succeeded`. |
| `GET /runs` | The last 20 runs with their window and read mode, plus the committed watermark. |
| `GET /runs/:runId` | One run. |

## Operator Checklist

1. Create a Cloudflare account with Workers Paid enabled.
2. Create an R2 bucket for Ads Sync artifacts.
3. Provision a standard Postgres database reachable from Cloudflare. PlanetScale Postgres is the reference backend; any compatible Postgres can work.
4. Create a Hyperdrive config for Worker-side Postgres reads and bind it as `HYPERDRIVE`. Hyperdrive is the reference deployment default, not a public package contract; destination containers still write directly to Postgres.
5. Create source provider credentials for each configured Supported Provider.
6. Store secrets in Cloudflare Worker secrets or the deployment's chosen secret backend. Do not commit local dotenv files, provider tokens, OAuth refresh tokens, or Postgres credentials.
7. Edit `ads-sync.config.ts` (one Sync Connection) with the source secret name, selected streams, destination schema, and stream group. Keep credential values in secrets; config stores names only.
8. Set the Worker secrets: `ADS_SYNC_RUNNER_TOKEN`, `POSTGRES_DESTINATION_CONFIG_JSON`, the provider source-config secret (for example `GOOGLE_SEARCH_CONSOLE_SOURCE_CONFIG_JSON`), and optionally the provider state secret. Locally, put the same names in the Wrangler dev vars file. The deployment never stores these values in Postgres, R2, logs, or artifacts (ADR 0047).
9. Run the local checks before deploying.

## Commands

```bash
pnpm --filter @patronage/ads-sync-deploy check
pnpm --filter @patronage/ads-sync-deploy build
pnpm --filter @patronage/ads-sync-deploy dev
pnpm --filter @patronage/ads-sync-deploy run deploy
```

`run` is required before `deploy`; without it pnpm executes its own built-in `pnpm deploy` command.

`check` runs TypeScript, tests, and the public-import boundary guard. `build` performs a Wrangler dry run without building container images; `build:images` runs `images/build-images.sh`, which builds the four connector images with Docker (set `IMAGE_REGISTRY` and pass `--push` to publish them; see Connector Images). `dev` and `deploy` prebuild `@patronage/ads-sync`, then run Wrangler with the configuration in this directory.

`provider-admission` is the executable provider admission command. It verifies one Supported Provider against a deployment: package catalog, Dockerfile, wrapper, Wrangler container/binding/migration, Container class, metadata expectation, and fixture; with `--live` it also runs `/metadata`, `spec`, a real `check`, and a bounded source read against the built image.

```bash
pnpm --filter @patronage/ads-sync-deploy provider-admission -- --provider google_ads --deployment <dir> [--live]
```

The Ads Sync docs how-to `admit-a-provider` lists every check and its pass condition. The reference deployment declares its connector containers in `wrangler.jsonc`, so the default invocation admits each Supported Provider against this directory.

## Config Shape

`ads-sync.config.ts` beside this README declares the one Sync Connection the Worker runs (Google Search Console by default, catalog in `config/`). The shape is the package `defineAdsSyncConfig` contract:

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

## Connector Images

`images/` holds every build input for the Supported Provider source images and the Postgres destination image. Consumers build these images themselves; this repository publishes Dockerfiles, not built images.

| Image | Dockerfile | Base image (digest pinned in the `FROM` line) |
| --- | --- | --- |
| Google Ads source | `images/Dockerfile` | `airbyte/source-google-ads:6.1.0@sha256:dea39deedba0a095f60159d808dfb47fa778e304846396d2ab2f04c951b480ed` |
| Google Search Console source | `images/Dockerfile.gsc` | `airbyte/source-google-search-console:2.1.9@sha256:3ee78d227a25ec01a31b9f131b1b8d80afd6e3aaf0c0c2f1b09c7973190465b3` |
| Meta Ads source | `images/Dockerfile.meta` | `airbyte/source-facebook-marketing:5.2.11@sha256:4d6c916b29862ded4b5b94feea0b8ef75899f34c364e4884312e50414b6d447c` |
| Postgres destination | `images/Dockerfile.postgres` | `airbyte/destination-postgres:3.0.13@sha256:0b310bd46ba0e006757ea3dc1d3b8ef8e3bcf51c3a96f5460a836653b5ac4f4c` |

Every image `COPY`s the same HTTP wrapper, `images/airbyte-source-server.py`. Its contract is documented in the Ads Sync docs under `reference/connector-image-http-contract`. `wrangler.jsonc` and the internal Paitronage app build from these same files.

### Build command

One command builds all four images and pushes them into a registry you own:

```bash
IMAGE_REGISTRY=registry.example.com/ads-sync bash images/build-images.sh --push
```

Omit `--push` to build and load the images into the local Docker daemon. `IMAGE_TAG` (default `0.3.0`), `IMAGE_PLATFORM` (default `linux/amd64`, the Cloudflare Containers platform), and `IMAGES` (a subset of `google-ads gsc meta postgres`) are optional. Wrangler and Alchemy can also build directly from a Dockerfile path; the push flow is for consumers who keep images in their own registry.

### Build modes and exact-match patches

Two Dockerfiles accept a build argument that selects an exact-match patch step. Each patch script fails the build when the pinned upstream text does not match exactly once, so a base-image change cannot silently ship an unpatched image.

| Build argument | Default | Alternative | Patch step |
| --- | --- | --- | --- |
| `GSC_AUTH_MODE` | `refresh_token` (upstream OAuth refresh-token flow; single-tenant operators own the refresh token) | `access_token` | `images/patch-gsc-manifest-auth.py` rewrites the pinned manifest authenticator to a bearer token that reads `authorization.access_token` |
| `POSTGRES_SCHEMA_MODE` | `airbyte_owned` (upstream `CREATE SCHEMA IF NOT EXISTS`; single-tenant writer role has database `CREATE`) | `preprovisioned` | `images/patch-postgres-preprovisioned-schema.py` rewrites only the namespace DDL constant in the connector jar to a no-op; the operator creates the final and raw schemas first |

The destination image always runs `images/pin-postgres-java-cacerts.sh`. It copies the image's own CA bundle to `/app/java-cacerts` and points the JVM trust store at that path through `DESTINATION_POSTGRES_OPTS`. TLS verification is not lowered; keep `sslmode=verify-full` in the destination JDBC parameters.

Pass the build arguments through the build script environment, for example `POSTGRES_SCHEMA_MODE=preprovisioned`. `/metadata` reports the selected mode as `buildOptions`.

`pnpm --filter @patronage/ads-sync-deploy test` runs the image tests: digest pins, the `.dockerignore` allowlist, each patch script against matching and drifted fixtures, and the wrapper HTTP contract.

## Launch Runbook

1. Build the connector images (see Connector Images), then deploy the Worker and required connector containers.
2. Run migrations against the control schema, the reporting views, and the schedule tables:

   ```bash
   pnpm --filter @patronage/ads-sync build
   node -e "import('@patronage/ads-sync').then(({ controlSchemaSql, reportingViewSql }) => console.log(`${controlSchemaSql}\\n${reportingViewSql}`))" \
     | psql "$DATABASE_URL"
   node --experimental-strip-types -e "import('./src/schedule.ts').then(({ scheduleSchemaSql }) => console.log(scheduleSchemaSql))" \
     | psql "$DATABASE_URL"
   ```

   Use the same Postgres database that the Worker reads through Hyperdrive and the destination container writes to directly. The campaign reporting view supports Google-only, Meta-only, and dual-provider deployments; absent provider campaign tables remain empty until the corresponding destination schema exists.

3. Confirm `GET /health` returns `ok: true`.
4. Confirm `GET /` returns the supported provider list and the configured connection.
5. Trigger the first tick with `POST /runs` and read `GET /runs` until the run is `succeeded`; the watermark then equals the window end. Create the Hyperdrive config with `--caching-disabled`, or the watermark read lags by up to a minute. A later tick before the horizon moves records `no_new_final_data`.
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
