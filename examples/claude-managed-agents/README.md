# Claude Managed Agents: Governed Google Ads Optimization

Start here if you want a Claude Managed Agent to do useful paid-media work with Patronage connector context.

This is the smallest useful version of the Cloudflare Managed Agents path: one Worker, one Durable Object runner, one Isolate backend, and one custom tool. It is not a fork of Cloudflare's full `cloudflare/claude-managed-agents` template or dashboard.

The tool reads Google Ads search-term waste, proposes campaign-level negative keywords, validates the intended mutation through `@patronage/google-ads`, and returns an approval-required plan that Claude can hand to an operator.

The default run uses synthetic data and a fake `fetch` implementation, so no live Google Ads credentials are required.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/patronage/agentic-marketing-connectors/tree/main/examples/claude-managed-agents)

## What Problem This Solves

Cloudflare gives Claude Managed Agents a place to execute code, call tools, connect to services, and keep operational work outside the prompt. Cloudflare's full template includes more control-plane features; this repo keeps only the pieces needed for a small custom-tool demo.

Marketing agents still need a governed way to reach channel systems.

Use this when an agent needs to move beyond a passive report:

> Find waste in this campaign and prepare the negative keyword update for approval.

The tool makes one read-only Google Ads search-term query, selects high-spend terms with no conversions, builds negative keyword recommendations, and calls the Google Ads mutate path in validation mode. No provider mutation is executed in the demo.

Claude gets a bounded optimization plan instead of a pasted spreadsheet. The operator keeps the approval boundary.

## Where It Fits In A Real Agent

The reusable code lives in [src/tools/patronage-google-ads-optimization-tool.ts](./src/tools/patronage-google-ads-optimization-tool.ts). This deployable Worker registers it as the `patronage_google_ads_negative_keyword_optimizer` custom tool.

Typical places this fits:

- a search-ops agent that prepares negative keyword changes for review;
- a client-service agent that explains why a recommendation is safe or risky;
- an internal approval workflow where Claude can validate the proposed mutation, but a human or policy gate decides what ships.

## How Installation Works

1. Cloudflare runs the self-hosted execution layer: the Worker, the Durable Object runner, and the `patronage_google_ads_negative_keyword_optimizer` custom tool.
2. Anthropic Platform owns the Managed Agent definition, manual deployment, sessions, and run history.

After setup, users run the agent from Anthropic Platform, or from code that calls the Anthropic deployment run API. The Cloudflare Worker wakes up when Anthropic sends a webhook, polls the Managed Agents work queue, and executes the tool call.

## Prerequisites

- Deploy access to a Cloudflare account.
- A Claude Platform account.

## Deploy To Cloudflare

Click the Deploy to Cloudflare button above and follow Cloudflare's prompts.

The button tells Cloudflare to clone and deploy this directory from GitHub. It should point at:

```text
github.com/patronage/agentic-marketing-connectors/tree/main/examples/claude-managed-agents
```

When the deploy finishes, save the Worker URL. It will look like:

```text
https://<worker-name>.<account>.workers.dev
```

## Anthropic Setup

The detailed Anthropic flow is covered in the [Managed Agents self-hosted sandboxes docs](https://platform.claude.com/docs/en/managed-agents/self-hosted-sandboxes). The short version:

1. In Claude Platform, create a self-hosted Managed Agents environment.
2. Generate an environment key for that environment.
3. In Claude Platform, create a webhook endpoint pointing at:

```text
https://<worker-host>/webhooks
```

4. Save the webhook signing secret.
5. In Cloudflare, add these Worker secrets. Use the dashboard, or set them with Wrangler:

```bash
npx wrangler secret put ENVIRONMENT_ID
npx wrangler secret put ANTHROPIC_ENVIRONMENT_KEY
npx wrangler secret put WEBHOOK_SECRET
```

6. Open the deployed Worker config endpoint:

```text
https://<worker-host>/agent-config
```

7. Create an Anthropic agent using the returned `system` prompt and `tools` array.
8. Create a manual deployment for that agent using the self-hosted environment.

Store the environment key and webhook signing secret somewhere secure. They are one-time values in the Anthropic UI.

## Test It

In Claude Platform:

1. Open the agent.
2. Open the manual deployment.
3. Click **Run now**.
4. Open the created session and inspect the transcript.

The session should call the Patronage Google Ads tool and return a validate-only optimization plan. By default, the tool uses synthetic Google Ads search-term data, so the test run does not read from or mutate a live Google Ads account.

## Store Run Artifacts In R2

This is optional. Without an R2 binding, the run still works and the plan appears in the Claude Platform transcript.

To keep a durable copy of each optimization plan, create an R2 bucket and add this binding to `wrangler.jsonc`:

```jsonc
"r2_buckets": [
  {
    "binding": "OPTIMIZATION_PLAN_BUCKET",
    "bucket_name": "<your-r2-bucket-name>"
  }
]
```

When configured, the Worker writes the validate-only plan to:

```text
runs/<session-id>/optimization-plan.json
```

## Connect Real Google Ads Later

The default run uses fixture data. Real Google Ads is not connected.

To connect live data later, replace the demo client inside `src/tools/patronage-google-ads-optimization-tool.ts` with a live `@patronage/google-ads` client and provide the required Google Ads credentials as Worker secrets.

Keep the demo in validate-only mode unless you add a separate approval workflow for live mutations.

## From Checkout To Output

From the repository root, the default run uses synthetic Google Ads data and does not need Anthropic or Cloudflare secrets:

```bash
corepack enable
pnpm install
pnpm --filter @patronage/example-claude-managed-agents start
pnpm --filter @patronage/example-claude-managed-agents typecheck
```

Expected output is a JSON optimization plan with `approval_required` and a validate-only Google Ads mutation result.

## Local Development

From this example directory:

```bash
pnpm install
pnpm start
pnpm run dev
```

Then open:

```text
http://127.0.0.1:8787/health
```

`pnpm start` runs the Patronage custom tool against synthetic data. `pnpm run dev` verifies that the Worker routes load and that `/agent-config` returns the custom tool definition. A full Managed Agents run requires a deployed Worker webhook that Anthropic can reach.

## Endpoints

- `GET /health` reports whether required Worker secrets are configured.
- `GET /agent-config` returns the system prompt and custom tool schema for the Anthropic agent.
- `POST /webhooks` receives Anthropic webhooks, polls pending environment work, and starts the `IsolateRunner`.

## Troubleshooting

- `/health` reports missing secrets: set the missing Cloudflare Worker secrets.
- `/agent-config` does not load: verify the Worker deployed successfully.
- Runs do not start: check the Anthropic webhook URL, webhook signing secret, and environment key.
