import {
  microsToCurrency,
  type GoogleAdsRow,
} from "@patronage/google-ads/core";
import type { GoogleAdsClient } from "@patronage/google-ads/rest";

export interface CampaignSnapshot {
  campaignName: string | null;
  clicks: number;
  conversions: number;
  customerId: string;
  impressions: number;
  requestId: string | null;
  spend: number;
}

export const campaignSnapshotQuery = `
  SELECT
    customer.id,
    campaign.name,
    metrics.clicks,
    metrics.conversions,
    metrics.impressions,
    metrics.cost_micros
  FROM campaign
  WHERE segments.date DURING LAST_30_DAYS
  ORDER BY metrics.cost_micros DESC
  LIMIT 1
`;

export async function fetchCampaignSnapshot(
  client: GoogleAdsClient,
  customerId: string
): Promise<CampaignSnapshot> {
  const result = await client.search({
    customerId,
    query: campaignSnapshotQuery,
  });

  const [row] = result.rows as GoogleAdsRow[];
  const campaign = asRecord(row?.campaign);
  const customer = asRecord(row?.customer);
  const metrics = asRecord(row?.metrics);

  return {
    campaignName: typeof campaign?.name === "string" ? campaign.name : null,
    clicks: toNumber(metrics?.clicks),
    conversions: toNumber(metrics?.conversions),
    customerId:
      typeof customer?.id === "string"
        ? customer.id
        : customerId.replaceAll("-", ""),
    impressions: toNumber(metrics?.impressions),
    requestId: result.requestId,
    spend: microsToCurrency(metrics?.costMicros),
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function toNumber(value: unknown): number {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) ? numericValue : 0;
}
