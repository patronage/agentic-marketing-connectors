import { describe, expect, it, vi } from "vitest";

import type { GoogleAdsClient } from "../rest/index.js";
import {
  getAdPolicyDiagnostics,
  getAgeRangePerformance,
  getAssetGroupProductGroupPerformance,
  getAssetPerformance,
  getAssetPolicyDiagnostics,
  getAssetTopCombinations,
  getCampaignLocationCriteria,
  getCampaignPerformance,
  getCampaignSearchTerms,
  getChangeEvents,
  getChangeStatusChanges,
  getClickDetails,
  getGeographicPerformance,
  getKeywordPerformance,
  getLocationCriterionPerformance,
  getReachFrequencyPerformance,
  getSearchTerms,
  getVideoPerformance,
  normalizeAdPolicyDiagnosticRow,
  normalizeAdGroupPerformanceRow,
  normalizeAudienceSegmentRow,
  normalizeAssetCombinationRow,
  normalizeAssetGroupProductGroupRow,
  normalizeAssetPerformanceRow,
  normalizeAssetPolicyDiagnosticRow,
  normalizeCampaignLocationCriterionRow,
  normalizeCampaignPerformanceRow,
  normalizeCampaignSearchTermRow,
  normalizeChangeEventRow,
  normalizeChangeStatusRow,
  normalizeClickDetailRow,
  normalizeDevicePerformanceRow,
  normalizeGeographicRow,
  normalizeKeywordPerformanceRow,
  normalizeLocationCriterionPerformanceRow,
  normalizeReachFrequencyRow,
  normalizeSearchTermRow,
  normalizeVideoPerformanceRow,
} from "./index.js";

function dateDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

