# Changelog

## 0.3.0 - 2026-08-20

`@patronage/ads-sync` 0.3.0. Qualified Run seam at `@patronage/ads-sync/run` (`createQualifiedRunAdapter`, `workerSecretsCustodyAdapter`). Seam invariants: exact `connectorImage` + `wrapperVersion` metadata pin, bounded unavailable-only cold-start retry, artifact bounds and redaction, destination write, and state commit only after destination success. Named contracts for `compileDestinationInput`, `enforceTextArtifactLimits`, `committedStateAfterSuccessfulDestinationWrite`, `destinationConfigForProvider`, and `supportedImageVersions`. Configured catalogs and token-only source-config builders. Dockerfiles-first images and wrapper HTTP contract. Reference Deployment Cron-scheduled Qualified Runs with watermark discipline. `provider-admission`. Quickstart, Ejection Path, and Google Search Console caveats.

Shipped follow-ups: stranded queued-run re-enqueue from the `already_active` path (#1596); provider admission live rung uses dispatcher-shaped windowed source config (#1598).

Not in this cut: concurrent-tick serialization (partial unique index on one active run per connection, the deferred half of #1596); live `POST /write` in provider admission (the deferred half of #1598; the write path still needs a destination database the admission command does not provision).

Other npm packages stay on 0.1.0 `latest`.

## 0.2.0 - 2026-08-18

`@patronage/ads-sync` 0.2.0. Provider interface, Google Search Console source, and named entry points for `providers`, `google-ads`, `google-search-console`, `meta-ads`, and `sql`.

Other npm packages stay on 0.1.0 `latest`.

## 0.1.0 - 2026-08-13

First public npm cut from this generated repository.

Published on npm as 0.1.0 `latest`:

- `@patronage/ads-sync` 0.1.0
- `@patronage/connector-lifecycle` 0.1.0
- `@patronage/google-ads` 0.1.0
- `@patronage/linkedin-ads` 0.1.0
- `@patronage/meta-ads` 0.1.0
- `@patronage/reddit-ads` 0.1.0
- `@patronage/tiktok-ads` 0.1.0

These packages remain dest-only and are not on npm:

- `@patronage/cli` 0.0.0. The public CLI tree is incomplete because a private canonical dependency is dropped during generation.
- `@patronage/meta-social` 0.0.0. Not pack-safe: no `publishConfig`, and packed `exports` keep `default` on `./src`.
- `@patronage/x-posts` 0.0.0. Not pack-safe: no `publishConfig`, and packed `exports` keep `default` on `./src`.

Package versions are independent. Ads Sync is not lockstepped to google-ads.
