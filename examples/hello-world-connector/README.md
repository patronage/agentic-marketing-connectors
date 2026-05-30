# Hello World Connector

Minimal TypeScript example for validating that a Patronage connector package can be installed, imported, and run locally.

The default run path uses `@patronage/google-ads` with synthetic data, caller-provided fake auth, and a fake `fetch` implementation. No live Google Ads credentials are required.

## Run

From the generated public release monorepo:

```bash
pnpm install
pnpm --filter @patronage/example-hello-world-connector start
```

Expected output includes a normalized customer id, a synthetic campaign name, and formatted spend.

## Verify Types

```bash
pnpm --filter @patronage/example-hello-world-connector typecheck
```

## Environment

No environment variables are required for this example. Swap the fake auth and fake `fetch` implementation for real credentials only after you are ready to call the Google Ads API.
