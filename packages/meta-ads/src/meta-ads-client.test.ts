import { describe, expect, it, vi } from "vitest";

import type { MetaAdsApiError } from "./meta-ads-api-error.js";
import { buildBoostPostPlan, createMetaAdsClient } from "./meta-ads-client.js";

describe("createMetaAdsClient", () => {
  it("fetches ad set insights with time range and campaign filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: [
          {
            adset_id: "adset-1",
            adset_name: "Boosted Posts",
            campaign_id: "campaign-1",
            impressions: "1000",
            spend: "42.00",
          },
        ],
      })
    );
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    const result = await client.getInsights({
      campaignId: "campaign-1",
      level: "adset",
      since: "2026-03-31",
      until: "2026-04-01",
    });

    expect(result).toHaveLength(1);
    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v21.0/act_123/insights");
    expect(requestUrl.searchParams.get("access_token")).toBe("token");
    expect(requestUrl.searchParams.get("level")).toBe("adset");
    expect(requestUrl.searchParams.get("fields")).toContain(
      "video_thruplay_watched_actions"
    );
    expect(
      JSON.parse(requestUrl.searchParams.get("time_range") ?? "{}")
    ).toEqual({
      since: "2026-03-31",
      until: "2026-04-01",
    });
    expect(requestUrl.searchParams.get("filtering")).toContain("campaign-1");
  });

  it("searches the Ad Library with public reporting fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: [
          {
            ad_creation_time: "2026-03-31",
            ad_delivery_start_time: "2026-03-31",
            ad_snapshot_url: "https://www.facebook.com/ads/library/?id=ad-1",
            id: "ad-1",
            page_id: "page-1",
            page_name: "Example",
            publisher_platforms: ["facebook"],
          },
        ],
      })
    );
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.searchAdLibrary({
        activeOnly: true,
        count: 3,
        pageId: "page-1",
        platform: "FACEBOOK",
        query: "climate",
      })
    ).resolves.toHaveLength(1);

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v21.0/ads_archive");
    expect(requestUrl.searchParams.get("ad_active_status")).toBe("ACTIVE");
    expect(requestUrl.searchParams.get("publisher_platform")).toBe("FACEBOOK");
    expect(requestUrl.searchParams.get("search_page_ids")).toBe("page-1");
    expect(requestUrl.searchParams.get("fields")).toContain("ad_snapshot_url");
  });

  it("finds campaigns by name", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: [{ id: "campaign-1", name: "Spring Boosting" }],
      })
    );
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.findCampaignByName({ name: "Spring" })
    ).resolves.toEqual({ id: "campaign-1", name: "Spring Boosting" });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v21.0/act_123/campaigns");
    expect(requestUrl.searchParams.get("filtering")).toContain("Spring");
  });

  it("declares empty special ad categories when creating campaigns", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: "1" }));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await client.createCampaign({
      name: "Awareness",
      objective: "OUTCOME_AWARENESS",
    });

    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get("special_ad_categories")).toBe("[]");
  });

  it("does not reuse default appsecret proof for overridden tokens", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: [] }));
    const client = createMetaAdsClient({
      accessToken: "user-token",
      adAccountId: "act_123",
      appSecretProof: "user-token-proof",
      fetch: fetchMock,
    });

    await client.getInsights({
      accessToken: "page-token",
      level: "campaign",
      since: "2026-03-31",
      until: "2026-04-01",
    });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.searchParams.get("access_token")).toBe("page-token");
    expect(requestUrl.searchParams.has("appsecret_proof")).toBe(false);
  });

  it("uses per-request appsecret proof for overridden tokens", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: [] }));
    const client = createMetaAdsClient({
      accessToken: "user-token",
      adAccountId: "act_123",
      appSecretProof: "user-token-proof",
      fetch: fetchMock,
    });

    await client.getInsights({
      accessToken: "page-token",
      appSecretProof: "page-token-proof",
      level: "campaign",
      since: "2026-03-31",
      until: "2026-04-01",
    });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.searchParams.get("access_token")).toBe("page-token");
    expect(requestUrl.searchParams.get("appsecret_proof")).toBe(
      "page-token-proof"
    );
  });

  it("throws structured Graph API errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        error: {
          code: 190,
          error_subcode: 460,
          error_user_msg: "Token expired",
          fbtrace_id: "trace-1",
          message: "Invalid OAuth 2.0 Access Token",
          type: "OAuthException",
        },
      })
    );
    const client = createMetaAdsClient({
      accessToken: "expired-token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.getInsights({
        level: "campaign",
        since: "2026-03-31",
        until: "2026-04-01",
      })
    ).rejects.toMatchObject({
      code: 190,
      errorSubcode: 460,
      fbtraceId: "trace-1",
      message: "Invalid OAuth 2.0 Access Token",
      name: "MetaAdsApiError",
      type: "OAuthException",
      userMessage: "Token expired",
    } satisfies Partial<MetaAdsApiError>);
  });

  it("retries retryable Graph API throttling responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            error: {
              code: 4,
              message: "Rate limit",
              type: "OAuthException",
            },
          },
          { headers: { "retry-after": "0" }, status: 429 }
        )
      )
      .mockResolvedValueOnce(Response.json({ data: [] }));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.getInsights({
        level: "campaign",
        since: "2026-03-31",
        until: "2026-04-01",
      })
    ).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("builds a guarded boost plan without issuing requests", () => {
    const plan = buildBoostPostPlan({
      budget: 50,
      days: 2,
      pageId: "page-1",
      postId: "page-1_post-1",
      specialAdCategories: ["ISSUES_ELECTIONS_POLITICS"],
    });

    expect(plan.campaign).toMatchObject({
      name: "Boost: FB Post post-1",
      objective: "OUTCOME_ENGAGEMENT",
      status: "PAUSED",
    });
    expect(plan.adSet.lifetimeBudget).toBe(50);
    expect(plan.adSet.promotedObject).toEqual({ page_id: "page-1" });
    expect(plan.adCreative).toMatchObject({
      authorizationCategory: "POLITICAL",
      objectStoryId: "page-1_post-1",
    });
  });

  it("creates a boost post campaign through the expected Graph sequence", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: "campaign-1" }))
      .mockResolvedValueOnce(Response.json({ id: "adset-1" }))
      .mockResolvedValueOnce(Response.json({ id: "creative-1" }))
      .mockResolvedValueOnce(Response.json({ id: "ad-1" }));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.boostPost({
        budget: 10,
        days: 1,
        pageId: "page-1",
        postId: "page-1_post-1",
      })
    ).resolves.toMatchObject({
      adId: "ad-1",
      adSetId: "adset-1",
      campaignId: "campaign-1",
      creativeId: "creative-1",
    });

    expect(
      fetchMock.mock.calls.map((call) => new URL(String(call[0])).pathname)
    ).toEqual([
      "/v21.0/act_123/campaigns",
      "/v21.0/act_123/adsets",
      "/v21.0/act_123/adcreatives",
      "/v21.0/act_123/ads",
    ]);
    const campaignBody = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(campaignBody.get("objective")).toBe("OUTCOME_ENGAGEMENT");
    const adBody = fetchMock.mock.calls[3]?.[1]?.body as URLSearchParams;
    expect(JSON.parse(adBody.get("creative") ?? "{}")).toEqual({
      creative_id: "creative-1",
    });
  });

  it("creates custom audiences with generated website rules", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: "aud-1" }));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await client.createCustomAudience({
      name: "Website Visitors",
      pixelId: "pixel-1",
      retentionDays: 30,
      subtype: "WEBSITE",
    });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v21.0/act_123/customaudiences");
    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get("subtype")).toBe("WEBSITE");
    expect(body.get("rule")).toContain("pixel-1");
  });

  it("sends conversion events to the configured pixel", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        events_received: 1,
        fbtrace_id: "trace-1",
      })
    );
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await client.sendConversionEvents({
      events: {
        events: [
          {
            action_source: "website",
            event_name: "Lead",
            event_time: 1_779_553_200,
            user_data: { em: "hashed-email" },
          },
        ],
        testEventCode: "TEST123",
      },
      pixelId: "pixel-1",
    });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v21.0/pixel-1/events");
    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get("test_event_code")).toBe("TEST123");
    expect(body.get("data")).toContain("Lead");
  });

  it("exchanges and inspects user tokens without ad account paths", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ access_token: "long-token" }))
      .mockResolvedValueOnce(
        Response.json({ data: { is_valid: true, type: "USER" } })
      );
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.exchangeLongLivedUserToken({
        appId: "app",
        appSecret: "secret",
        shortLivedToken: "short-token",
      })
    ).resolves.toEqual({ access_token: "long-token" });
    await expect(
      client.inspectToken({
        appId: "app",
        appSecret: "secret",
        token: "long-token",
      })
    ).resolves.toEqual({ data: { is_valid: true, type: "USER" } });

    const exchangeUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(exchangeUrl.pathname).toBe("/v21.0/oauth/access_token");
    expect(exchangeUrl.searchParams.get("fb_exchange_token")).toBe(
      "short-token"
    );
    const inspectUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(inspectUrl.pathname).toBe("/v21.0/debug_token");
    expect(inspectUrl.searchParams.get("access_token")).toBe("app|secret");
  });
});
