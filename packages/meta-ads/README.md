# @patronage/meta-ads

Worker-safe Meta paid ads reporting and guarded mutation primitives for Patronage Core.

This package is the public-shaped paid counterpart to `@patronage/meta-social`. It exposes read/reporting surfaces plus explicit write contracts for guarded campaign deployment, boosts, audiences, Lead Ads, Conversions API, and token/account utilities. Local execution mode and run logs live in `@patronage/cli`.

## Runtime Boundary

The root import is safe to load in Worker runtimes without `nodejs_compat`:

```ts
import { createMetaAdsClient } from "@patronage/meta-ads";
```

Runtime code uses caller-provided auth material and `fetch`. It does not read environment variables, import `dotenv`, import `automation/meta`, load local client config, create module-level clients, or use Node-only APIs.

## Provider Library Spike

The official Meta Business SDK (`facebook-nodejs-business-sdk`) remains the main candidate for a later paid package spike because it covers Marketing API object surfaces. This first slice keeps direct fetch REST because the required read/reporting edges are narrow and the SDK's broad generated model, mutation-heavy surface, and Worker import/runtime behavior still need explicit proof before adoption.

## Basic Usage

```ts
const client = createMetaAdsClient({
  accessToken,
  adAccountId: "act_123",
});

const adsets = await client.getInsights({
  level: "adset",
  since: "2026-03-31",
  until: "2026-03-31",
});
```

Validate a boost plan without network access:

```ts
import { buildBoostPostPlan } from "@patronage/meta-ads";

const plan = buildBoostPostPlan({
  budget: 50,
  days: 2,
  pageId: "123",
  postId: "123_456",
});
```

## Provider Version Policy

The default Graph API version is exported as `DEFAULT_META_GRAPH_API_VERSION` and is currently `v25.0`. Callers may override it with the `apiVersion` client option. Overrides are sent unchanged so an unsupported version fails visibly at Meta rather than being silently rewritten. Review the default before each public release because Meta retires Graph API versions on its published lifecycle.

## Read Canary and Contract Drift

Run the package-owned, read-only canary with an already authenticated client:

```ts
import { runMetaAdsReadCanary } from "@patronage/meta-ads";

const results = await runMetaAdsReadCanary(client, {
  since: "2026-07-01",
  until: "2026-07-02",
});
```

The canary performs representative account reads for insights, audiences, labels, automated rules, and account activity. It never invokes a mutation method. The caller supplies credentials and decides how failed results affect release promotion.

Run the credentialed operator canary with explicit environment-provided credentials:

```sh
META_ACCESS_TOKEN=... META_AD_ACCOUNT_ID=act_123 \
  pnpm --filter @patronage/meta-ads smoke:live
```

Optional `META_ADS_CANARY_SINCE` and `META_ADS_CANARY_UNTIL` values use `YYYY-MM-DD`. The command exits nonzero when any read fails.

The default remains read-only. Add `--allow-mutations` to also exercise representative campaign-deploy and boost-create plans:

```sh
META_ACCESS_TOKEN=... META_AD_ACCOUNT_ID=act_123 \
  pnpm --filter @patronage/meta-ads smoke:live -- --allow-mutations
```

Meta does not expose a general provider-side validate-only mode. These mutation results therefore report `validationMode: "local-preview"` and `providerRequestSent: false`; the runner never invokes a Meta mutation client method and has no execute mode. See [Run connector smokes](../../../apps/developer-docs/docs/how-to/run-connector-smokes.mdx).

Successful paginated responses are validated before normalization. Missing or malformed `data` and paging fields throw `MetaAdsContractDriftError` with only the operation, provider version, and safe provider request ID. This prevents a changed provider envelope from looking like a valid empty report.

## Writes and Resumable Deployment

The client exposes explicit primitive writes for campaigns, ad sets, creatives, ads, audiences, labels, automated rules, Lead Ads, media uploads, and Conversions API events. These methods are provider capabilities, not authorization: the calling system owns tenant policy, approval, audit logging, and any kill switch. Raw Graph requests and compound boost execution are not part of the client interface.

Compound campaign and boost execution is available from the explicit deployment subpath:

```ts
import {
  deployMetaBoostPlan,
  deployMetaCampaignPlan,
} from "@patronage/meta-ads/deployment";
```

Deployment returns JSON-serializable receipts for safe retry and resume. Ambiguous provider writes stop for reconciliation or manual review instead of blindly replaying creates. Local planning and operator run logs remain owned by `@patronage/cli`; package deployment requires a caller-created client and explicit plan.

## Runnable tutorial

[`examples/preview-boost-plan.ts`](examples/preview-boost-plan.ts) builds a paused boost plan without credentials, network access, or a provider mutation.
