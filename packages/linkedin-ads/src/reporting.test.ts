import { describe, expect, it, vi } from "vitest";

import {
  createLinkedInReportingClient,
  LINKEDIN_ANALYTICS_PIVOTS,
  LINKEDIN_TIME_GRANULARITIES,
} from "./reporting.js";
import type { GetAnalyticsInput } from "./reporting.js";

const since = { day: 1, month: 7, year: 2026 };
const until = { day: 31, month: 7, year: 2026 };

describe(createLinkedInReportingClient, () => {
  it("supports documented professional-demographic pivots and facets", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        elements: [
          {
            impressions: 10,
            pivotValues: ["urn:li:seniority:4"],
          },
        ],
      })
    );
    const client = createLinkedInReportingClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: fetchMock,
    });

    await expect(
      client.getAnalytics({
        campaignGroups: ["10"],
        companies: ["20"],
        pivot: "MEMBER_SENIORITY",
        shares: ["30"],
        since,
        timeGranularity: "YEARLY",
        until,
      })
    ).resolves.toHaveLength(1);

    expect(LINKEDIN_ANALYTICS_PIVOTS).toContain("MEMBER_JOB_TITLE");
    expect(LINKEDIN_TIME_GRANULARITIES).toContain("YEARLY");
    const rawUrl = String(fetchMock.mock.calls[0]?.[0]);
    const url = new URL(rawUrl);
    expect(url.pathname).toBe("/rest/adAnalytics");
    expect(rawUrl).toContain("q=analytics");
    expect(rawUrl).toContain("pivot=MEMBER_SENIORITY");
    expect(rawUrl).toContain(
      "fields=pivotValues,dateRange,impressions,clicks,costInLocalCurrency"
    );
    expect(rawUrl).toContain(
      "campaignGroups=List(urn%3Ali%3AsponsoredCampaignGroup%3A10)"
    );
    expect(rawUrl).toContain("companies=List(urn%3Ali%3Aorganization%3A20)");
    expect(rawUrl).toContain("shares=List(urn%3Ali%3Ashare%3A30)");
  });

  it("supports the statistics finder with up to three pivots", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ elements: [] }));
    const client = createLinkedInReportingClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: fetchMock,
    });

    await client.getAnalyticsStatistics({
      pivots: ["CAMPAIGN", "CREATIVE", "CONVERSION"],
      since,
      until,
    });

    const rawUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(rawUrl).toContain("q=statistics");
    expect(rawUrl).toContain("pivots=List(CAMPAIGN,CREATIVE,CONVERSION)");
    expect(rawUrl).not.toContain("&pivot=");
  });

  it("uses the statistics finder when a spread input retains a pivot", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ elements: [] }));
    const client = createLinkedInReportingClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: fetchMock,
    });
    const analyticsInput: GetAnalyticsInput = {
      pivot: "CAMPAIGN",
      since,
      until,
    };

    await client.getAnalyticsStatistics({
      ...analyticsInput,
      pivots: ["CAMPAIGN", "CREATIVE"],
    });

    const rawUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(rawUrl).toContain("q=statistics");
    expect(rawUrl).toContain("pivots=List(CAMPAIGN,CREATIVE)");
    expect(rawUrl).not.toContain("&pivot=");
  });

  it("rejects invalid statistics requests before fetch", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ elements: [] }));
    const client = createLinkedInReportingClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: fetchMock,
    });

    await expect(
      client.getAnalyticsStatistics({ pivots: [], since, until })
    ).rejects.toThrow("between one and three pivots");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
