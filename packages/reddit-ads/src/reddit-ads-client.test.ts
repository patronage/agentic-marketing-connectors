import { describe, expect, expectTypeOf, it, vi } from "vitest";

import type {
  RedditAd,
  RedditAdsOAuthAuthorizationCodeTokenRequest,
  RedditAdsOAuthClientCredentials,
  RedditAdsOAuthRefreshTokenRequest,
  RedditAdsOAuthScope,
  RedditAdsOAuthTokenResponse,
  RedditCampaign,
} from "./index.js";
import { createRedditAdsClient, RedditAdsApiError } from "./index.js";

function createClient(fetchMock: typeof fetch) {
  return createRedditAdsClient({
    accessToken: "access-token",
    adAccountId: "account-id",
    fetch: fetchMock,
  });
}

describe("Reddit Ads account reads", () => {
  it("gets the authenticated member with bearer auth", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: { id: "member-id", type: "MEMBER", reddit_username: "u" },
      })
    );

    await expect(createClient(fetchMock).getMe()).resolves.toMatchObject({
      id: "member-id",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://ads-api.reddit.com/api/v3/me"),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }),
        method: "GET",
      })
    );
  });

  it("lists the member businesses with documented filters", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: [{ id: "business-id", name: "Patronage" }],
        pagination: { next_url: "https://next", previous_url: null },
      })
    );

    const result = await createClient(fetchMock).listMyBusinesses({
      adAccountId: "account-filter",
      pageSize: 50,
      pageToken: "token",
      role: "BUSINESS_ADMIN",
    });

    expect(result).toStrictEqual({
      businesses: [{ id: "business-id", name: "Patronage" }],
      pagination: { nextUrl: "https://next", previousUrl: null },
    });
    const [url] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://ads-api.reddit.com/api/v3/me/businesses?ad_account_id=account-filter&page.size=50&page.token=token&role=BUSINESS_ADMIN"
    );
  });

  it("gets a business and its ad accounts", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ data: { id: "business-id", name: "Patronage" } })
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [{ id: "account-id", type: "SELF_SERVE" }],
          pagination: {},
        })
      );
    const client = createClient(fetchMock);

    await expect(client.getBusiness("business-id")).resolves.toMatchObject({
      id: "business-id",
    });
    const result = await client.listBusinessAdAccounts("business-id", {
      ids: ["account-id"],
    });
    expect(result.adAccounts).toMatchObject([
      { id: "account-id", type: "SELF_SERVE" },
    ]);
    expect(result.pagination).toStrictEqual({
      nextUrl: undefined,
      previousUrl: undefined,
    });
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      "https://ads-api.reddit.com/api/v3/businesses/business-id/ad_accounts?ids=account-id"
    );
  });

  it("gets the configured ad account", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: {
          id: "account-id",
          name: "Account",
          suspension_reason: "KYC_CHECK_FAILED",
          time_zone_id: null,
          type: "SELF_SERVE",
        },
      })
    );

    await expect(createClient(fetchMock).getAdAccount()).resolves.toMatchObject(
      {
        id: "account-id",
        suspension_reason: "KYC_CHECK_FAILED",
        time_zone_id: null,
      }
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://ads-api.reddit.com/api/v3/ad_accounts/account-id"
    );
  });

  it("rejects invalid successful envelopes", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ data: [] }));

    await expect(createClient(fetchMock).getMe()).rejects.toThrow(
      "expected a data object"
    );
  });

  it("throws a typed error carrying the provider payload", async () => {
    const payload = { error: { code: 401, message: "Unauthorized" } };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(payload, { status: 401 }));

    let caught: unknown;
    try {
      await createClient(fetchMock).getMe();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RedditAdsApiError);
    expect(caught).toMatchObject({ body: payload, message: "Unauthorized" });
  });
});

