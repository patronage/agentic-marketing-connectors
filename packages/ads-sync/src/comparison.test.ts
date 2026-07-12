import { describe, expect, it } from "vitest";

import {
  buildHistoricalComparisonArtifact,
  normalizeWarehouseCampaignDailyRow,
  reportingViewSql,
  runHistoricalComparisonGate,
  warehouseCampaignDailyComparisonQuery,
} from "./index.js";
import type { HistoricalComparisonRow } from "./index.js";

const window = {
  endDate: "2026-04-08",
  stableAsOf: "2026-05-08",
  startDate: "2026-04-01",
};

const apiRows: HistoricalComparisonRow[] = [
  {
    campaignId: "campaign-1",
    campaignName: "Persuasion",
    date: "2026-04-01",
    metrics: {
      clicks: 10,
      conversions: 1,
      conversionsValue: 12.5,
      impressions: 1000,
      spend: 123.45,
    },
  },
  {
    campaignId: "campaign-2",
    campaignName: "Mobilization",
    date: "2026-04-01",
    metrics: {
      clicks: 5,
      conversions: 0,
      conversionsValue: 0,
      impressions: 500,
      spend: 50,
    },
  },
];

describe("Historical Comparison Gate", () => {
  it("builds a ready Source Comparison Artifact when rows and metrics match", () => {
    const artifact = buildHistoricalComparisonArtifact({
      apiRows,
      generatedAt: "2026-05-09T00:00:00.000Z",
      provider: "google_ads",
      warehouseRows: structuredClone(apiRows),
      window,
    });

    expect(artifact).toMatchObject({
      generatedAt: "2026-05-09T00:00:00.000Z",
      kind: "ads_sync.source_comparison",
      provider: "google_ads",
      readinessRecommendation: "ready",
      summary: {
        apiRows: 2,
        duplicateRows: 0,
        failedMetrics: 0,
        missingRows: 0,
        passed: true,
        warehouseRows: 2,
        windowIssues: 0,
      },
    });
    expect(artifact.metricResults).toHaveLength(10);
    expect(artifact.criteria).toMatchObject({
      entity: "campaign",
      missingRowsFail: true,
    });
  });

  it("recommends review when warehouse rows are missing", () => {
    const artifact = buildHistoricalComparisonArtifact({
      apiRows,
      provider: "meta_ads",
      warehouseRows: [apiRows[0] as HistoricalComparisonRow],
      window,
    });

    expect(artifact.readinessRecommendation).toBe("review");
    expect(artifact.summary).toMatchObject({
      missingRows: 1,
      passed: false,
    });
    expect(artifact.missingRows).toStrictEqual([
      {
        accountId: null,
        entityId: "campaign-2",
        source: "warehouse",
        windowDate: "2026-04-01",
      },
    ]);
  });

  it("flags metric deltas outside tolerance unless documented", () => {
    const warehouseRows = structuredClone(apiRows);
    const [firstWarehouseRow] = warehouseRows;
    if (!firstWarehouseRow) {
      throw new Error("Expected first warehouse row");
    }
    warehouseRows[0] = {
      ...firstWarehouseRow,
      metrics: { ...firstWarehouseRow.metrics, spend: 130 },
    };

    const failed = buildHistoricalComparisonArtifact({
      apiRows,
      provider: "google_ads",
      warehouseRows,
      window,
    });
    expect(failed.summary.failedMetrics).toBe(1);
    expect(failed.readinessRecommendation).toBe("review");

    const documented = buildHistoricalComparisonArtifact({
      apiRows,
      knownDeltas: [
        {
          entityId: "campaign-1",
          metric: "spend",
          reason: "Provider-side billing adjustment accepted for launch gate.",
          windowDate: "2026-04-01",
        },
      ],
      provider: "google_ads",
      warehouseRows,
      window,
    });
    expect(documented.summary).toMatchObject({
      failedMetrics: 0,
      knownDeltaMetrics: 1,
      passed: true,
    });
    expect(documented.readinessRecommendation).toBe("ready");

    const wrongMetric = buildHistoricalComparisonArtifact({
      apiRows,
      knownDeltas: [
        {
          entityId: "campaign-1",
          metric: "clicks",
          reason: "This should not waive spend.",
          windowDate: "2026-04-01",
        },
      ],
      provider: "google_ads",
      warehouseRows,
      window,
    });
    expect(wrongMetric.summary.failedMetrics).toBe(1);
    expect(wrongMetric.readinessRecommendation).toBe("review");
  });

  it("does not let known deltas waive missing metric values", () => {
    const warehouseRows = structuredClone(apiRows);
    const [firstWarehouseRow] = warehouseRows;
    if (!firstWarehouseRow) {
      throw new Error("Expected first warehouse row");
    }
    warehouseRows[0] = {
      ...firstWarehouseRow,
      metrics: { ...firstWarehouseRow.metrics, spend: null },
    };

    const artifact = buildHistoricalComparisonArtifact({
      apiRows,
      knownDeltas: [
        {
          entityId: "campaign-1",
          metric: "spend",
          reason: "Provider-side billing adjustment accepted for launch gate.",
          windowDate: "2026-04-01",
        },
      ],
      provider: "google_ads",
      warehouseRows,
      window,
    });

    expect(artifact.summary).toMatchObject({
      failedMetrics: 1,
      knownDeltaMetrics: 0,
      passed: false,
    });
    expect(artifact.readinessRecommendation).toBe("review");
    expect(
      artifact.metricResults.find(
        (result) =>
          result.entityId === "campaign-1" && result.metric === "spend"
      )
    ).toMatchObject({
      passed: false,
      reason: "Missing metric value cannot be waived by a known delta.",
      warehouseValue: null,
    });
  });

  it("treats endDate as exclusive when validating stable comparison windows", () => {
    const artifact = buildHistoricalComparisonArtifact({
      apiRows,
      provider: "google_ads",
      warehouseRows: structuredClone(apiRows),
      window: {
        endDate: "2026-04-09",
        stableAsOf: "2026-05-08",
        startDate: "2026-04-01",
      },
    });

    expect(artifact.summary).toMatchObject({
      passed: true,
      windowIssues: 0,
    });
    expect(artifact.readinessRecommendation).toBe("ready");
  });

  it("recommends review when the comparison window is not provider-stable", () => {
    const artifact = buildHistoricalComparisonArtifact({
      apiRows,
      provider: "google_ads",
      warehouseRows: structuredClone(apiRows),
      window: {
        endDate: "2026-04-08",
        stableAsOf: "2026-04-20",
        startDate: "2026-04-01",
      },
    });

    expect(artifact.summary).toMatchObject({
      passed: false,
      windowIssues: 1,
    });
    expect(artifact.readinessRecommendation).toBe("review");
    expect(artifact.windowIssues[0]?.policy).toBe("google_ads_conversion_lag");
  });

  it("uses account identity and reports duplicate source rows", () => {
    const sameCampaignAcrossAccounts: HistoricalComparisonRow[] = [
      {
        accountId: "account-1",
        campaignId: "campaign-1",
        date: "2026-04-01",
        metrics: { clicks: 1 },
      },
      {
        accountId: "account-2",
        campaignId: "campaign-1",
        date: "2026-04-01",
        metrics: { clicks: 2 },
      },
    ];

    const artifact = buildHistoricalComparisonArtifact({
      apiRows: [
        ...sameCampaignAcrossAccounts,
        sameCampaignAcrossAccounts[0] as HistoricalComparisonRow,
      ],
      provider: "meta_ads",
      warehouseRows: sameCampaignAcrossAccounts,
      window,
    });

    expect(artifact.metricResults).toHaveLength(10);
    expect(artifact.summary).toMatchObject({
      duplicateRows: 1,
      passed: false,
    });
    expect(artifact.duplicateRows).toStrictEqual([
      {
        accountId: "account-1",
        entityId: "campaign-1",
        source: "api",
        windowDate: "2026-04-01",
      },
    ]);
  });

  it("runs provider and warehouse adapters into a Source Comparison Artifact", async () => {
    const artifact = await runHistoricalComparisonGate({
      provider: "google_ads",
      readProviderRows: async (request) => {
        expect(request.spec.entity).toBe("campaign");
        return apiRows;
      },
      readWarehouseRows: async (request) => {
        expect(request.sql).toContain("ads_sync_reporting.ads_campaign_daily");
        expect(request.parameters).toStrictEqual([
          "google_ads",
          "2026-04-01",
          "2026-04-08",
        ]);
        return apiRows.map((row) => ({
          account_id: row.accountId,
          campaign_id: row.campaignId,
          campaign_name: row.campaignName,
          clicks: row.metrics.clicks,
          conversions: row.metrics.conversions,
          conversions_value: row.metrics.conversionsValue,
          date_day: row.date,
          impressions: row.metrics.impressions,
          spend: row.metrics.spend,
        }));
      },
      window,
    });

    expect(artifact.summary.passed).toBeTruthy();
    expect(artifact.readinessRecommendation).toBe("ready");
  });

  it("defines the warehouse query over the reporting contract view", () => {
    const query = warehouseCampaignDailyComparisonQuery({
      provider: "meta_ads",
      window,
    });

    expect(query.sql).toContain("ads_sync_reporting.ads_campaign_daily");
    expect(query.sql).toContain("platform = $1");
    expect(query.sql).toContain("ORDER BY date_day, account_id, campaign_id");
    expect(query.parameters).toStrictEqual([
      "meta_ads",
      "2026-04-01",
      "2026-04-08",
    ]);
  });

  it("defines Meta action sums as zero when no matching conversion actions exist", () => {
    expect(reportingViewSql).toContain(
      "SELECT COALESCE(SUM((entry ->> 'value')::numeric), 0)"
    );
  });

  it("treats Meta zero conversion rows as matching the comparison gate", () => {
    const zeroConversionApiRows = [apiRows[1] as HistoricalComparisonRow];
    const artifact = buildHistoricalComparisonArtifact({
      apiRows: zeroConversionApiRows,
      provider: "meta_ads",
      warehouseRows: [
        normalizeWarehouseCampaignDailyRow({
          campaign_id: "campaign-2",
          campaign_name: "Mobilization",
          clicks: "5",
          conversions: "0",
          conversions_value: "0",
          date_day: "2026-04-01",
          impressions: "500",
          spend: "50",
        }),
      ],
      window,
    });

    expect(artifact.summary).toMatchObject({
      failedMetrics: 0,
      passed: true,
    });
    expect(artifact.readinessRecommendation).toBe("ready");
  });

  it("normalizes warehouse campaign daily rows into comparison rows", () => {
    expect(
      normalizeWarehouseCampaignDailyRow({
        campaign_id: "campaign-1",
        campaign_name: "Persuasion",
        clicks: "10",
        conversions: "1",
        conversions_value: "12.50",
        date_day: "2026-04-01",
        impressions: "1000",
        spend: "123.45",
      })
    ).toStrictEqual({
      accountId: null,
      campaignId: "campaign-1",
      campaignName: "Persuasion",
      date: "2026-04-01",
      metrics: {
        clicks: 10,
        conversions: 1,
        conversionsValue: 12.5,
        impressions: 1000,
        spend: 123.45,
      },
    });
  });
});
