# Live smoke fixtures

`mutation-fixtures.example.json` shows the shape accepted by `--mutation-fixtures`. Its identifiers are synthetic placeholders and will not resolve against a real account.

```bash
pnpm --filter @patronage/google-ads smoke:live -- \
  --customer-id <id> --allow-mutations --mutation-fixtures ./examples/mutation-fixtures.example.json
```

Replace every ID with resources from your own account before running the smoke.

## Fixture keys are optional

Any of the 18 keys may be omitted. An absent key makes that operation report `skipped` with a reason and **no provider request is sent**. That is how you exercise a subset without firing calls an account cannot support: this example omits Performance Max and experiment fixtures because Ad Grants is search-only and has no experiments.

## Gotchas found while building this

Each of these cost a failed run; they are recorded so the next person skips them.

- **`campaignBidding` with `MAXIMIZE_CONVERSIONS` requires `targetCpaMicros`.** Without it the local guard rejects the payload (`providerRequestSent: false`) because Google rejects top-level `maximize_conversions` field masks.
- **`biddingAdjustments.campaigns` takes full resource names**, not bare campaign IDs — `customers/<cid>/campaigns/<id>`. Bare IDs fail locally with "campaign is not a supported Google Ads resource name."
- **`customConversionGoals.conversionActionIds` must reference ENABLED conversion actions.** A disabled one returns a real 400 from Google: `customConversionGoalError: CONVERSION_ACTION_NOT_ENABLED`. Find valid ones with: `SELECT conversion_action.id, conversion_action.name FROM conversion_action WHERE conversion_action.status='ENABLED'`
- **Seasonality adjustments cap the interval at 14 days.**
- **`campaignBudget` is a safe first probe** — set `amountMicros` and `deliveryMethod` to the budget's current values so the payload describes no change even in principle.

## Read-only first

`smoke:live` without `--allow-mutations` runs only the read canary (3 GAQL queries, `LIMIT 1` each). Run that first: it confirms OAuth refresh, developer token, and customer resolution cheaply, so an auth problem surfaces as a clear failure rather than a confusing canary result.
