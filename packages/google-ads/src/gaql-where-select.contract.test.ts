import { describe, expect, it, vi } from "vitest";

import { runComplianceChecks } from "./compliance/index.js";
import {
  getAdGroupPerformance,
  getAdPolicyDiagnostics,
  getAgeRangePerformance,
  getAssetPerformance,
  getAssetGroupProductGroupPerformance,
  getAssetPolicyDiagnostics,
  getAssetTopCombinations,
  getCampaignLocationCriteria,
  getCampaignPerformance,
  getCampaignSearchTerms,
  getChangeEvents,
  getChangeStatusChanges,
  getClickDetails,
  getDevicePerformance,
  getGenderPerformance,
  getGeographicPerformance,
  getIncomeRangePerformance,
  getKeywordPerformance,
  getLocationCriterionPerformance,
  getReachFrequencyPerformance,
  getSearchTerms,
  getVideoPerformance,
} from "./reports/index.js";
import {
  resolveAdGroup,
  resolveCampaign,
  resolveGeoTarget,
} from "./resolvers/index.js";
import type { GoogleAdsClient } from "./rest/index.js";
import {
  getCampaignConversionGoals,
  getConversionActions,
  getCustomerConversionGoals,
} from "./workflows/conversion-goals.js";
import { getRecommendations } from "./workflows/recommendations.js";

// Google Ads API v24 rejects queries whose WHERE clause references a field
// missing from SELECT (EXPECTED_REFERENCED_FIELD_IN_SELECT_CLAUSE). Core date
// segments used for date ranges are the documented exception:
// https://developers.google.com/google-ads/api/docs/query/structure
const CORE_DATE_SEGMENTS = new Set([
  "segments.date",
  "segments.month",
  "segments.quarter",
  "segments.week",
  "segments.year",
]);

const GAQL_FIELD_PATTERN = /[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+/gu;
const QUOTED_VALUE_PATTERN = /'[^']*'/gu;

function selectedFields(query: string): Set<string> {
  const select = /SELECT(?<fields>[\s\S]+?)FROM/u.exec(query)?.groups?.fields;
  if (!select) {
    throw new Error(`Query has no SELECT clause: ${query}`);
  }
  return new Set(select.split(",").map((field) => field.trim()));
}

function whereFields(query: string): Set<string> {
  const where = /WHERE(?<conditions>[\s\S]+?)(?:ORDER BY|LIMIT|$)/u.exec(query)
    ?.groups?.conditions;
  if (!where) {
    return new Set();
  }
  const withoutValues = where.replaceAll(QUOTED_VALUE_PATTERN, "''");
  return new Set(withoutValues.match(GAQL_FIELD_PATTERN));
}

function missingWhereFields(query: string): string[] {
  const selected = selectedFields(query);
  return [...whereFields(query)].filter(
    (field) => !(CORE_DATE_SEGMENTS.has(field) || selected.has(field))
  );
}

function captureClient(rows: Record<string, unknown>[] = []): {
  client: GoogleAdsClient;
  queries: () => string[];
} {
  const search = vi
    .fn<GoogleAdsClient["search"]>()
    .mockResolvedValue({ requestId: "req", rows });
  return {
    client: { search } as unknown as GoogleAdsClient,
    queries: () => search.mock.calls.map(([request]) => request.query),
  };
}

const REPORT_INPUT = { campaignId: "77", customerId: "123", days: 30 } as const;
const CLICK_DATE = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

interface QueryDriver {
  name: string;
  rows?: Record<string, unknown>[];
  run: (client: GoogleAdsClient) => Promise<unknown>;
}

