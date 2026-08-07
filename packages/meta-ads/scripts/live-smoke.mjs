import { createMetaAdsClient, runMetaAdsReadCanary } from "../dist/index.js";
import { parseLiveSmokeArgs } from "./live-smoke-options.mjs";

const args = parseLiveSmokeArgs(process.argv.slice(2));
const accessToken = requiredEnv("META_ACCESS_TOKEN");
const adAccountId = requiredEnv("META_AD_ACCOUNT_ID");
const until = process.env.META_ADS_CANARY_UNTIL ?? today();
const since = process.env.META_ADS_CANARY_SINCE ?? daysBefore(until, 1);
const client = createMetaAdsClient({ accessToken, adAccountId });
const results = await runMetaAdsReadCanary(client, { since, until });
const mutationResults = args.allowMutations
  ? await import("../dist/mutation-canary.js").then(
      ({ runMetaAdsMutationCanary }) => runMetaAdsMutationCanary()
    )
  : undefined;

console.log(
  JSON.stringify(
    {
      adAccountId,
      mode: args.allowMutations ? "mutation-local-preview" : "read-only",
      mutationResults,
      provider: "meta-ads",
      readResults: results,
      since,
      until,
    },
    null,
    2
  )
);
if (
  results.some(({ status }) => status === "failed") ||
  mutationResults?.some(({ status }) => status === "failed")
) {
  process.exitCode = 1;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Set ${name} before running the Meta Ads canary.`);
  }
  return value;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysBefore(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}
