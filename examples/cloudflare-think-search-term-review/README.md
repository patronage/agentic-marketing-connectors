# Cloudflare Think: Search Term Review Agent

This example shows a Patronage connector inside a long-running Cloudflare Think workflow.

It reviews synthetic Google Ads search-term data, drafts negative keyword recommendations, validates the proposed Google Ads mutation in validate-only mode, and stores the review in a Durable Object-backed Think agent.

The default run is safe to try from a clean checkout. It uses synthetic data, so you do not need live Google Ads credentials, a Slack workspace, or a private OAuth app.

## What Problem This Solves

Use this when a paid-search team needs to answer a common optimization question:

> Which search terms are wasting spend, and what negative keywords should a human approve?

The agent looks for zero-conversion search terms with low-intent language like `free`, `jobs`, and `template`. Then it turns those findings into negative keyword recommendations with enough evidence for a human to review.

The validation step uses the same operation builder you would use for live Google Ads mutations, but the demo path never changes an account.

## Why Think Fits

This is not just a chat endpoint. The review has a small but important state machine:

- a draft review with search-term evidence;
- a validate-only Google Ads mutation result;
- an approval marker for a human operator.

Think is a good fit because the agent can keep that state across turns while still exposing tools to the model. A user can ask for an analysis, ask follow-up questions, validate the draft, and approve it without the workflow losing its place.

## What This Borrows From The Assistant Example

The official Cloudflare Assistant example shows a full Think app: shared workspace, sub-agents, MCP, browser automation, extensions, and a React UI.

This starter keeps the pieces that matter for a small marketing-ops workflow:

- `SearchTermReviewAgent extends Think`;
- Durable Object SQLite for persisted workflow state;
- server-side tools returned from `getTools()`;
- a Worker route that can call the long-running agent directly;
- Workers AI as the model provider for chat turns.

It leaves out the shared MCP registry, browser automation, extension loader, and full client app. Those are useful production patterns; they are just not needed to understand the core loop here.

## From Checkout To Output

From the generated public release monorepo:

```bash
corepack enable
pnpm install
pnpm --dir examples/cloudflare-think-search-term-review start
pnpm --dir examples/cloudflare-think-search-term-review typecheck
pnpm --dir examples/cloudflare-think-search-term-review deploy:dry-run
```

Requirements:

- Node.js `24.x`
- `pnpm` via Corepack (`packageManager` in the repository root)

The default run does not need environment variables.

Run command:

```bash
pnpm --dir examples/cloudflare-think-search-term-review start
```

Expected output shape:

```json
{
  "account": {
    "customerId": "1234567890",
    "provider": "google_ads"
  },
  "campaign": {
    "id": "987654321",
    "name": "Nonprofit Growth Search"
  },
  "findings": {
    "reviewedSearchTerms": 5,
    "wastedSpend": 407.65,
    "zeroConversionSpend": 407.65
  },
  "mode": "demo",
  "recommendations": [
    {
      "matchType": "PHRASE",
      "text": "free"
    }
  ],
  "source": "synthetic_google_ads_search_terms",
  "status": "reviewed",
  "validation": {
    "mode": "validate",
    "operationCount": 3,
    "requestId": "example-validate-request-id",
    "validateOnly": true
  }
}
```

## Run The Worker Locally

Start Wrangler:

```bash
pnpm --dir examples/cloudflare-think-search-term-review dev
```

Then open:

```text
http://127.0.0.1:8787/demo-review
```

Useful routes:

- `GET /demo-review` creates and stores a draft review.
- `POST /demo-review` creates a draft review from JSON input.
- `POST /demo-review/validate` validates the latest draft and stores a reviewed state.
- `GET /demo-review/latest` returns the latest stored state.
- `/agents/SearchTermReviewAgent/demo-search-term-review` is the direct Think agent route.

The stored review lives in the agent's Durable Object SQLite storage. In production, give each user, account, or workflow its own agent name so reviews stay isolated.

## Agent Tools

The Think agent exposes three server-side tools:

- `analyze_search_terms` drafts recommendations from synthetic search-term data.
- `validate_negative_keywords` validates the latest draft with a validate-only Google Ads mutate call.
- `approve_negative_keyword_review` records human approval in the durable workflow state.

The example stops at approval on purpose. A live apply step should be a separate operator-controlled path that calls Google Ads with `mode: "execute"` only after policy checks and audit logging.

## Use Real Google Ads Data

The demo path uses `createDemoGoogleAdsClient()` in `src/search-term-review.ts`. To use live data, replace the demo client with `createGoogleAdsClient()` and load credentials from Worker secrets or your own token broker.

Documented secret names:

```bash
npx wrangler secret put GOOGLE_ADS_ACCESS_TOKEN
npx wrangler secret put GOOGLE_ADS_DEVELOPER_TOKEN
npx wrangler secret put GOOGLE_ADS_LOGIN_CUSTOMER_ID
npx wrangler secret put GOOGLE_ADS_CUSTOMER_ID
```

Live client sketch:

```ts
import { createGoogleAdsClient } from "@patronage/google-ads";

function createLiveGoogleAdsClient(env: Cloudflare.Env) {
  return createGoogleAdsClient({
    auth: {
      getAccessToken: async () => env.GOOGLE_ADS_ACCESS_TOKEN ?? "",
    },
    developerToken: env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
    loginCustomerId: env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  });
}
```

Keep tokens out of prompts and browser code. The connector handles Google Ads requests; your app still owns tenant selection, token refresh, approval policy, logging, and delivery.

## Slack And Messenger Shape

Cloudflare Think now has first-class messenger support, but this example does not require Slack, Telegram, or a private OAuth app.

A Slack-adjacent production version could route mentions or workflow approvals into the same durable Think agent. The baseline stays simpler: Wrangler plus synthetic data.
