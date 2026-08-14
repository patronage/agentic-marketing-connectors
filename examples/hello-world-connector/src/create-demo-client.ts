import { createGoogleAdsClient } from "@patronage/google-ads";
import { normalizeCustomerId } from "@patronage/google-ads/core";

import { campaignSnapshotQuery } from "./campaign-snapshot.js";

export const demoCustomerId = "123-456-7890";

const syntheticCampaignName = "Spring Donor Drive | Search";
const syntheticClicks = 128;
const syntheticConversions = 6;
const syntheticCostMicros = "245500000";
const syntheticImpressions = 3120;

export function createDemoClient() {
  const fakeFetch: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { query?: string };

    if (!matchesCampaignSnapshotQuery(body.query)) {
      return Response.json(
        { error: { message: "Unexpected example query." } },
        { status: 400 }
      );
    }

    return Response.json(
      {
        results: [
          {
            campaign: {
              name: syntheticCampaignName,
            },
            customer: {
              id: normalizeCustomerId(demoCustomerId),
            },
            metrics: {
              clicks: syntheticClicks,
              conversions: syntheticConversions,
              costMicros: syntheticCostMicros,
              impressions: syntheticImpressions,
            },
          },
        ],
      },
      {
        headers: {
          "request-id": "example-request-id",
        },
      }
    );
  };

  return createGoogleAdsClient({
    auth: {
      getAccessToken: async () => "example-access-token",
    },
    developerToken: "example-developer-token",
    fetch: fakeFetch,
  });
}

function matchesCampaignSnapshotQuery(query: string | undefined): boolean {
  if (!query) {
    return false;
  }

  const normalizedQuery = normalizeWhitespace(query);
  const normalizedExpected = normalizeWhitespace(campaignSnapshotQuery);

  return normalizedQuery === normalizedExpected;
}

function normalizeWhitespace(value: string): string {
  return value.replaceAll(/\s+/gu, " ").trim();
}
