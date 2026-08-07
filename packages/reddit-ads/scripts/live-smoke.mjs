import {
  createRedditAdsClient,
  runRedditAdsReadCanary,
} from "../dist/index.js";

const accessToken = requiredEnv("REDDIT_ADS_ACCESS_TOKEN");
const adAccountId = requiredEnv("REDDIT_ADS_AD_ACCOUNT_ID");
const client = createRedditAdsClient({ accessToken, adAccountId });
const results = await runRedditAdsReadCanary(client);

console.log(JSON.stringify({ adAccountId, results }, null, 2));
if (results.some(({ status }) => status === "failed")) {
  process.exitCode = 1;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Set ${name} before running the Reddit Ads canary.`);
  }
  return value;
}
