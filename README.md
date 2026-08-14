# Agentic Marketing Connectors

Public release monorepo for Patronage's agentic marketing connector packages.

## Packages

| Package | Version | Path | Description |
| --- | --- | --- | --- |
| `@patronage/ads-sync` | 0.1.0 | `packages/ads-sync` | Composable Ads Sync ingestion primitives for Cloudflare-hosted ad platform data pipelines. |
| `@patronage/cli` | 0.0.0 | `packages/cli` | Minimal local CLI harness for Patronage Open Source Core |
| `@patronage/connector-lifecycle` | 0.1.0 | `packages/connector-lifecycle` | Provider-neutral guarded mutation lifecycle contracts |
| `@patronage/google-ads` | 0.1.0 | `packages/google-ads` | Worker-safe Google Ads primitives for Patronage Core |
| `@patronage/linkedin-ads` | 0.1.0 | `packages/linkedin-ads` | Worker-safe LinkedIn Ads reporting and guarded mutation primitives for Patronage Core |
| `@patronage/meta-ads` | 0.1.0 | `packages/meta-ads` | Worker-safe Meta Ads reporting and guarded mutation primitives for Patronage Core |
| `@patronage/meta-social` | 0.0.0 | `packages/meta-social` | Worker-safe Meta organic social Graph API primitives for Patronage Core |
| `@patronage/reddit-ads` | 0.1.0 | `packages/reddit-ads` | Worker-safe Reddit Ads primitives for Patronage Core |
| `@patronage/tiktok-ads` | 0.1.0 | `packages/tiktok-ads` | Worker-safe TikTok Ads primitives for Patronage Core |
| `@patronage/x-posts` | 0.0.0 | `packages/x-posts` | Worker-safe X authored post ingestion primitives for Patronage Core |

## First npm registry set

The first npm publication is the current 0.1.0 packages only:

- `@patronage/ads-sync` 0.1.0
- `@patronage/connector-lifecycle` 0.1.0
- `@patronage/google-ads` 0.1.0
- `@patronage/linkedin-ads` 0.1.0
- `@patronage/meta-ads` 0.1.0
- `@patronage/reddit-ads` 0.1.0
- `@patronage/tiktok-ads` 0.1.0

These packages ship in this repository but stay off that first registry set:

- `@patronage/cli` 0.0.0
- `@patronage/meta-social` 0.0.0
- `@patronage/x-posts` 0.0.0

Leave the 0.0.0 packages off npm until a later release decision. The public CLI tree is incomplete because a private canonical dependency is dropped during generation.

Package versions are independent. Ads Sync is not lockstepped to google-ads. Treat these versions as unpublished until a maintainer uploads them.

## Packing

Dest `@patronage/*` inter-package dependencies stay on the pnpm workspace protocol (`workspace:*`). Pack from this workspace with `pnpm pack`. `prepack` builds `dist/` first. pnpm rewrites workspace protocol to exact versions at pack time and applies `publishConfig.exports`, which strips the local `development` export condition.

`npm pack` leaves workspace protocol in the tarball and does not apply `publishConfig.exports`. Pack with pnpm from this workspace.