const drivers: QueryDriver[] = [
  {
    name: "campaign performance report",
    run: (client) => getCampaignPerformance(client, REPORT_INPUT),
  },
  {
    name: "ad-group performance report",
    run: (client) => getAdGroupPerformance(client, REPORT_INPUT),
  },
  {
    name: "device performance report (video-only)",
    run: (client) =>
      getDevicePerformance(client, { ...REPORT_INPUT, videoOnly: true }),
  },
  {
    name: "keyword performance report",
    run: (client) => getKeywordPerformance(client, REPORT_INPUT),
  },
  {
    name: "search terms report",
    run: (client) => getSearchTerms(client, REPORT_INPUT),
  },
  {
    name: "campaign search terms report",
    run: (client) => getCampaignSearchTerms(client, REPORT_INPUT),
  },
  {
    name: "asset group product group performance report",
    run: (client) => getAssetGroupProductGroupPerformance(client, REPORT_INPUT),
  },
  {
    name: "click details report",
    run: (client) =>
      getClickDetails(client, {
        adGroupId: "88",
        campaignId: "77",
        customerId: "123",
        date: CLICK_DATE,
        gclid: "test-gclid",
      }),
  },
  {
    name: "video performance report",
    run: (client) => getVideoPerformance(client, REPORT_INPUT),
  },
  {
    name: "age range performance report",
    run: (client) => getAgeRangePerformance(client, REPORT_INPUT),
  },
  {
    name: "gender performance report",
    run: (client) => getGenderPerformance(client, REPORT_INPUT),
  },
  {
    name: "income range performance report",
    run: (client) => getIncomeRangePerformance(client, REPORT_INPUT),
  },
  {
    name: "geographic performance report",
    run: (client) => getGeographicPerformance(client, REPORT_INPUT),
  },
  {
    name: "campaign location criteria report",
    run: (client) =>
      getCampaignLocationCriteria(client, {
        campaignId: "77",
        customerId: "123",
      }),
  },
  {
    name: "location criterion performance report",
    run: (client) => getLocationCriterionPerformance(client, REPORT_INPUT),
  },
  {
    name: "reach & frequency performance report",
    run: (client) => getReachFrequencyPerformance(client, REPORT_INPUT),
  },
  {
    name: "asset performance report",
    run: (client) =>
      getAssetPerformance(client, { ...REPORT_INPUT, assetGroupId: "88" }),
  },
  {
    name: "asset top combinations report",
    run: (client) =>
      getAssetTopCombinations(client, { ...REPORT_INPUT, assetGroupId: "88" }),
  },
  {
    name: "change events report",
    run: (client) =>
      getChangeEvents(client, {
        customerId: "123",
        days: 30,
        resourceTypes: ["CAMPAIGN"],
      }),
  },
  {
    name: "change status report",
    run: (client) =>
      getChangeStatusChanges(client, {
        customerId: "123",
        days: 30,
        resourceTypes: ["CAMPAIGN"],
      }),
  },
  {
    name: "ad policy diagnostics report",
    run: (client) =>
      getAdPolicyDiagnostics(client, {
        adGroupId: "88",
        approvalStatuses: ["DISAPPROVED"],
        campaignId: "77",
        customerId: "123",
        reviewStatuses: ["REVIEWED"],
      }),
  },
  {
    name: "asset policy diagnostics report",
    run: (client) =>
      getAssetPolicyDiagnostics(client, {
        approvalStatuses: ["DISAPPROVED"],
        customerId: "123",
      }),
  },
  {
    name: "Ad Grant compliance checks",
    run: (client) => runComplianceChecks(client, { customerId: "123" }),
  },
  {
    name: "recommendations (campaign filter)",
    run: (client) =>
      getRecommendations(client, {
        campaignId: "77",
        customerId: "123",
        types: ["KEYWORD"],
      }),
  },
  {
    name: "conversion actions",
    run: (client) => getConversionActions(client, { customerId: "123" }),
  },
  {
    name: "customer conversion goals",
    run: (client) => getCustomerConversionGoals(client, { customerId: "123" }),
  },
  {
    name: "campaign conversion goals",
    run: (client) =>
      getCampaignConversionGoals(client, {
        campaignId: "77",
        customerId: "123",
      }),
  },
  {
    name: "campaign resolver",
    rows: [
      {
        campaign: {
          id: "77",
          name: "Brand",
          resourceName: "customers/123/campaigns/77",
        },
      },
    ],
    run: (client) =>
      resolveCampaign(client, { customerId: "123", value: "Brand" }),
  },
  {
    name: "ad-group resolver",
    rows: [
      {
        adGroup: {
          id: "88",
          name: "Core",
          resourceName: "customers/123/adGroups/88",
        },
      },
    ],
    run: (client) =>
      resolveAdGroup(client, { customerId: "123", value: "Core" }),
  },
  {
    name: "geo target resolver",
    rows: [
      {
        geoTargetConstant: {
          id: "1014044",
          name: "California",
          resourceName: "geoTargetConstants/1014044",
        },
      },
    ],
    run: (client) =>
      resolveGeoTarget(client, { customerId: "123", value: "California" }),
  },
];

describe("GAQL v24 WHERE/SELECT contract", () => {
  it.each(drivers)(
    "$name selects every WHERE-referenced field",
    async ({ rows, run }) => {
      const { client, queries } = captureClient(rows);
      await run(client);
      const captured = queries();
      expect(captured.length).toBeGreaterThan(0);
      for (const query of captured) {
        expect(
          missingWhereFields(query),
          `WHERE fields missing from SELECT in: ${query}`
        ).toStrictEqual([]);
      }
    }
  );

  it("keeps the compliance keyword queries selecting the filtered criterion status", async () => {
    const { client, queries } = captureClient();
    await runComplianceChecks(client, {
      checks: ["cpc", "quality", "single-word"],
      customerId: "123",
    });
    for (const query of queries()) {
      expect(selectedFields(query)).toContain("ad_group_criterion.status");
    }
  });

  it("selects campaign_criterion.type in the campaign location criteria query", async () => {
    const { client, queries } = captureClient();
    await getCampaignLocationCriteria(client, { customerId: "123" });
    expect(selectedFields(queries()[0] ?? "")).toContain(
      "campaign_criterion.type"
    );
  });

  it("adds campaign.id to the recommendations SELECT only with the campaign filter", async () => {
    const filtered = captureClient();
    await getRecommendations(filtered.client, {
      campaignId: "77",
      customerId: "123",
    });
    expect(selectedFields(filtered.queries()[0] ?? "")).toContain(
      "campaign.id"
    );

    const unfiltered = captureClient();
    await getRecommendations(unfiltered.client, { customerId: "123" });
    const query = unfiltered.queries()[0] ?? "";
    expect(selectedFields(query)).not.toContain("campaign.id");
    expect(query).not.toContain("WHERE");
  });
});