describe("Reddit Ads delivery contracts", () => {
  it("models promoted posts and budget reads explicitly", () => {
    expectTypeOf<RedditAd["post_id"]>().toEqualTypeOf<
      string | null | undefined
    >();
    expectTypeOf<RedditCampaign["goal_value"]>().toEqualTypeOf<
      number | null | undefined
    >();
  });

  it("lists campaigns with documented filters and budget fields", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: [
          {
            end_time: "2026-08-01T00:00:00Z",
            goal_value: 10_000_000,
            id: "campaign-id",
            start_time: "2026-07-01T00:00:00Z",
            spend_cap: null,
          },
        ],
        pagination: {},
      })
    );

    const result = await createClient(fetchMock).listCampaigns({
      ids: ["campaign-id"],
      pageSize: 25,
      pageToken: "next-page",
    });

    expect(result.campaigns[0]).toMatchObject({
      end_time: "2026-08-01T00:00:00Z",
      goal_value: 10_000_000,
      start_time: "2026-07-01T00:00:00Z",
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://ads-api.reddit.com/api/v3/ad_accounts/account-id/campaigns?id=campaign-id&page.size=25&page.token=next-page"
    );
  });

  it("keeps a mixed campaign page readable when Reddit adds enum values", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: [
          { id: "known-campaign", objective: "CLICKS" },
          { id: "new-campaign", objective: "FUTURE_OBJECTIVE" },
        ],
        pagination: {},
      })
    );

    await expect(
      createClient(fetchMock).listCampaigns()
    ).resolves.toMatchObject({
      campaigns: [
        { id: "known-campaign", objective: "CLICKS" },
        { id: "new-campaign", objective: "FUTURE_OBJECTIVE" },
      ],
    });
  });

  it("gets a campaign with its budget fields", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: { goal_value: 25_000_000, id: "campaign-id" },
      })
    );

    await expect(
      createClient(fetchMock).getCampaign("campaign-id")
    ).resolves.toMatchObject({
      goal_value: 25_000_000,
      id: "campaign-id",
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://ads-api.reddit.com/api/v3/campaigns/campaign-id"
    );
  });

  it("follows Reddit-provided campaign pagination URLs directly", async () => {
    const nextUrl =
      "https://ads-api.reddit.com/api/v3/ad_accounts/account-id/campaigns?page.token=next";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          data: [{ id: "first-campaign" }],
          pagination: { next_url: nextUrl },
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [{ id: "second-campaign" }],
          pagination: {},
        })
      );
    const client = createClient(fetchMock);

    const firstPage = await client.listCampaigns();
    const secondPage = await client.listCampaigns({
      pageUrl: firstPage.pagination.nextUrl ?? "",
    });

    expect(secondPage.campaigns).toMatchObject([{ id: "second-campaign" }]);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(nextUrl);
  });

  it("lists ad groups with explicit targeting and campaign filters", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: [
          {
            id: "ad-group-id",
            schedule: { end_time: "20:00:00" },
            targeting: {
              communities: ["r_marketing"],
              keywords: ["agency"],
            },
          },
        ],
        pagination: {},
      })
    );

    const result = await createClient(fetchMock).listAdGroups({
      campaignId: "campaign-id",
      ids: ["ad-group-id"],
    });

    expect(result.adGroups[0]).toMatchObject({
      schedule: { end_time: "20:00:00" },
      targeting: { communities: ["r_marketing"], keywords: ["agency"] },
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://ads-api.reddit.com/api/v3/ad_accounts/account-id/ad_groups?campaign_id=campaign-id&id=ad-group-id"
    );
  });

  it("lists ads with filters and explicit promoted-post references", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: [
          {
            id: "ad-id",
            post_id: "t3_post",
            post_url: null,
            preview_url: "https://www.reddit.com/?ad=preview",
            rejection_reason: "GAMBLING",
          },
        ],
        pagination: {},
      })
    );

    const result = await createClient(fetchMock).listAds({
      adGroupIds: ["ad-group-id"],
      configuredStatuses: ["ACTIVE"],
      ids: ["ad-id"],
    });

    expect(result.ads[0]).toMatchObject({
      post_id: "t3_post",
      preview_url: "https://www.reddit.com/?ad=preview",
      rejection_reason: "GAMBLING",
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://ads-api.reddit.com/api/v3/ad_accounts/account-id/ads?ad_group_id=ad-group-id&configured_status=ACTIVE&id=ad-id"
    );
  });

  it("lists targeting communities with documented filters", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: [
          {
            categories: ["Business"],
            id: "t5_marketing",
            name: "marketing",
            subscriber_count: 1_000_000,
          },
        ],
        pagination: { next_url: null },
      })
    );

    const result = await createClient(fetchMock).listCommunities({
      names: ["marketing", "advertising"],
      pageSize: 100,
      pageToken: "next-page",
    });

    expect(result.communities[0]).toMatchObject({
      id: "t5_marketing",
      subscriber_count: 1_000_000,
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://ads-api.reddit.com/api/v3/targeting/communities?names=marketing%2Cadvertising&page.size=100&page.token=next-page"
    );
  });

  it("lists targeting interests without pagination", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: [
          {
            category: "Animals & Pets",
            id: "animals_v2",
            name: "Animals",
          },
        ],
      })
    );

    await expect(
      createClient(fetchMock).listInterests()
    ).resolves.toStrictEqual([
      {
        category: "Animals & Pets",
        id: "animals_v2",
        name: "Animals",
      },
    ]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://ads-api.reddit.com/api/v3/targeting/interests"
    );
  });

  it("lists funding instruments for the configured ad account", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: [
          {
            authorize_status: "APPROVED",
            billable_amount: 596_086_656,
            credit_limit: 1_000_000_000,
            currency: "USD",
            id: "604212",
            is_servable: true,
            reasons_not_servable: [],
          },
        ],
        pagination: {},
      })
    );

    const result = await createClient(fetchMock).listFundingInstruments({
      fundingInstrumentIds: ["604212"],
      mode: "ACTIVE",
      pageSize: 50,
      search: "Promo",
      types: ["CREDIT_LINE"],
    });

    expect(result.fundingInstruments[0]).toMatchObject({
      currency: "USD",
      id: "604212",
      is_servable: true,
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://ads-api.reddit.com/api/v3/ad_accounts/account-id/funding_instruments?funding_instrument_ids=604212&types=CREDIT_LINE&search=Promo&mode=ACTIVE&page.size=50"
    );
  });
});