describe("campaign report normalization", () => {
  it("normalizes ad-group performance rows", () => {
    expect(
      normalizeAdGroupPerformanceRow({
        adGroup: { id: "22", name: "Core", status: "ENABLED" },
        campaign: { id: "11", name: "Search" },
        metrics: {
          clicks: "20",
          conversions: 3,
          costMicros: "2500000",
          ctr: 0.08,
          impressions: "250",
        },
      })
    ).toStrictEqual({
      campaignId: "11",
      campaignName: "Search",
      clicks: 20,
      conversions: 3,
      cost: 2.5,
      ctr: 0.08,
      id: "22",
      impressions: 250,
      name: "Core",
      status: "ENABLED",
    });
  });

  it("normalizes device performance rows", () => {
    expect(
      normalizeDevicePerformanceRow({
        campaign: { id: "11", name: "Search", status: "PAUSED" },
        metrics: {
          clicks: "10",
          conversions: "2",
          cost_micros: "1750000",
          ctr: "0.05",
          impressions: "200",
        },
        segments: { device: "MOBILE" },
      })
    ).toStrictEqual({
      campaignId: "11",
      campaignName: "Search",
      clicks: 10,
      conversions: 2,
      cost: 1.75,
      ctr: 0.05,
      device: "MOBILE",
      impressions: 200,
      status: "PAUSED",
    });
  });

  it("normalizes REST lower-camel rows into stable campaign metrics", () => {
    expect(
      normalizeCampaignPerformanceRow({
        campaign: {
          advertisingChannelType: "SEARCH",
          id: "100",
          name: "Issue Search",
          status: "ENABLED",
        },
        campaignBudget: { amountMicros: "150000000" },
        metrics: {
          averageCpc: "2400000",
          clicks: "90",
          conversions: "12",
          conversionsValue: "0",
          costMicros: "216000000",
          ctr: 0.06,
          impressions: "1500",
        },
      })
    ).toStrictEqual({
      avgCpc: 2.4,
      channelType: "SEARCH",
      clicks: 90,
      conversions: 12,
      conversionsValue: 0,
      cost: 216,
      ctr: 0.06,
      dailyBudget: 150,
      id: "100",
      impressions: 1500,
      name: "Issue Search",
      status: "ENABLED",
    });
  });

  it("normalizes legacy snake-case rows for parity fixtures", () => {
    expect(
      normalizeCampaignPerformanceRow({
        campaign: {
          advertising_channel_type: "SEARCH",
          id: 123,
          status: "PAUSED",
        },
        campaign_budget: { amount_micros: 10_000_000 },
        metrics: {
          average_cpc: 250_000,
          clicks: 4,
          conversions: 0,
          conversions_value: 0,
          cost_micros: 1_000_000,
          ctr: 0.1,
          impressions: 40,
        },
      })
    ).toMatchObject({
      avgCpc: 0.25,
      channelType: "SEARCH",
      cost: 1,
      dailyBudget: 10,
      id: "123",
      name: "Unknown",
      status: "PAUSED",
    });
  });

  it("queries campaign performance with the expected GAQL fields", async () => {
    const client = {
      search: vi.fn<GoogleAdsClient["search"]>().mockResolvedValue({
        requestId: "req",
        rows: [
          {
            campaign: {
              advertisingChannelType: "SEARCH",
              id: "1",
              name: "Campaign",
              status: "ENABLED",
            },
            metrics: { clicks: "1" },
          },
        ],
      }),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
    };

    const rows = await getCampaignPerformance(client, {
      customerId: "1234567890",
      days: 30,
    });

    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining("campaign.advertising_channel_type"),
    });
    expect(rows).toStrictEqual([
      expect.objectContaining({
        clicks: 1,
        id: "1",
        name: "Campaign",
      }),
    ]);
  });

  it("supports explicit campaign performance date ranges", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi.fn<GoogleAdsClient["search"]>().mockResolvedValue({
        requestId: "req",
        rows: [],
      }),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await getCampaignPerformance(client, {
      customerId: "1234567890",
      since: "2026-05-01",
      until: "2026-05-21",
    });

    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining(
        "segments.date BETWEEN '2026-05-01' AND '2026-05-21'"
      ),
    });
  });

  it("paginates campaign performance before normalizing rows", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi
        .fn<GoogleAdsClient["search"]>()
        .mockResolvedValueOnce({
          nextPageToken: "page-2",
          requestId: "req-1",
          rows: [
            {
              campaign: { id: "1", name: "First" },
              metrics: { clicks: "1" },
            },
          ],
        })
        .mockResolvedValueOnce({
          requestId: "req-2",
          rows: [
            {
              campaign: { id: "2", name: "Second" },
              metrics: { clicks: "2" },
            },
          ],
        }),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    const rows = await getCampaignPerformance(client, {
      customerId: "1234567890",
      days: 30,
    });

    expect(client.search).toHaveBeenNthCalledWith(2, {
      customerId: "1234567890",
      pageToken: "page-2",
      query: expect.stringContaining("FROM campaign"),
    });
    expect(rows).toStrictEqual([
      expect.objectContaining({ clicks: 1, id: "1" }),
      expect.objectContaining({ clicks: 2, id: "2" }),
    ]);
  });

  it("rejects unsupported date ranges instead of coercing them", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await expect(
      getCampaignPerformance(client, {
        customerId: "1234567890",
        days: 21,
      })
    ).rejects.toThrow("days must be one of 7, 14, 30, or 90");
    expect(client.search).not.toHaveBeenCalled();
  });

  it("rejects malformed explicit date ranges before querying", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await expect(
      getCampaignPerformance(client, {
        customerId: "1234567890",
        since: "2026/05/01",
        until: "2026-05-21",
      })
    ).rejects.toThrow("since must use YYYY-MM-DD format");

    await expect(
      getCampaignPerformance(client, {
        customerId: "1234567890",
        since: "2026-05-22",
        until: "2026-05-21",
      })
    ).rejects.toThrow("since must be on or before until");

    expect(client.search).not.toHaveBeenCalled();
  });

  it("normalizes keyword rows from REST lower-camel fields", () => {
    expect(
      normalizeKeywordPerformanceRow({
        adGroup: { id: "22", name: "Community Programs" },
        adGroupCriterion: {
          criterionId: "333",
          keyword: {
            matchType: "PHRASE",
            text: "example community fund programs",
          },
          qualityInfo: {
            creativeQualityScore: "AVERAGE",
            postClickQualityScore: "BELOW_AVERAGE",
            qualityScore: "2",
            searchPredictedCtr: "BELOW_AVERAGE",
          },
          status: "ENABLED",
        },
        campaign: { id: "1", name: "Issue Search" },
        metrics: {
          averageCpc: "1200000",
          clicks: "25",
          conversions: "0",
          costMicros: "30000000",
          ctr: 0.02,
          impressions: "120",
          searchImpressionShare: 0.41,
        },
      })
    ).toStrictEqual({
      adGroupId: "22",
      adGroupName: "Community Programs",
      avgCpc: 1.2,
      campaignId: "1",
      campaignName: "Issue Search",
      clicks: 25,
      conversions: 0,
      cost: 30,
      creativeQuality: "AVERAGE",
      criterionId: "333",
      ctr: 0.02,
      impressions: 120,
      keyword: "example community fund programs",
      landingPageExperience: "BELOW_AVERAGE",
      matchType: "PHRASE",
      negative: false,
      qualityScore: 2,
      searchImpressionShare: 0.41,
      searchPredictedCtr: "BELOW_AVERAGE",
      status: "ENABLED",
    });
  });

  it("normalizes search-term rows from REST lower-camel fields", () => {
    expect(
      normalizeSearchTermRow({
        adGroup: { id: "22", name: "Community Programs" },
        campaign: { id: "1", name: "Issue Search" },
        metrics: {
          averageCpc: "5500000",
          clicks: "30",
          conversions: "0",
          costMicros: "165000000",
          ctr: 0.03,
          impressions: "1000",
        },
        searchTermView: {
          searchTerm: "example community fund events",
          status: "ADDED",
        },
      })
    ).toStrictEqual({
      adGroupId: "22",
      adGroupName: "Community Programs",
      avgCpc: 5.5,
      campaignId: "1",
      campaignName: "Issue Search",
      clicks: 30,
      conversions: 0,
      cost: 165,
      ctr: 0.03,
      impressions: 1000,
      searchTerm: "example community fund events",
      status: "ADDED",
    });
  });

  it("normalizes campaign search-term rows from both REST casing styles", () => {
    expect(
      normalizeCampaignSearchTermRow({
        campaign: {
          id: "100",
          name: "Performance Max",
          resourceName: "customers/1234567890/campaigns/100",
          status: "ENABLED",
        },
        campaignSearchTermView: {
          campaign: "customers/1234567890/campaigns/100",
          resourceName:
            "customers/1234567890/campaignSearchTermViews/100~ZG9uYXRl",
          searchTerm: "donate to a local nonprofit",
        },
        metrics: {
          averageCpc: "2500000",
          clicks: "20",
          conversions: 3,
          conversionsValue: 150,
          costMicros: "50000000",
          ctr: 0.04,
          impressions: "500",
        },
      })
    ).toStrictEqual({
      avgCpc: 2.5,
      campaignId: "100",
      campaignName: "Performance Max",
      campaignResourceName: "customers/1234567890/campaigns/100",
      campaignStatus: "ENABLED",
      clicks: 20,
      conversions: 3,
      conversionsValue: 150,
      cost: 50,
      ctr: 0.04,
      impressions: 500,
      resourceName: "customers/1234567890/campaignSearchTermViews/100~ZG9uYXRl",
      searchTerm: "donate to a local nonprofit",
    });

    expect(
      normalizeCampaignSearchTermRow({
        campaign: {
          id: 200,
          name: "Legacy Search",
          status: "PAUSED",
        },
        campaign_search_term_view: {
          campaign: "customers/1234567890/campaigns/200",
          resource_name:
            "customers/1234567890/campaignSearchTermViews/200~dm9sdW50ZWVy",
          search_term: "volunteer nearby",
        },
        metrics: {
          average_cpc: 1_500_000,
          clicks: 10,
          conversions: "2",
          conversions_value: "80",
          cost_micros: 15_000_000,
          ctr: "0.05",
          impressions: 200,
        },
      })
    ).toStrictEqual({
      avgCpc: 1.5,
      campaignId: "200",
      campaignName: "Legacy Search",
      campaignResourceName: "customers/1234567890/campaigns/200",
      campaignStatus: "PAUSED",
      clicks: 10,
      conversions: 2,
      conversionsValue: 80,
      cost: 15,
      ctr: 0.05,
      impressions: 200,
      resourceName:
        "customers/1234567890/campaignSearchTermViews/200~dm9sdW50ZWVy",
      searchTerm: "volunteer nearby",
    });
  });

  it("normalizes video campaign rows with view and completion metrics", () => {
    const row = normalizeVideoPerformanceRow({
      campaign: {
        id: "77",
        name: "Pre-Roll: Community Stories",
        status: "ENABLED",
      },
      metrics: {
        averageCpv: "410000",
        averageVideoWatchTimeDurationMillis: "9500",
        clicks: "16",
        conversions: "2",
        costMicros: "82000000",
        impressions: "20000",
        videoQuartileP100Rate: 0.18,
        videoQuartileP25Rate: 0.61,
        videoQuartileP50Rate: 0.42,
        videoQuartileP75Rate: 0.29,
        videoViewRate: 0.224,
        videoViews: "4480",
      },
    });

    expect(row).toStrictEqual({
      averageCpv: 0.41,
      averageVideoWatchTimeSeconds: 9.5,
      campaignId: "77",
      campaignName: "Pre-Roll: Community Stories",
      campaignResourceName: null,
      clicks: 16,
      conversions: 2,
      cost: 82,
      cpm: expect.any(Number),
      impressions: 20_000,
      p100Rate: 0.18,
      p25Rate: 0.61,
      p50Rate: 0.42,
      p75Rate: 0.29,
      status: "ENABLED",
      viewRate: 0.224,
      views: 4480,
    });
    expect(row.cpm).toBeCloseTo(4.1);
  });

  it("normalizes snake-case video rows for parity fixtures", () => {
    expect(
      normalizeVideoPerformanceRow({
        campaign: { id: 88, status: "PAUSED" },
        metrics: {
          average_cpv: 500_000,
          average_video_watch_time_duration_millis: 12_000,
          cost_micros: 50_000_000,
          impressions: 0,
          video_quartile_p100_rate: 0.1,
          video_quartile_p25_rate: 0.6,
          video_quartile_p50_rate: 0.4,
          video_quartile_p75_rate: 0.2,
          video_view_rate: 0.25,
          video_views: 100,
        },
      })
    ).toMatchObject({
      averageCpv: 0.5,
      averageVideoWatchTimeSeconds: 12,
      campaignId: "88",
      campaignName: "Unknown",
      cost: 50,
      cpm: 0,
      status: "PAUSED",
      viewRate: 0.25,
      views: 100,
    });
  });

  it("normalizes current TrueView video metric keys", () => {
    expect(
      normalizeVideoPerformanceRow({
        campaign: { id: "99", name: "TrueView", status: "ENABLED" },
        metrics: {
          costMicros: "75000000",
          averageVideoWatchTimeDurationMillis: "7250",
          impressions: "15000",
          trueviewAverageCpv: "375000",
          videoTrueviewViewRate: 0.133,
          videoTrueviewViews: "1995",
        },
      })
    ).toMatchObject({
      averageCpv: 0.375,
      averageVideoWatchTimeSeconds: 7.25,
      campaignId: "99",
      campaignName: "TrueView",
      cost: 75,
      viewRate: 0.133,
      views: 1995,
    });
  });

  it("normalizes campaign reach and frequency rows", () => {
    expect(
      normalizeReachFrequencyRow({
        campaign: {
          id: "77",
          name: "Video Reach",
          resourceName: "customers/123/campaigns/77",
          status: "ENABLED",
        },
        metrics: {
          averageImpressionFrequencyPerUser: 4.2,
          costMicros: "42000000",
          impressions: "10000",
          uniqueUsers: "2400",
          uniqueUsersFivePlus: "500",
          uniqueUsersFourPlus: "700",
        },
      })
    ).toStrictEqual({
      averageImpressionFrequencyPerUser: 4.2,
      campaignId: "77",
      campaignName: "Video Reach",
      campaignResourceName: "customers/123/campaigns/77",
      cost: 42,
      impressions: 10_000,
      status: "ENABLED",
      uniqueUsers: 2400,
      uniqueUsersFivePlus: 500,
      uniqueUsersFourPlus: 700,
    });
  });

  it("queries keyword and search-term reports with expected GAQL resources", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi
        .fn<GoogleAdsClient["search"]>()
        .mockResolvedValueOnce({
          requestId: "kw",
          rows: [
            {
              adGroupCriterion: { keyword: { text: "keyword" } },
              metrics: { impressions: "1" },
            },
          ],
        })
        .mockResolvedValueOnce({
          requestId: "st",
          rows: [
            {
              searchTermView: { searchTerm: "query" },
              metrics: { impressions: "2" },
            },
          ],
        }),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await getKeywordPerformance(client, {
      campaignId: "111",
      customerId: "1234567890",
      since: "2026-05-01",
      until: "2026-05-21",
    });
    await getSearchTerms(client, {
      campaignId: "111",
      customerId: "1234567890",
      days: 30,
    });

    expect(client.search).toHaveBeenNthCalledWith(1, {
      customerId: "1234567890",
      query: expect.stringContaining(
        "segments.date BETWEEN '2026-05-01' AND '2026-05-21'"
      ),
    });
    expect(client.search).toHaveBeenNthCalledWith(2, {
      customerId: "1234567890",
      query: expect.stringContaining("FROM search_term_view"),
    });
  });

  it("queries verified campaign-level search terms without PMax-excluding segments", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi.fn<GoogleAdsClient["search"]>().mockResolvedValue({
        requestId: "campaign-search-terms",
        rows: [],
      }),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await getCampaignSearchTerms(client, {
      campaignId: "100",
      customerId: "1234567890",
      since: "2026-07-01",
      until: "2026-07-30",
    });

    const query = client.search.mock.calls[0]?.[0].query ?? "";
    expect(query).toContain("FROM campaign_search_term_view");
    expect(query).toContain("campaign_search_term_view.resource_name");
    expect(query).toContain("campaign_search_term_view.campaign");
    expect(query).toContain("campaign_search_term_view.search_term");
    expect(query).toContain("campaign.resource_name");
    expect(query).toContain("campaign.id");
    expect(query).toContain("campaign.name");
    expect(query).toContain("campaign.status");
    expect(query).toContain("metrics.impressions");
    expect(query).toContain("metrics.clicks");
    expect(query).toContain("metrics.ctr");
    expect(query).toContain("metrics.average_cpc");
    expect(query).toContain("metrics.cost_micros");
    expect(query).toContain("metrics.conversions");
    expect(query).toContain("metrics.conversions_value");
    expect(query).toContain(
      "segments.date BETWEEN '2026-07-01' AND '2026-07-30'"
    );
    expect(query).toContain("metrics.impressions > 0");
    expect(query).toContain("campaign.id = 100");
    expect(query).toContain("ORDER BY metrics.cost_micros DESC");
    expect(query).not.toContain("segments.keyword");
    expect(query).not.toContain("ad_group.");
    expect(query).not.toContain("ad_group_ad.");
  });

  it("paginates campaign search terms before normalizing rows", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi
        .fn<GoogleAdsClient["search"]>()
        .mockResolvedValueOnce({
          nextPageToken: "campaign-search-page-2",
          requestId: "req-1",
          rows: [
            {
              campaign: { id: "100", name: "First" },
              campaignSearchTermView: { searchTerm: "first term" },
              metrics: { clicks: "1" },
            },
          ],
        })
        .mockResolvedValueOnce({
          requestId: "req-2",
          rows: [
            {
              campaign: { id: "200", name: "Second" },
              campaign_search_term_view: { search_term: "second term" },
              metrics: { clicks: "2" },
            },
          ],
        }),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    const rows = await getCampaignSearchTerms(client, {
      customerId: "1234567890",
      days: 30,
    });

    expect(client.search).toHaveBeenNthCalledWith(2, {
      customerId: "1234567890",
      pageToken: "campaign-search-page-2",
      query: expect.stringContaining("FROM campaign_search_term_view"),
    });
    expect(rows).toStrictEqual([
      expect.objectContaining({
        campaignId: "100",
        clicks: 1,
        searchTerm: "first term",
      }),
      expect.objectContaining({
        campaignId: "200",
        clicks: 2,
        searchTerm: "second term",
      }),
    ]);
  });

  it("queries video performance with video-specific GAQL metrics", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi.fn<GoogleAdsClient["search"]>().mockResolvedValue({
        requestId: "video",
        rows: [
          {
            campaign: { id: "77", name: "Video" },
            metrics: {
              trueviewAverageCpv: "250000",
              videoTrueviewViewRate: 0.2,
              videoTrueviewViews: "10",
            },
          },
        ],
      }),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    const rows = await getVideoPerformance(client, {
      campaignId: "77",
      customerId: "1234567890",
      days: 30,
    });

    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining("metrics.video_trueview_view_rate"),
    });
    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining("metrics.trueview_average_cpv"),
    });
    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining(
        "metrics.average_video_watch_time_duration_millis"
      ),
    });
    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining(
        "campaign.advertising_channel_type = 'VIDEO'"
      ),
    });
    expect(rows).toStrictEqual([
      expect.objectContaining({
        campaignId: "77",
        campaignResourceName: null,
        averageCpv: 0.25,
        viewRate: 0.2,
        views: 10,
      }),
    ]);
  });

  it("queries campaign reach and frequency with 30-day frequency buckets", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi.fn<GoogleAdsClient["search"]>().mockResolvedValue({
        requestId: "reach-frequency",
        rows: [
          {
            campaign: { id: "77", name: "Video" },
            metrics: {
              averageImpressionFrequencyPerUser: 3.2,
              uniqueUsers: "100",
              uniqueUsersFourPlus: "20",
            },
          },
        ],
      }),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    const rows = await getReachFrequencyPerformance(client, {
      campaignId: "77",
      customerId: "1234567890",
      days: 30,
    });

    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining(
        "metrics.average_impression_frequency_per_user"
      ),
    });
    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining("metrics.unique_users_four_plus"),
    });
    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining("metrics.unique_users_five_plus"),
    });
    expect(rows).toStrictEqual([
      expect.objectContaining({
        averageImpressionFrequencyPerUser: 3.2,
        campaignId: "77",
        uniqueUsers: 100,
        uniqueUsersFourPlus: 20,
      }),
    ]);
  });

  it("omits 4+ and 5+ reach buckets for lookbacks over 31 days", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi.fn<GoogleAdsClient["search"]>().mockResolvedValue({
        requestId: "reach-frequency",
        rows: [],
      }),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await getReachFrequencyPerformance(client, {
      customerId: "1234567890",
      days: 90,
    });

    const query = client.search.mock.calls[0]?.[0].query as string;
    expect(query).toContain("metrics.unique_users");
    expect(query).not.toContain("metrics.unique_users_four_plus");
    expect(query).not.toContain("metrics.unique_users_five_plus");
  });

  it("queries video age ranges with campaign and ad group resource identifiers", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi.fn<GoogleAdsClient["search"]>().mockResolvedValue({
        requestId: "age",
        rows: [
          {
            adGroup: {
              id: "88",
              name: "Ad Group",
              resourceName: "customers/1234567890/adGroups/88",
            },
            ageRangeView: {
              ageRange: "AGE_RANGE_45_54",
              resourceName: "customers/1234567890/ageRangeViews/88~503001",
            },
            campaign: {
              id: "77",
              name: "Video",
              resourceName: "customers/1234567890/campaigns/77",
            },
            metrics: {
              costMicros: "2500000",
              videoTrueviewViewRate: 0.25,
              videoTrueviewViews: "10",
            },
          },
        ],
      }),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    const rows = await getAgeRangePerformance(client, {
      customerId: "1234567890",
      days: 30,
    });

    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining("FROM age_range_view"),
    });
    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining("ad_group.resource_name"),
    });
    expect(rows).toStrictEqual([
      expect.objectContaining({
        adGroupId: "88",
        campaignResourceName: "customers/1234567890/campaigns/77",
        criterionId: "503001",
        segmentType: "age",
        segmentValue: "AGE_RANGE_45_54",
        viewRate: 0.25,
        views: 10,
      }),
    ]);
  });

  it("queries geographic delivery with partial location segment identifiers", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi.fn<GoogleAdsClient["search"]>().mockResolvedValue({
        requestId: "geo",
        rows: [
          {
            adGroup: { id: "88", name: "Ad Group" },
            campaign: { id: "77", name: "Video" },
            geographicView: {
              locationType: "LOCATION_OF_PRESENCE",
              resourceName:
                "customers/1234567890/geographicViews/21137~LOCATION_OF_PRESENCE",
            },
            metrics: {
              costMicros: "2500000",
              impressions: "100",
              videoTrueviewViewRate: 0.15,
              videoTrueviewViews: "15",
            },
            segments: {
              geoTargetPostalCode: "geoTargetConstants/21137",
              geoTargetRegion: "geoTargetConstants/21167",
            },
          },
        ],
      }),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    const rows = await getGeographicPerformance(client, {
      campaignId: "77",
      customerId: "1234567890",
      days: 30,
    });

    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining("FROM geographic_view"),
    });
    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining("segments.geo_target_postal_code"),
    });
    expect(rows).toStrictEqual([
      expect.objectContaining({
        geoTargetPostalCode: "geoTargetConstants/21137",
        geoTargetRegion: "geoTargetConstants/21167",
        locationType: "LOCATION_OF_PRESENCE",
        viewRate: 0.15,
        views: 15,
      }),
    ]);
  });

  it("queries configured campaign location criteria", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi.fn<GoogleAdsClient["search"]>().mockResolvedValue({
        requestId: "criteria",
        rows: [
          {
            campaign: {
              id: "77",
              name: "Video",
              resourceName: "customers/1234567890/campaigns/77",
            },
            campaignCriterion: {
              bidModifier: 1.25,
              criterionId: "9030972",
              location: {
                geoTargetConstant: "geoTargetConstants/9030972",
              },
              negative: false,
              resourceName: "customers/1234567890/campaignCriteria/77~9030972",
              status: "ENABLED",
            },
          },
        ],
      }),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    const rows = await getCampaignLocationCriteria(client, {
      customerId: "1234567890",
    });

    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining("FROM campaign_criterion"),
    });
    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining("campaign_criterion.type = 'LOCATION'"),
    });
    expect(rows).toStrictEqual([
      {
        bidModifier: 1.25,
        campaignId: "77",
        campaignName: "Video",
        campaignResourceName: "customers/1234567890/campaigns/77",
        criterionId: "9030972",
        geoTargetConstant: "geoTargetConstants/9030972",
        negative: false,
        providerResourceName:
          "customers/1234567890/campaignCriteria/77~9030972",
        status: "ENABLED",
      },
    ]);
  });

  it("queries configured location criterion performance", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi.fn<GoogleAdsClient["search"]>().mockResolvedValue({
        requestId: "location-view",
        rows: [
          {
            campaign: {
              id: "77",
              name: "Video",
              resourceName: "customers/1234567890/campaigns/77",
            },
            campaignCriterion: {
              criterionId: "9030972",
              location: {
                geoTargetConstant: "geoTargetConstants/9030972",
              },
              resourceName: "customers/1234567890/campaignCriteria/77~9030972",
            },
            locationView: {
              resourceName: "customers/1234567890/locationViews/77~9030972",
            },
            metrics: {
              costMicros: "2500000",
              impressions: "100",
              trueviewAverageCpv: "125000",
              videoTrueviewViewRate: 0.15,
              videoTrueviewViews: "20",
            },
          },
        ],
      }),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    const rows = await getLocationCriterionPerformance(client, {
      customerId: "1234567890",
      days: 30,
    });

    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining("FROM location_view"),
    });
    expect(rows).toStrictEqual([
      expect.objectContaining({
        averageCpv: 0.125,
        criterionId: "9030972",
        geoTargetConstant: "geoTargetConstants/9030972",
        impressions: 100,
        viewRate: 0.15,
        views: 20,
      }),
    ]);
  });

  it("normalizes snake-case audience and geographic rows", () => {
    expect(
      normalizeAudienceSegmentRow(
        {
          ad_group: { id: 88, resource_name: "customers/123/adGroups/88" },
          age_range_view: {
            age_range: "AGE_RANGE_55_64",
            resource_name: "customers/123/ageRangeViews/88~503002",
          },
          campaign: {
            id: 77,
            resource_name: "customers/123/campaigns/77",
          },
          metrics: { cost_micros: "1000000", impressions: "4" },
        },
        "age"
      )
    ).toMatchObject({
      adGroupId: "88",
      campaignResourceName: "customers/123/campaigns/77",
      cost: 1,
      criterionId: "503002",
      segmentValue: "AGE_RANGE_55_64",
    });

    expect(
      normalizeGeographicRow({
        ad_group: { id: 88 },
        campaign: { id: 77 },
        geographic_view: {
          location_type: "AREA_OF_INTEREST",
          resource_name: "customers/123/geographicViews/21137~AREA_OF_INTEREST",
        },
        metrics: { cost_micros: "1000000", impressions: "4" },
        segments: { geo_target_city: "geoTargetConstants/1014044" },
      })
    ).toMatchObject({
      cost: 1,
      geoTargetCity: "geoTargetConstants/1014044",
      locationType: "AREA_OF_INTEREST",
    });
    expect(
      normalizeCampaignLocationCriterionRow({
        campaign: { id: 77, name: "Video" },
        campaign_criterion: {
          bid_modifier: "1.1",
          location: { geo_target_constant: "geoTargetConstants/9030972" },
          negative: "false",
          resource_name: "customers/123/campaignCriteria/77~9030972",
          status: "ENABLED",
        },
      })
    ).toMatchObject({
      bidModifier: 1.1,
      criterionId: "9030972",
      geoTargetConstant: "geoTargetConstants/9030972",
      negative: false,
    });
    expect(
      normalizeLocationCriterionPerformanceRow({
        campaign: { id: 77, name: "Video" },
        location_view: {
          resource_name: "customers/123/locationViews/77~9030972",
        },
        metrics: {
          cost_micros: "1000000",
          trueview_average_cpv: "250000",
          video_trueview_views: "4",
        },
      })
    ).toMatchObject({
      averageCpv: 0.25,
      cost: 1,
      criterionId: "9030972",
      views: 4,
    });
  });

  it("rejects non-numeric campaign filters before building GAQL", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await expect(
      getSearchTerms(client, {
        campaignId: "customers/123/campaigns/111",
        customerId: "1234567890",
        days: 30,
      })
    ).rejects.toThrow("campaignId must contain only digits");
    expect(client.search).not.toHaveBeenCalled();
  });

  it("queries and normalizes change event audit rows", async () => {
    const since = dateDaysAgo(20);
    const until = dateDaysAgo(10);
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi.fn<GoogleAdsClient["search"]>().mockResolvedValue({
        requestId: "req",
        rows: [
          {
            changeEvent: {
              adGroup: "customers/1234567890/adGroups/200",
              campaign: "customers/1234567890/campaigns/100",
              changeDateTime: "2026-05-20 13:45:12.123456",
              changeResourceName: "customers/1234567890/campaigns/100",
              changeResourceType: "CAMPAIGN",
              changedFields: { paths: ["status", "name"] },
              clientType: "GOOGLE_ADS_WEB_CLIENT",
              newResource: { campaign: { name: "New name" } },
              oldResource: { campaign: { name: "Old name" } },
              resourceChangeOperation: "UPDATE",
              resourceName: "customers/1234567890/changeEvents/1~2~3",
              userEmail: "operator@example.com",
            },
          },
        ],
      }),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    const rows = await getChangeEvents(client, {
      customerId: "1234567890",
      limit: 500,
      resourceTypes: ["CAMPAIGN", "AD_GROUP"],
      since,
      until,
    });

    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining("FROM change_event"),
    });
    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining(
        `change_event.change_date_time BETWEEN '${since}' AND '${until}'`
      ),
    });
    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining(
        "change_event.change_resource_type IN ('CAMPAIGN', 'AD_GROUP')"
      ),
    });
    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining("LIMIT 500"),
    });
    expect(rows).toStrictEqual([
      {
        adGroupResourceName: "customers/1234567890/adGroups/200",
        assetResourceName: null,
        campaignResourceName: "customers/1234567890/campaigns/100",
        changeDateTime: "2026-05-20 13:45:12.123456",
        changedFields: ["status", "name"],
        changedResourceName: "customers/1234567890/campaigns/100",
        clientType: "GOOGLE_ADS_WEB_CLIENT",
        newResource: { campaign: { name: "New name" } },
        oldResource: { campaign: { name: "Old name" } },
        operation: "UPDATE",
        resourceName: "customers/1234567890/changeEvents/1~2~3",
        resourceType: "CAMPAIGN",
        userEmail: "operator@example.com",
      },
    ]);
  });

  it("rejects unsafe change event inputs before querying", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await expect(
      getChangeEvents(client, {
        customerId: "1234567890",
        days: 90,
      })
    ).rejects.toThrow("days must be one of 7, 14, or 30");

    await expect(
      getChangeEvents(client, {
        customerId: "1234567890",
        days: 30,
        limit: 10_001,
      })
    ).rejects.toThrow("limit must be an integer from 1 through 10000");

    await expect(
      getChangeEvents(client, {
        customerId: "1234567890",
        days: 30,
        resourceTypes: ["CAMPAIGN; REMOVE"] as never,
      })
    ).rejects.toThrow("resourceTypes must contain Google Ads enum names");

    await expect(
      getChangeEvents(client, {
        customerId: "1234567890",
        days: 30,
        resourceTypes: ["NOT_A_RESOURCE"] as never,
      })
    ).rejects.toThrow("NOT_A_RESOURCE is not a supported change resource type");

    await expect(
      getChangeEvents(client, {
        customerId: "1234567890",
        since: dateDaysAgo(31),
        until: dateDaysAgo(1),
      })
    ).rejects.toThrow(
      "Explicit change history date ranges must be within the past 30 days"
    );

    await expect(
      getChangeEvents(client, {
        customerId: "1234567890",
        since: dateDaysAgo(30),
        until: dateDaysAgo(-2),
      })
    ).rejects.toThrow(
      "Explicit change history date ranges must span at most 30 days"
    );

    expect(client.search).not.toHaveBeenCalled();
  });

  it("queries and normalizes change status audit rows", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi.fn<GoogleAdsClient["search"]>().mockResolvedValue({
        requestId: "req",
        rows: [
          {
            changeStatus: {
              campaign: "customers/1234567890/campaigns/100",
              campaignBudget: "customers/1234567890/campaignBudgets/900",
              lastChangeDateTime: "2026-05-20 12:34:56.000000",
              resourceName: "customers/1234567890/changeStatus/1-7-900",
              resourceStatus: "CHANGED",
              resourceType: "CAMPAIGN_BUDGET",
            },
          },
        ],
      }),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    const rows = await getChangeStatusChanges(client, {
      customerId: "1234567890",
      days: 30,
      limit: 250,
      resourceTypes: ["CAMPAIGN_BUDGET"],
    });

    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining("FROM change_status"),
    });
    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining(
        "change_status.last_change_date_time DURING LAST_30_DAYS"
      ),
    });
    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining(
        "change_status.resource_type IN ('CAMPAIGN_BUDGET')"
      ),
    });
    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining("LIMIT 250"),
    });
    expect(rows).toStrictEqual([
      expect.objectContaining({
        campaignBudgetResourceName: "customers/1234567890/campaignBudgets/900",
        campaignResourceName: "customers/1234567890/campaigns/100",
        changedResourceName: "customers/1234567890/campaignBudgets/900",
        lastChangeDateTime: "2026-05-20 12:34:56.000000",
        resourceName: "customers/1234567890/changeStatus/1-7-900",
        resourceStatus: "CHANGED",
        resourceType: "CAMPAIGN_BUDGET",
      }),
    ]);
  });

  it("rejects unsafe change status inputs before querying", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await expect(
      getChangeStatusChanges(client, {
        customerId: "1234567890",
        days: 30,
        limit: 0,
      })
    ).rejects.toThrow("limit must be an integer from 1 through 10000");

    await expect(
      getChangeStatusChanges(client, {
        customerId: "1234567890",
        days: 30,
        resourceTypes: ["FAKE_RESOURCE"] as never,
      })
    ).rejects.toThrow("FAKE_RESOURCE is not a supported change resource type");

    await expect(
      getChangeStatusChanges(client, {
        customerId: "1234567890",
        days: 30,
        resourceTypes: ["FEED_ITEM"] as never,
      })
    ).rejects.toThrow("FEED_ITEM is not a supported change resource type");

    await expect(
      getChangeStatusChanges(client, {
        customerId: "1234567890",
        since: dateDaysAgo(91),
        until: dateDaysAgo(1),
      })
    ).rejects.toThrow(
      "Explicit change history date ranges must be within the past 90 days"
    );

    await expect(
      getChangeStatusChanges(client, {
        customerId: "1234567890",
        since: dateDaysAgo(90),
        until: dateDaysAgo(-2),
      })
    ).rejects.toThrow(
      "Explicit change history date ranges must span at most 90 days"
    );

    expect(client.search).not.toHaveBeenCalled();
  });

  it("normalizes snake-case change event and change status rows", () => {
    expect(
      normalizeChangeEventRow({
        change_event: {
          asset: "customers/123/assets/300",
          change_date_time: "2026-05-19 10:00:00.000000",
          change_resource_name: "customers/123/assets/300",
          change_resource_type: "ASSET",
          changed_fields: { paths: ["text_asset.text"] },
          client_type: "GOOGLE_ADS_API",
          resource_change_operation: "CREATE",
          resource_name: "customers/123/changeEvents/1~1~1",
          user_email: "api@example.com",
        },
      })
    ).toMatchObject({
      assetResourceName: "customers/123/assets/300",
      changedFields: ["text_asset.text"],
      clientType: "GOOGLE_ADS_API",
      operation: "CREATE",
      resourceType: "ASSET",
    });

    expect(
      normalizeChangeStatusRow({
        change_status: {
          ad_group: "customers/123/adGroups/11",
          ad_group_criterion: "customers/123/adGroupCriteria/11~33",
          last_change_date_time: "2026-05-18 08:30:00.000000",
          resource_name: "customers/123/changeStatus/1-4-11-33",
          resource_status: "ADDED",
          resource_type: "AD_GROUP_CRITERION",
        },
      })
    ).toMatchObject({
      adGroupCriterionResourceName: "customers/123/adGroupCriteria/11~33",
      adGroupResourceName: "customers/123/adGroups/11",
      changedResourceName: "customers/123/adGroupCriteria/11~33",
      resourceStatus: "ADDED",
      resourceType: "AD_GROUP_CRITERION",
    });
  });

  it("normalizes lower-camel and snake-case asset group product group rows", () => {
    expect(
      normalizeAssetGroupProductGroupRow({
        assetGroup: {
          id: "200",
          name: "PMax products",
          resourceName: "customers/123/assetGroups/200",
          status: "ENABLED",
        },
        assetGroupProductGroupView: {
          assetGroup: "customers/123/assetGroups/200",
          assetGroupListingGroupFilter:
            "customers/123/assetGroupListingGroupFilters/200~300",
          resourceName: "customers/123/assetGroupProductGroupViews/200~300",
        },
        campaign: {
          id: "100",
          name: "PMax",
          resourceName: "customers/123/campaigns/100",
        },
        metrics: {
          averageCpc: "1250000",
          clicks: "8",
          conversions: "2.5",
          conversionsValue: "44.5",
          costMicros: "10000000",
          ctr: "0.04",
          impressions: "200",
          orders: "3",
          revenueMicros: "55000000",
          unitsSold: "4",
        },
      })
    ).toStrictEqual({
      assetGroupId: "200",
      assetGroupName: "PMax products",
      assetGroupResourceName: "customers/123/assetGroups/200",
      assetGroupStatus: "ENABLED",
      avgCpc: 1.25,
      campaignId: "100",
      campaignName: "PMax",
      campaignResourceName: "customers/123/campaigns/100",
      clicks: 8,
      conversions: 2.5,
      conversionsValue: 44.5,
      cost: 10,
      ctr: 0.04,
      impressions: 200,
      listingGroupFilterResourceName:
        "customers/123/assetGroupListingGroupFilters/200~300",
      orders: 3,
      resourceName: "customers/123/assetGroupProductGroupViews/200~300",
      revenue: 55,
      unitsSold: 4,
    });

    expect(
      normalizeAssetGroupProductGroupRow({
        asset_group: {
          id: 201,
          name: "Snake products",
          status: "PAUSED",
        },
        asset_group_product_group_view: {
          asset_group: "customers/123/assetGroups/201",
          asset_group_listing_group_filter:
            "customers/123/assetGroupListingGroupFilters/201~301",
          resource_name: "customers/123/assetGroupProductGroupViews/201~301",
        },
        campaign: {
          id: 101,
          name: "Snake PMax",
          resource_name: "customers/123/campaigns/101",
        },
        metrics: {
          average_cpc: 2_000_000,
          clicks: 6,
          conversions: 1,
          conversions_value: 20,
          cost_micros: 12_000_000,
          ctr: 0.03,
          impressions: 200,
          orders: 2,
          revenue_micros: 30_000_000,
          units_sold: 3,
        },
      })
    ).toStrictEqual({
      assetGroupId: "201",
      assetGroupName: "Snake products",
      assetGroupResourceName: "customers/123/assetGroups/201",
      assetGroupStatus: "PAUSED",
      avgCpc: 2,
      campaignId: "101",
      campaignName: "Snake PMax",
      campaignResourceName: "customers/123/campaigns/101",
      clicks: 6,
      conversions: 1,
      conversionsValue: 20,
      cost: 12,
      ctr: 0.03,
      impressions: 200,
      listingGroupFilterResourceName:
        "customers/123/assetGroupListingGroupFilters/201~301",
      orders: 2,
      resourceName: "customers/123/assetGroupProductGroupViews/201~301",
      revenue: 30,
      unitsSold: 3,
    });
  });

  it("queries and paginates asset group product group performance", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi
        .fn<GoogleAdsClient["search"]>()
        .mockResolvedValueOnce({
          nextPageToken: "product-groups-page-2",
          requestId: "req-1",
          rows: [
            {
              assetGroup: { id: "200", name: "First", status: "ENABLED" },
              assetGroupProductGroupView: { resourceName: "view-1" },
              campaign: { id: "100", name: "PMax" },
              metrics: { clicks: "1" },
            },
          ],
        })
        .mockResolvedValueOnce({
          requestId: "req-2",
          rows: [
            {
              asset_group: { id: "200", name: "Second", status: "ENABLED" },
              asset_group_product_group_view: { resource_name: "view-2" },
              campaign: { id: "100", name: "PMax" },
              metrics: { clicks: "2" },
            },
          ],
        }),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    const rows = await getAssetGroupProductGroupPerformance(client, {
      assetGroupId: "200",
      campaignId: "100",
      customerId: "1234567890",
      since: "2026-07-01",
      until: "2026-07-30",
    });

    const firstQuery = client.search.mock.calls[0]?.[0].query ?? "";
    expect(firstQuery.replaceAll(/\s+/gu, " ").trim()).toBe(
      "SELECT asset_group_product_group_view.resource_name, asset_group_product_group_view.asset_group, asset_group_product_group_view.asset_group_listing_group_filter, asset_group.resource_name, asset_group.id, asset_group.name, asset_group.status, campaign.resource_name, campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.orders, metrics.revenue_micros, metrics.units_sold FROM asset_group_product_group_view WHERE segments.date BETWEEN '2026-07-01' AND '2026-07-30' AND metrics.impressions > 0 AND campaign.id = 100 AND asset_group.id = 200 ORDER BY metrics.cost_micros DESC"
    );
    expect(client.search).toHaveBeenNthCalledWith(2, {
      customerId: "1234567890",
      pageToken: "product-groups-page-2",
      query: firstQuery,
    });
    expect(rows).toStrictEqual([
      expect.objectContaining({
        assetGroupName: "First",
        clicks: 1,
        resourceName: "view-1",
      }),
      expect.objectContaining({
        assetGroupName: "Second",
        clicks: 2,
        resourceName: "view-2",
      }),
    ]);
  });

  it("queries and normalizes asset performance rows", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi.fn<GoogleAdsClient["search"]>().mockResolvedValue({
        requestId: "req",
        rows: [
          {
            asset: {
              id: "300",
              name: "Headline asset",
              resourceName: "customers/1234567890/assets/300",
              source: "ADVERTISER",
              textAsset: { text: "Clean energy now" },
            },
            assetGroup: {
              id: "200",
              name: "PMax group",
              resourceName: "customers/1234567890/assetGroups/200",
            },
            assetGroupAsset: {
              fieldType: "HEADLINE",
              status: "ENABLED",
            },
            campaign: {
              id: "100",
              name: "PMax",
              resourceName: "customers/1234567890/campaigns/100",
            },
            metrics: {
              clicks: "10",
              conversions: "2",
              costMicros: "2500000",
              impressions: "1000",
            },
          },
        ],
      }),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    const rows = await getAssetPerformance(client, {
      assetGroupId: "200",
      campaignId: "100",
      customerId: "1234567890",
      days: 30,
    });

    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining("FROM asset_group_asset"),
    });
    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining("AND campaign.id = 100"),
    });
    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining("AND asset_group.id = 200"),
    });
    expect(rows).toStrictEqual([
      {
        assetGroupId: "200",
        assetGroupName: "PMax group",
        assetGroupResourceName: "customers/1234567890/assetGroups/200",
        assetId: "300",
        assetName: "Headline asset",
        assetResourceName: "customers/1234567890/assets/300",
        assetSource: "ADVERTISER",
        assetText: "Clean energy now",
        campaignId: "100",
        campaignName: "PMax",
        campaignResourceName: "customers/1234567890/campaigns/100",
        clicks: 10,
        conversions: 2,
        cost: 2.5,
        fieldType: "HEADLINE",
        impressions: 1000,
        status: "ENABLED",
      },
    ]);
  });

  it("queries and normalizes top asset combinations", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi.fn<GoogleAdsClient["search"]>().mockResolvedValue({
        requestId: "req",
        rows: [
          {
            assetGroup: {
              id: "200",
              name: "PMax group",
              resourceName: "customers/1234567890/assetGroups/200",
            },
            assetGroupTopCombinationView: {
              assetGroupTopCombinations: [
                {
                  assetCombinationServedAssets: [
                    {
                      asset: "customers/1234567890/assets/300",
                      servedAssetFieldType: "HEADLINE_1",
                    },
                  ],
                },
              ],
              resourceName:
                "customers/1234567890/assetGroupTopCombinationViews/200~1",
            },
            campaign: {
              id: "100",
              name: "PMax",
              resourceName: "customers/1234567890/campaigns/100",
            },
          },
        ],
      }),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    const rows = await getAssetTopCombinations(client, {
      assetGroupId: "200",
      campaignId: "100",
      customerId: "1234567890",
      days: 30,
    });

    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining("FROM asset_group_top_combination_view"),
    });
    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining("segments.date DURING LAST_30_DAYS"),
    });
    expect(rows).toStrictEqual([
      {
        assetGroupId: "200",
        assetGroupName: "PMax group",
        assetGroupResourceName: "customers/1234567890/assetGroups/200",
        assets: [
          {
            assetResourceName: "customers/1234567890/assets/300",
            servedAssetFieldType: "HEADLINE_1",
          },
        ],
        campaignId: "100",
        campaignName: "PMax",
        campaignResourceName: "customers/1234567890/campaigns/100",
        resourceName:
          "customers/1234567890/assetGroupTopCombinationViews/200~1",
      },
    ]);
  });

  it("rejects malformed asset group ids with the assetGroupId field name", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await expect(
      getAssetTopCombinations(client, {
        assetGroupId: "customers/123/assetGroups/200",
        customerId: "1234567890",
        days: 30,
      })
    ).rejects.toThrow("assetGroupId must contain only digits");

    expect(client.search).not.toHaveBeenCalled();
  });

  it("normalizes snake-case asset and combination rows", () => {
    expect(
      normalizeAssetPerformanceRow({
        asset: {
          id: 300,
          resource_name: "customers/123/assets/300",
          text_asset: { text: "Headline" },
        },
        asset_group: {
          id: 200,
          resource_name: "customers/123/assetGroups/200",
        },
        asset_group_asset: {
          field_type: "HEADLINE",
          status: "ENABLED",
        },
        campaign: { id: 100 },
        metrics: { cost_micros: 1_000_000, impressions: 4 },
      })
    ).toMatchObject({
      assetGroupId: "200",
      assetId: "300",
      assetText: "Headline",
      cost: 1,
      fieldType: "HEADLINE",
    });

    expect(
      normalizeAssetCombinationRow({
        asset_group_top_combination_view: {
          asset_group_top_combinations: [
            {
              asset_combination_served_assets: [
                {
                  asset: "customers/123/assets/300",
                  served_asset_field_type: "HEADLINE_1",
                },
              ],
            },
          ],
          resource_name: "customers/123/views/1",
        },
        campaign: { id: 100 },
      })
    ).toMatchObject({
      assets: [
        {
          assetResourceName: "customers/123/assets/300",
          servedAssetFieldType: "HEADLINE_1",
        },
      ],
      resourceName: "customers/123/views/1",
    });
  });

  it("queries and normalizes ad policy diagnostics", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi.fn<GoogleAdsClient["search"]>().mockResolvedValue({
        requestId: "req",
        rows: [
          {
            adGroup: {
              id: "200",
              name: "Search ad group",
              resourceName: "customers/1234567890/adGroups/200",
            },
            adGroupAd: {
              ad: {
                id: "300",
                resourceName: "customers/1234567890/ads/300",
                type: "RESPONSIVE_SEARCH_AD",
              },
              policySummary: {
                approvalStatus: "DISAPPROVED",
                policyTopicEntries: [
                  {
                    evidences: [{ textList: { texts: ["restricted claim"] } }],
                    topic: "MISREPRESENTATION",
                    type: "PROHIBITED",
                  },
                ],
                reviewStatus: "REVIEWED",
              },
              primaryStatus: "NOT_ELIGIBLE",
              primaryStatusReasons: ["AD_GROUP_AD_DISAPPROVED"],
              resourceName: "customers/1234567890/adGroupAds/200~300",
              status: "ENABLED",
            },
            campaign: {
              id: "100",
              name: "Search",
              resourceName: "customers/1234567890/campaigns/100",
            },
          },
        ],
      }),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    const rows = await getAdPolicyDiagnostics(client, {
      adGroupId: "200",
      approvalStatuses: ["DISAPPROVED", "APPROVED_LIMITED"],
      campaignId: "100",
      customerId: "1234567890",
      reviewStatuses: ["REVIEWED"],
    });

    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining("FROM ad_group_ad"),
    });
    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining(
        "ad_group_ad.policy_summary.approval_status IN ('DISAPPROVED', 'APPROVED_LIMITED')"
      ),
    });
    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining(
        "ad_group_ad.policy_summary.policy_topic_entries"
      ),
    });
    expect(rows).toStrictEqual([
      {
        adGroupId: "200",
        adGroupName: "Search ad group",
        adGroupResourceName: "customers/1234567890/adGroups/200",
        adId: "300",
        adResourceName: "customers/1234567890/ads/300",
        adStatus: "ENABLED",
        adType: "RESPONSIVE_SEARCH_AD",
        approvalStatus: "DISAPPROVED",
        campaignId: "100",
        campaignName: "Search",
        campaignResourceName: "customers/1234567890/campaigns/100",
        policyTopics: [
          {
            constraints: [],
            evidences: [{ textList: { texts: ["restricted claim"] } }],
            topic: "MISREPRESENTATION",
            type: "PROHIBITED",
          },
        ],
        primaryStatus: "NOT_ELIGIBLE",
        primaryStatusReasons: ["AD_GROUP_AD_DISAPPROVED"],
        resourceName: "customers/1234567890/adGroupAds/200~300",
        reviewStatus: "REVIEWED",
      },
    ]);
  });

  it("queries and normalizes asset policy diagnostics", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi.fn<GoogleAdsClient["search"]>().mockResolvedValue({
        requestId: "req",
        rows: [
          {
            asset: {
              id: "400",
              name: "Logo",
              policySummary: {
                approvalStatus: "APPROVED_LIMITED",
                policyTopicEntries: [
                  {
                    constraints: [{ countryConstraint: { countries: ["US"] } }],
                    topic: "TRADEMARKS_IN_AD_TEXT",
                    type: "LIMITED",
                  },
                ],
                reviewStatus: "ELIGIBLE_MAY_SERVE",
              },
              resourceName: "customers/1234567890/assets/400",
              source: "ADVERTISER",
              type: "IMAGE",
            },
          },
        ],
      }),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    const rows = await getAssetPolicyDiagnostics(client, {
      approvalStatuses: ["APPROVED_LIMITED"],
      customerId: "1234567890",
    });

    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining("FROM asset"),
    });
    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining(
        "asset.policy_summary.approval_status IN ('APPROVED_LIMITED')"
      ),
    });
    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining("asset.policy_summary.review_status"),
    });
    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining(
        "asset.policy_summary.policy_topic_entries"
      ),
    });
    expect(rows).toStrictEqual([
      {
        approvalStatus: "APPROVED_LIMITED",
        assetId: "400",
        assetName: "Logo",
        assetResourceName: "customers/1234567890/assets/400",
        assetSource: "ADVERTISER",
        assetType: "IMAGE",
        policyTopics: [
          {
            constraints: [{ countryConstraint: { countries: ["US"] } }],
            evidences: [],
            topic: "TRADEMARKS_IN_AD_TEXT",
            type: "LIMITED",
          },
        ],
        reviewStatus: "ELIGIBLE_MAY_SERVE",
      },
    ]);
  });

  it("rejects unsafe policy diagnostic filters before querying", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await expect(
      getAdPolicyDiagnostics(client, {
        adGroupId: "customers/123/adGroups/200",
        customerId: "1234567890",
      })
    ).rejects.toThrow("adGroupId must contain only digits");

    await expect(
      getAdPolicyDiagnostics(client, {
        approvalStatuses: ["FAKE_STATUS"] as never,
        customerId: "1234567890",
      })
    ).rejects.toThrow("FAKE_STATUS is not a supported policy status");

    await expect(
      getAssetPolicyDiagnostics(client, {
        customerId: "1234567890",
        reviewStatuses: ["REVIEWED; DROP"] as never,
      })
    ).rejects.toThrow("reviewStatuses must contain Google Ads enum names");

    expect(client.search).not.toHaveBeenCalled();
  });

  it("normalizes snake-case policy diagnostic rows", () => {
    expect(
      normalizeAdPolicyDiagnosticRow({
        ad_group: { id: 20, resource_name: "customers/123/adGroups/20" },
        ad_group_ad: {
          ad: {
            id: 30,
            resource_name: "customers/123/ads/30",
            type: "TEXT_AD",
          },
          policy_summary: {
            approval_status: "DISAPPROVED",
            policy_topic_entries: [
              {
                topic: "DESTINATION_NOT_WORKING",
                type: "PROHIBITED",
              },
            ],
            review_status: "REVIEWED",
          },
          primary_status_reasons: ["AD_GROUP_AD_DISAPPROVED"],
          resource_name: "customers/123/adGroupAds/20~30",
          status: "PAUSED",
        },
        campaign: { id: 10 },
      })
    ).toMatchObject({
      adGroupId: "20",
      adId: "30",
      approvalStatus: "DISAPPROVED",
      policyTopics: [
        {
          topic: "DESTINATION_NOT_WORKING",
          type: "PROHIBITED",
        },
      ],
      primaryStatusReasons: ["AD_GROUP_AD_DISAPPROVED"],
    });

    expect(
      normalizeAssetPolicyDiagnosticRow({
        asset: {
          id: 40,
          policy_summary: {
            approval_status: "APPROVED_LIMITED",
            review_status: "ELIGIBLE_MAY_SERVE",
          },
          resource_name: "customers/123/assets/40",
          type: "SITELINK",
        },
      })
    ).toMatchObject({
      approvalStatus: "APPROVED_LIMITED",
      assetId: "40",
      assetResourceName: "customers/123/assets/40",
      assetType: "SITELINK",
      reviewStatus: "ELIGIBLE_MAY_SERVE",
    });
  });

  it("normalizes REST click detail rows", () => {
    expect(
      normalizeClickDetailRow({
        adGroup: {
          id: "200",
          name: "Search ad group",
          resourceName: "customers/1234567890/adGroups/200",
        },
        campaign: {
          id: "100",
          name: "Search",
          resourceName: "customers/1234567890/campaigns/100",
        },
        clickView: {
          adGroupAd: "customers/1234567890/adGroupAds/200~300",
          gclid: "test-gclid_123",
          keyword: "customers/1234567890/adGroupCriteria/200~400",
          keywordInfo: { matchType: "EXACT", text: "donate now" },
          pageNumber: "2",
          resourceName:
            "customers/1234567890/clickViews/2026-07-30~test-gclid_123",
          userList: "customers/1234567890/userLists/500",
        },
        metrics: { clicks: "1" },
        segments: {
          adNetworkType: "SEARCH",
          clickType: "URL_CLICKS",
          date: "2026-07-30",
          device: "MOBILE",
        },
      })
    ).toStrictEqual({
      adGroupAdResourceName: "customers/1234567890/adGroupAds/200~300",
      adGroupId: "200",
      adGroupName: "Search ad group",
      adGroupResourceName: "customers/1234567890/adGroups/200",
      adId: "300",
      campaignId: "100",
      campaignName: "Search",
      campaignResourceName: "customers/1234567890/campaigns/100",
      clickType: "URL_CLICKS",
      clicks: 1,
      date: "2026-07-30",
      device: "MOBILE",
      gclid: "test-gclid_123",
      keywordMatchType: "EXACT",
      keywordResourceName: "customers/1234567890/adGroupCriteria/200~400",
      keywordText: "donate now",
      networkType: "SEARCH",
      pageNumber: 2,
      resourceName: "customers/1234567890/clickViews/2026-07-30~test-gclid_123",
      userListResourceName: "customers/1234567890/userLists/500",
    });
  });

  it("queries one day of click details with verified v24 fields", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi.fn<GoogleAdsClient["search"]>().mockResolvedValue({
        requestId: "req",
        rows: [],
      }),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };
    const date = dateDaysAgo(1);

    await getClickDetails(client, {
      adGroupId: "200",
      campaignId: "100",
      customerId: "1234567890",
      date,
      gclid: "test-gclid_123",
    });

    const query = client.search.mock.calls[0]?.[0].query ?? "";
    expect(query).toContain("FROM click_view");
    expect(query).toContain("click_view.resource_name");
    expect(query).toContain("click_view.gclid");
    expect(query).toContain("click_view.ad_group_ad");
    expect(query).toContain("click_view.keyword_info.match_type");
    expect(query).toContain("click_view.keyword_info.text");
    expect(query).toContain("click_view.user_list");
    expect(query).toContain("click_view.page_number");
    expect(query).toContain("segments.ad_network_type");
    expect(query).toContain("segments.click_type");
    expect(query).toContain("segments.date");
    expect(query).toContain("segments.device");
    expect(query).toContain("campaign.resource_name");
    expect(query).toContain("ad_group.resource_name");
    expect(query).toContain("metrics.clicks");
    expect(query).toContain(`segments.date = '${date}'`);
    expect(query).toContain("campaign.id = 100");
    expect(query).toContain("ad_group.id = 200");
    expect(query).toContain("click_view.gclid = 'test-gclid_123'");
  });

  it("rejects unsafe click detail inputs before querying", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi.fn<GoogleAdsClient["search"]>().mockResolvedValue({
        requestId: "req",
        rows: [],
      }),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };
    const date = dateDaysAgo(1);

    await expect(
      getClickDetails(client, {
        campaignId: "",
        customerId: "1234567890",
        date,
      })
    ).rejects.toThrow("campaignId must contain only digits");

    await expect(
      getClickDetails(client, {
        adGroupId: "200 OR 1=1",
        customerId: "1234567890",
        date,
      })
    ).rejects.toThrow("adGroupId must contain only digits");

    await expect(
      getClickDetails(client, {
        customerId: "1234567890",
        date: "2026-02-30",
      })
    ).rejects.toThrow("date must be a valid calendar date");

    await expect(
      getClickDetails(client, {
        customerId: "1234567890",
        date: dateDaysAgo(91),
      })
    ).rejects.toThrow("date must be within the past 90 days");

    await expect(
      getClickDetails(client, {
        customerId: "1234567890",
        date,
        gclid: "safe\nunsafe",
      })
    ).rejects.toThrow("gclid must not contain control characters");

    expect(client.search).not.toHaveBeenCalled();
  });

  it("escapes GCLID filters before interpolating them into GAQL", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi.fn<GoogleAdsClient["search"]>().mockResolvedValue({
        requestId: "req",
        rows: [],
      }),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await getClickDetails(client, {
      customerId: "1234567890",
      date: dateDaysAgo(1),
      gclid: "abc'\\def",
    });

    expect(client.search.mock.calls[0]?.[0].query).toContain(
      "click_view.gclid = 'abc\\'\\\\def'"
    );
  });

  it("normalizes snake-case click detail rows", () => {
    expect(
      normalizeClickDetailRow({
        ad_group: {
          id: 20,
          name: "Legacy ad group",
          resource_name: "customers/123/adGroups/20",
        },
        campaign: {
          id: 10,
          name: "Legacy campaign",
          resource_name: "customers/123/campaigns/10",
        },
        click_view: {
          ad_group_ad: "customers/123/adGroupAds/20~30",
          gclid: "legacy-gclid",
          keyword_info: { match_type: "BROAD", text: "legacy keyword" },
          page_number: 1,
          resource_name: "customers/123/clickViews/2026-07-30~legacy-gclid",
        },
        metrics: { clicks: 1 },
        segments: {
          ad_network_type: "SEARCH_PARTNERS",
          click_type: "SITELINKS",
          date: "2026-07-30",
          device: "DESKTOP",
        },
      })
    ).toMatchObject({
      adGroupId: "20",
      adId: "30",
      campaignId: "10",
      clickType: "SITELINKS",
      gclid: "legacy-gclid",
      keywordMatchType: "BROAD",
      networkType: "SEARCH_PARTNERS",
      pageNumber: 1,
      userListResourceName: null,
    });
  });
});
