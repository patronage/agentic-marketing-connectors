import {
  createLinkedInAdsClient,
  runLinkedInAdsReadCanary,
} from "../dist/index.js";

const accessToken = requiredEnv("LINKEDIN_ACCESS_TOKEN");
const adAccountId = requiredEnv("LINKEDIN_AD_ACCOUNT_ID");
const organizationUrn = requiredEnv("LINKEDIN_ORGANIZATION_URN");
const until = parseDate(process.env.LINKEDIN_ADS_CANARY_UNTIL ?? today());
const since = parseDate(
  process.env.LINKEDIN_ADS_CANARY_SINCE ?? daysBefore(until, 1)
);
const client = createLinkedInAdsClient({ accessToken, adAccountId });
const results = await runLinkedInAdsReadCanary(client, {
  analytics: { since, until },
  organizationUrn,
});

console.log(JSON.stringify({ adAccountId, results }, null, 2));
if (results.some(({ status }) => status === "failed")) {
  process.exitCode = 1;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Set ${name} before running the LinkedIn Ads canary.`);
  }
  return value;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysBefore(value, days) {
  const date = new Date(Date.UTC(value.year, value.month - 1, value.day));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function parseDate(value) {
  const match = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u.exec(value);
  if (!match?.groups) {
    throw new Error("LinkedIn canary dates must use YYYY-MM-DD.");
  }
  return {
    day: Number(match.groups.day),
    month: Number(match.groups.month),
    year: Number(match.groups.year),
  };
}
