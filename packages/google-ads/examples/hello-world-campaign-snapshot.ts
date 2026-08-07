import { microsToCurrency } from "../src/core/index.js";
import type { GoogleAdsRow } from "../src/core/index.js";
import { createGoogleAdsClient } from "../src/index.js";
import type { GoogleAdsClient } from "../src/index.js";

export interface CampaignSnapshot {
  campaignName: string | null;
  clicks: number;
  customerId: string;
  requestId: string | null;
  spend: number;
}

const customerId = "1234567890";

const campaignSnapshotQuery = `
  SELECT
    customer.id,
    campaign.name,
    metrics.clicks,
    metrics.cost_micros
  FROM campaign
  WHERE segments.date DURING LAST_30_DAYS
  ORDER BY metrics.cost_micros DESC
  LIMIT 1
`;

export async function fetchCampaignSnapshot(
  client: GoogleAdsClient,
  requestedCustomerId: string
): Promise<CampaignSnapshot> {
  const result = await client.search({
    customerId: requestedCustomerId,
    query: campaignSnapshotQuery,
  });
  const [row] = result.rows as GoogleAdsRow[];
  const campaign = record(row?.campaign);
  const customer = record(row?.customer);
  const metrics = record(row?.metrics);

  return {
    campaignName: stringValue(campaign?.name),
    clicks: numberValue(metrics?.clicks),
    customerId: stringValue(customer?.id) ?? requestedCustomerId,
    requestId: result.requestId,
    spend: microsToCurrency(metrics?.costMicros),
  };
}

/** Runs without credentials or network access. */
export function runHelloWorldCampaignSnapshot() {
  return fetchCampaignSnapshot(createSyntheticClient(), customerId);
}

function createSyntheticClient() {
  return createGoogleAdsClient({
    auth: {
      getAccessToken() {
        return Promise.resolve("synthetic-access-token");
      },
    },
    developerToken: "synthetic-developer-token",
    fetch: (_url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { query?: string };
      if (!body.query?.includes("FROM campaign")) {
        return Promise.resolve(
          Response.json(
            { error: { message: "Unexpected tutorial query." } },
            { status: 400 }
          )
        );
      }
      return Promise.resolve(
        Response.json(
          {
            results: [
              {
                campaign: { name: "Spring donor drive" },
                customer: { id: customerId },
                metrics: { clicks: 128, costMicros: "245500000" },
              },
            ],
          },
          { headers: { "request-id": "tutorial-request-001" } }
        )
      );
    },
  });
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function numberValue(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