describe("Reddit Ads reporting", () => {
  it("gets a synchronous v3 report with documented fields and breakdowns", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: {
          metrics: [
            {
              ad_id: "ad-id",
              clicks: 25,
              date: "2026-07-30",
              impressions: 1000,
              spend: 1_234_567,
            },
          ],
          metrics_updated_at: "2026-07-31T18:00:00Z",
        },
        pagination: {
          next_url:
            "https://ads-api.reddit.com/api/v3/ad_accounts/account-id/reports?page.token=next",
          page_index: 0,
          previous_url: null,
          total_count: 1,
        },
      })
    );

    const result = await createClient(fetchMock).getReport({
      breakdowns: ["AD_ID", "DATE"],
      endsAt: "2026-07-31T00:00:00Z",
      fields: ["AD_ID", "DATE", "IMPRESSIONS", "CLICKS", "SPEND"],
      pageSize: 100,
      pageToken: "page-token",
      startsAt: "2026-07-01T00:00:00Z",
      timeZoneId: "America/Los_Angeles",
    });

    expect(result).toStrictEqual({
      metrics: [
        {
          ad_id: "ad-id",
          clicks: 25,
          date: "2026-07-30",
          impressions: 1000,
          spend: 1_234_567,
        },
      ],
      metricsUpdatedAt: "2026-07-31T18:00:00Z",
      pagination: {
        nextUrl:
          "https://ads-api.reddit.com/api/v3/ad_accounts/account-id/reports?page.token=next",
        pageIndex: 0,
        previousUrl: null,
        totalCount: 1,
      },
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://ads-api.reddit.com/api/v3/ad_accounts/account-id/reports?page.size=100&page.token=page-token"
    );
    expect(init).toMatchObject({
      headers: {
        Accept: "application/json",
        Authorization: "Bearer access-token",
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    expect(JSON.parse(String(init?.body))).toStrictEqual({
      data: {
        breakdowns: ["AD_ID", "DATE"],
        ends_at: "2026-07-31T00:00:00Z",
        fields: ["AD_ID", "DATE", "IMPRESSIONS", "CLICKS", "SPEND"],
        starts_at: "2026-07-01T00:00:00Z",
        time_zone_id: "America/Los_Angeles",
      },
    });
  });

  it("rejects invalid boolean report metric values", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: { metrics: [{ clicks: true }] },
        pagination: {},
      })
    );

    await expect(
      createClient(fetchMock).getReport({
        endsAt: "2026-07-31T00:00:00Z",
        fields: ["CLICKS"],
        startsAt: "2026-07-01T00:00:00Z",
        timeZoneId: "UTC",
      })
    ).rejects.toThrow("expected valid report metrics and pagination");
  });

  it("keeps documented object-valued report metrics", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: {
          metrics: [
            {
              conversion_custom_events: {
                Purchase: {
                  values: [{ metric_type: "VIEWS", value: 10 }],
                },
              },
              custom_columns: { "column-id": 579 },
            },
          ],
        },
        pagination: {},
      })
    );

    await expect(
      createClient(fetchMock).getReport({
        endsAt: "2026-07-31T00:00:00Z",
        fields: ["CLICKS"],
        startsAt: "2026-07-01T00:00:00Z",
        timeZoneId: "UTC",
      })
    ).resolves.toMatchObject({
      metrics: [
        {
          conversion_custom_events: { Purchase: { values: [{ value: 10 }] } },
          custom_columns: { "column-id": 579 },
        },
      ],
    });
  });

  it("defaults an omitted report time zone to the configured ad account", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          data: { id: "account-id", time_zone_id: "America/New_York" },
        })
      )
      .mockResolvedValueOnce(
        Response.json({ data: { metrics: [] }, pagination: {} })
      );

    await createClient(fetchMock).getReport({
      endsAt: "2026-07-31T00:00:00Z",
      fields: ["CLICKS"],
      startsAt: "2026-07-01T00:00:00Z",
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://ads-api.reddit.com/api/v3/ad_accounts/account-id"
    );
    expect(
      JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))
    ).toMatchObject({
      data: { time_zone_id: "America/New_York" },
    });
  });
});

describe("Reddit Ads OAuth contracts", () => {
  it("models the OpenAPI authorization-code scopes", () => {
    expectTypeOf<RedditAdsOAuthScope>().toEqualTypeOf<
      "adsconversions" | "adsdatadeletion" | "adsedit" | "adsread"
    >();
  });

  it("keeps Basic client credentials separate from supported grants", () => {
    expectTypeOf<RedditAdsOAuthClientCredentials>().toEqualTypeOf<{
      clientId: string;
      clientSecret: string;
    }>();

    type SupportedGrant =
      | RedditAdsOAuthAuthorizationCodeTokenRequest["grant_type"]
      | RedditAdsOAuthRefreshTokenRequest["grant_type"];
    expectTypeOf<
      Extract<SupportedGrant, "client_credentials">
    >().toEqualTypeOf<never>();
  });

  it("models authorization-code and refresh token responses", () => {
    expectTypeOf<RedditAdsOAuthTokenResponse>().toEqualTypeOf<{
      access_token: string;
      expires_in: number;
      refresh_token?: string;
      scope: string;
      token_type: "bearer";
    }>();
  });
});
