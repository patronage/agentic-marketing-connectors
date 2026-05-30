import { createGoogleAdsClient } from "@patronage/google-ads";
import {
  microsToCurrency,
  normalizeCustomerId,
  type GoogleAdsRow,
} from "@patronage/google-ads/core";

const customerId = "123-456-7890";
const syntheticCampaignName = "Hello Connector";
const syntheticCostMicros = "2500000";

const fakeFetch: typeof fetch = async (url, init) => {
  const body = JSON.parse(String(init?.body ?? "{}")) as { query?: string };

  if (!body.query?.includes("campaign.name")) {
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
            id: normalizeCustomerId(customerId),
          },
          metrics: {
            costMicros: syntheticCostMicros,
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

const client = createGoogleAdsClient({
  auth: {
    getAccessToken: async () => "example-access-token",
  },
  developerToken: "example-developer-token",
  fetch: fakeFetch,
});

const result = await client.search({
  customerId,
  query: `
    SELECT
      customer.id,
      campaign.name,
      metrics.cost_micros
    FROM campaign
    LIMIT 1
  `,
});

const [row] = result.rows as GoogleAdsRow[];
const campaign = row?.campaign as { name?: string } | undefined;
const customer = row?.customer as { id?: string } | undefined;
const metrics = row?.metrics as { costMicros?: unknown } | undefined;

console.log(
  JSON.stringify(
    {
      campaignName: campaign?.name,
      customerId: customer?.id,
      requestId: result.requestId,
      spend: microsToCurrency(metrics?.costMicros),
    },
    null,
    2
  )
);
