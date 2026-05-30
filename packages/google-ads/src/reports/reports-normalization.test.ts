import { describe, expect, it, vi } from "vitest";

import {
  getAgeRangePerformance,
  getCampaignLocationCriteria,
  getCampaignPerformance,
  getGeographicPerformance,
  getKeywordPerformance,
  getLocationCriterionPerformance,
  getReachFrequencyPerformance,
  getSearchTerms,
  getVideoPerformance,
  normalizeAudienceSegmentRow,
  normalizeCampaignLocationCriterionRow,
  normalizeCampaignPerformanceRow,
  normalizeGeographicRow,
  normalizeKeywordPerformanceRow,
  normalizeLocationCriterionPerformanceRow,
  normalizeReachFrequencyRow,
  normalizeSearchTermRow,
  normalizeVideoPerformanceRow,
} from "./index.js";

describe("campaign report normalization", () => {
  it("normalizes REST lower-camel rows into stable campaign metrics", () => {
    expect(
      normalizeCampaignPerformanceRow({
        campaign: {
          advertisingChannelType: "SEARCH",
          id: "23295113928",
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
    ).toEqual({
      avgCpc: 2.4,
      channelType: "SEARCH",
      clicks: 90,
      conversions: 12,
      conversionsValue: 0,
      cost: 216,
      ctr: 0.06,
      dailyBudget: 150,
      id: "23295113928",
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
      search: vi.fn().mockResolvedValue({
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
      searchStream: vi.fn(),
      mutate: vi.fn(),
    };

    const rows = await getCampaignPerformance(client, {
      customerId: "1234567890",
      days: 30,
    });

    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining("campaign.advertising_channel_type"),
    });
    expect(rows).toEqual([
      expect.objectContaining({
        clicks: 1,
        id: "1",
        name: "Campaign",
      }),
    ]);
  });

  it("supports explicit campaign performance date ranges", async () => {
    const client = {
      mutate: vi.fn(),
      search: vi.fn().mockResolvedValue({
        requestId: "req",
        rows: [],
      }),
      searchStream: vi.fn(),
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
      mutate: vi.fn(),
      search: vi
        .fn()
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
      searchStream: vi.fn(),
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
    expect(rows).toEqual([
      expect.objectContaining({ clicks: 1, id: "1" }),
      expect.objectContaining({ clicks: 2, id: "2" }),
    ]);
  });

  it("rejects unsupported date ranges instead of coercing them", async () => {
    const client = {
      mutate: vi.fn(),
      search: vi.fn(),
      searchStream: vi.fn(),
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
      mutate: vi.fn(),
      search: vi.fn(),
      searchStream: vi.fn(),
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
    ).toEqual({
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
    ).toEqual({
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

    expect(row).toEqual({
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
    ).toEqual({
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
      mutate: vi.fn(),
      search: vi
        .fn()
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
      searchStream: vi.fn(),
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

  it("queries video performance with video-specific GAQL metrics", async () => {
    const client = {
      mutate: vi.fn(),
      search: vi.fn().mockResolvedValue({
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
      searchStream: vi.fn(),
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
    expect(rows).toEqual([
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
      mutate: vi.fn(),
      search: vi.fn().mockResolvedValue({
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
      searchStream: vi.fn(),
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
    expect(rows).toEqual([
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
      mutate: vi.fn(),
      search: vi.fn().mockResolvedValue({
        requestId: "reach-frequency",
        rows: [],
      }),
      searchStream: vi.fn(),
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
      mutate: vi.fn(),
      search: vi.fn().mockResolvedValue({
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
      searchStream: vi.fn(),
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
    expect(rows).toEqual([
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
      mutate: vi.fn(),
      search: vi.fn().mockResolvedValue({
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
      searchStream: vi.fn(),
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
    expect(rows).toEqual([
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
      mutate: vi.fn(),
      search: vi.fn().mockResolvedValue({
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
      searchStream: vi.fn(),
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
    expect(rows).toEqual([
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
      mutate: vi.fn(),
      search: vi.fn().mockResolvedValue({
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
      searchStream: vi.fn(),
    };

    const rows = await getLocationCriterionPerformance(client, {
      customerId: "1234567890",
      days: 30,
    });

    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining("FROM location_view"),
    });
    expect(rows).toEqual([
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
      mutate: vi.fn(),
      search: vi.fn(),
      searchStream: vi.fn(),
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
});
