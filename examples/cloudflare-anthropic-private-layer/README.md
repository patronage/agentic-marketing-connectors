# Cloudflare Anthropic Private Layer

Minimal TypeScript overlay for adding a Patronage connector tool to Cloudflare's Claude Managed Agents control plane.

This example is intentionally not a full copy of the Cloudflare template. Fork or deploy `cloudflare/claude-managed-agents`, then copy this overlay into that fork.

## What It Adds

- A custom tool named `patronage_google_ads_summary`.
- A public `@patronage/google-ads` import path.
- Synthetic Google Ads data so the default path does not need live provider credentials.
- A local preview script that exercises the same tool implementation without deploying Cloudflare infrastructure.

## Run The Local Preview

From the generated public release monorepo:

```bash
pnpm install
pnpm --filter @patronage/example-cloudflare-anthropic-private-layer start
```

Expected output is JSON with a normalized customer id, synthetic campaign name, and formatted spend.

## Verify Types

```bash
pnpm --filter @patronage/example-cloudflare-anthropic-private-layer typecheck
```

## Add To Claude Managed Agents On Cloudflare

1. Fork or deploy Cloudflare's Claude Managed Agents template: `https://github.com/cloudflare/claude-managed-agents`.
2. Copy `src/patronage-google-ads-summary-tool.ts` from this example into the template fork's `src/tools/` directory.
3. In the template fork's `src/tools/custom-tools.ts`, import and register the tool:

```ts
import { patronageGoogleAdsSummaryTool } from "./patronage-google-ads-summary-tool";
import { defineTool, type CustomTool } from "./custom-tools-runtime";

export const CUSTOM_TOOLS: CustomTool[] = [
  patronageGoogleAdsSummaryTool(defineTool) as CustomTool,
];
```

4. Install the connector dependency in the template fork:

```bash
npm install @patronage/google-ads
```

Until the npm packages are published, use the generated public monorepo workspace package or a release tarball instead of the npm install command.

## Cloudflare And Anthropic Setup

The Cloudflare template owns the Worker, sandbox, session, and webhook setup. Follow its onboarding guide for the control plane. At minimum, the template requires a paid Cloudflare Workers account, a self-managed Anthropic environment, and these Worker secrets:

```bash
npx wrangler secret put ENVIRONMENT_ID
npx wrangler secret put ANTHROPIC_ENVIRONMENT_KEY
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put WEBHOOK_SECRET
```

The default tool in this example does not read secrets. Replace the synthetic values only after you are ready to connect real provider credentials through your own Cloudflare policy boundary.
