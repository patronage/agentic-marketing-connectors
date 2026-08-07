import { readFile } from "node:fs/promises";

import {
  createGoogleAdsClient,
  runGoogleAdsReadCanary,
} from "../dist/index.js";
import {
  assertGoogleAdsMutationSmokeFixtures,
  runGoogleAdsMutationCanary,
} from "../dist/mutation-canary.js";
import { createGoogleOAuthRefreshAdapter } from "../dist/oauth.js";
import {
  hasFailedSmokeResults,
  parseLiveSmokeArgs,
  summarizeMutationResults,
} from "./live-smoke-options.mjs";

const args = parseLiveSmokeArgs(process.argv.slice(2));
const customerId = args.customerId ?? process.env.GOOGLE_ADS_CUSTOMER_ID;

if (!customerId) {
  throw new Error(
    "Pass --customer-id <id> or set GOOGLE_ADS_CUSTOMER_ID for the live smoke."
  );
}

const mutationFixtures = args.allowMutations
  ? await loadMutationFixtures(args.mutationFixtures)
  : undefined;

const secrets = {
  GOOGLE_ADS_CLIENT_ID: requiredEnv("GOOGLE_ADS_CLIENT_ID"),
  GOOGLE_ADS_CLIENT_SECRET: requiredEnv("GOOGLE_ADS_CLIENT_SECRET"),
  GOOGLE_ADS_DEVELOPER_TOKEN: requiredEnv("GOOGLE_ADS_DEVELOPER_TOKEN"),
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? "",
  GOOGLE_ADS_REFRESH_TOKEN: requiredEnv("GOOGLE_ADS_REFRESH_TOKEN"),
};

const auth = createGoogleOAuthRefreshAdapter({
  credentials: {
    clientId: secrets.GOOGLE_ADS_CLIENT_ID,
    clientSecret: secrets.GOOGLE_ADS_CLIENT_SECRET,
    refreshToken: secrets.GOOGLE_ADS_REFRESH_TOKEN,
  },
});

const client = createGoogleAdsClient({
  auth,
  developerToken: secrets.GOOGLE_ADS_DEVELOPER_TOKEN,
  loginCustomerId: optionalValue(secrets.GOOGLE_ADS_LOGIN_CUSTOMER_ID),
});

const results = await runGoogleAdsReadCanary(client, { customerId });
const mutationResults = mutationFixtures
  ? await runGoogleAdsMutationCanary(client, {
      customerId,
      fixtures: mutationFixtures,
    })
  : undefined;

console.log(
  JSON.stringify(
    {
      customerId,
      mode: args.allowMutations ? "mutation-validate-only" : "read-only",
      mutationResults,
      mutationSummary: mutationResults
        ? summarizeMutationResults(mutationResults)
        : undefined,
      provider: "google-ads",
      readResults: results,
    },
    null,
    2
  )
);

if (
  hasFailedSmokeResults(results) ||
  (mutationResults && hasFailedSmokeResults(mutationResults))
) {
  process.exitCode = 1;
}

async function loadMutationFixtures(path) {
  if (!path) {
    throw new Error(
      "Pass --mutation-fixtures <path> with --allow-mutations. The smoke never discovers or creates fixtures implicitly."
    );
  }

  return assertGoogleAdsMutationSmokeFixtures(
    JSON.parse(await readFile(path, "utf-8"))
  );
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Set ${name} before running the Google Ads canary.`);
  }
  return value;
}

function optionalValue(value) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
