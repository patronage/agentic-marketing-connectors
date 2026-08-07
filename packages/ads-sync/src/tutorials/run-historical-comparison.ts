import { runHistoricalComparisonGate } from "@patronage/ads-sync";
import type { HistoricalComparisonRow } from "@patronage/ads-sync";

const providerRows: HistoricalComparisonRow[] = [
  {
    accountId: "act_tutorial",
    campaignId: "campaign_tutorial",
    campaignName: "Tutorial campaign",
    date: "2026-04-01",
    metrics: {
      clicks: 12,
      conversions: 2,
      conversionsValue: 40,
      impressions: 1000,
      spend: 25.5,
    },
  },
];

const warehouseRows = [
  {
    account_id: "act_tutorial",
    campaign_id: "campaign_tutorial",
    campaign_name: "Tutorial campaign",
    clicks: 12,
    conversions: 2,
    conversions_value: 40,
    date_day: "2026-04-01",
    impressions: 1000,
    spend: 25.5,
  },
];

export function runTutorialHistoricalComparison() {
  return runHistoricalComparisonGate({
    generatedAt: "2026-07-25T00:00:00.000Z",
    provider: "meta_ads",
    readProviderRows: ({ spec }) => {
      if (spec.entity !== "campaign") {
        throw new Error("Tutorial expects the campaign comparison contract.");
      }
      return Promise.resolve(providerRows);
    },
    readWarehouseRows: ({ parameters, sql }) => {
      if (
        !sql.includes("ads_sync_reporting.ads_campaign_daily") ||
        parameters.length !== 3
      ) {
        throw new Error("Tutorial received an unexpected warehouse query.");
      }
      return Promise.resolve(warehouseRows);
    },
    window: {
      endDate: "2026-04-02",
      stableAsOf: "2026-07-25",
      startDate: "2026-04-01",
    },
  });
}

const artifact = await runTutorialHistoricalComparison();
console.log(
  JSON.stringify(
    {
      kind: artifact.kind,
      readinessRecommendation: artifact.readinessRecommendation,
      summary: artifact.summary,
    },
    null,
    2
  )
);
