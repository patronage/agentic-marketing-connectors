import { describe, expect, it, vi } from "vitest";

import {
  createTikTokAdsClient,
  TikTokAdsAmbiguousWriteError,
  TikTokAdsApiError,
} from "./index.js";

describe("TikTok Ads client", () => {
  it("lists advertisers authorized for the configured access token", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        code: 0,
        data: {
          list: [
            {
              advertiser_id: "987654321",
              advertiser_name: "Patronage Test",
            },
          ],
        },
        message: "OK",
        request_id: "request-123",
      })
    );
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });

    await expect(
      client.listAuthorizedAdvertisers({ appId: "app-id", secret: "secret" })
    ).resolves.toStrictEqual([
      {
        advertiser_id: "987654321",
        advertiser_name: "Patronage Test",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/?app_id=app-id&secret=secret"
    );
    expect(init).toStrictEqual({
      headers: { "Access-Token": "access-token" },
      method: "GET",
    });
  });

  it("rejects a TikTok body error returned with HTTP 200", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        code: 40_002,
        data: {},
        message: "Invalid request parameters",
        request_id: "request-error",
      })
    );
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });

    const request = client.listAuthorizedAdvertisers({
      appId: "app-id",
      secret: "secret",
    });

    await expect(request).rejects.toBeInstanceOf(TikTokAdsApiError);
    await expect(request).rejects.toMatchObject({
      code: 40_002,
      message: "Invalid request parameters",
      requestId: "request-error",
      status: 200,
    });
  });

  it("rejects a TikTok body error returned for a write with HTTP 200", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        code: 40_002,
        data: {},
        message: "Invalid request parameters",
        request_id: "request-write-error",
      })
    );
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });

    await expect(
      client.createCampaign({
        budget: 500,
        budgetMode: "BUDGET_MODE_TOTAL",
        campaignName: "Traffic Campaign",
        objectiveType: "TRAFFIC",
        operationStatus: "DISABLE",
      })
    ).rejects.toMatchObject({
      code: 40_002,
      requestId: "request-write-error",
      status: 200,
    });
  });

  it("rejects campaign budgets expressed in minor or non-finite units", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });

    await expect(
      client.createCampaign({
        budget: 500.5,
        budgetMode: "BUDGET_MODE_TOTAL",
        campaignName: "Traffic Campaign",
        objectiveType: "TRAFFIC",
        operationStatus: "DISABLE",
      })
    ).rejects.toThrow(
      "TikTok campaign budget must be a positive whole account-currency unit."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks a network failure during a write as ambiguous", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("connection closed"));
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });

    await expect(
      client.createPixel({ name: "Patronage Pixel" })
    ).rejects.toBeInstanceOf(TikTokAdsAmbiguousWriteError);
  });

  it("marks a malformed JSON write response as ambiguous", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("not json", { status: 200 }));
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });

    await expect(
      client.createPixel({ name: "Patronage Pixel" })
    ).rejects.toBeInstanceOf(TikTokAdsAmbiguousWriteError);
  });

  it("marks a retryable write response as ambiguous", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          code: 50_002,
          data: {},
          message: "Service unavailable",
          request_id: "request-retryable",
        },
        { status: 503 }
      )
    );
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });

    await expect(
      client.createPixel({ name: "Patronage Pixel" })
    ).rejects.toMatchObject({
      name: "TikTokAdsAmbiguousWriteError",
      providerRequestId: "request-retryable",
      status: 503,
    });
  });

  it("marks a retryable write response ambiguous even when its TikTok body code is zero", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ code: 0, data: {}, message: "OK" }, { status: 500 })
      );
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });

    await expect(
      client.createPixel({ name: "Conversion Pixel" })
    ).rejects.toMatchObject({
      name: "TikTokAdsAmbiguousWriteError",
      status: 500,
    });
  });

  it("rejects malformed JSON responses", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("{", { status: 200 }));
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });

    await expect(client.listTargetingLanguages()).rejects.toThrow(
      "TikTok returned malformed JSON for GET tool/language/."
    );
  });

  it("rejects invalid TikTok response envelopes", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ code: "0", data: {}, message: "OK" }));
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });

    await expect(client.listTargetingLanguages()).rejects.toThrow(
      "TikTok returned an invalid response envelope for GET tool/language/."
    );
  });

  it("validates required client options", () => {
    const fetchMock = vi.fn<typeof fetch>();

    expect(() =>
      createTikTokAdsClient({
        accessToken: " ",
        advertiserId: "987654321",
        fetch: fetchMock,
      })
    ).toThrow("TikTok accessToken is required.");
    expect(() =>
      createTikTokAdsClient({
        accessToken: "access-token",
        advertiserId: " ",
        fetch: fetchMock,
      })
    ).toThrow("TikTok advertiserId is required.");
  });

  it("creates a pixel for the configured advertiser", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        code: 0,
        data: {
          pixel_code: "PIXELCODE123",
          pixel_id: "123456789",
          pixel_name: "Conversion Pixel",
        },
        message: "OK",
        request_id: "request-pixel",
      })
    );
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });

    await expect(
      client.createPixel({ name: "Conversion Pixel" })
    ).resolves.toStrictEqual({
      pixel_code: "PIXELCODE123",
      pixel_id: "123456789",
      pixel_name: "Conversion Pixel",
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://business-api.tiktok.com/open_api/v1.3/pixel/create/"
    );
    expect(init).toStrictEqual({
      body: JSON.stringify({
        advertiser_id: "987654321",
        pixel_name: "Conversion Pixel",
      }),
      headers: {
        "Access-Token": "access-token",
        "Content-Type": "application/json",
      },
      method: "POST",
    });
  });

  it("lists pixels for the configured advertiser", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        code: 0,
        data: {
          page_info: {
            page: 1,
            page_size: 10,
            total_number: 1,
            total_page: 1,
          },
          pixels: [
            {
              pixel_code: "PIXELCODE123",
              pixel_id: "123456789",
              pixel_name: "Conversion Pixel",
            },
          ],
        },
        message: "OK",
        request_id: "request-pixels",
      })
    );
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });

    await expect(client.listPixels()).resolves.toStrictEqual({
      pageInfo: {
        page: 1,
        page_size: 10,
        total_number: 1,
        total_page: 1,
      },
      pixels: [
        {
          pixel_code: "PIXELCODE123",
          pixel_id: "123456789",
          pixel_name: "Conversion Pixel",
        },
      ],
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://business-api.tiktok.com/open_api/v1.3/pixel/list/?advertiser_id=987654321"
    );
    expect(init).toStrictEqual({
      headers: { "Access-Token": "access-token" },
      method: "GET",
    });
  });

  it("lists languages available for targeting", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        code: 0,
        data: {
          languages: [
            { code: "en", name: "English" },
            { code: "es", name: "Spanish" },
          ],
        },
        message: "OK",
        request_id: "request-languages",
      })
    );
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });

    await expect(client.listTargetingLanguages()).resolves.toStrictEqual([
      { code: "en", name: "English" },
      { code: "es", name: "Spanish" },
    ]);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://business-api.tiktok.com/open_api/v1.3/tool/language/?advertiser_id=987654321"
    );
    expect(init).toStrictEqual({
      headers: { "Access-Token": "access-token" },
      method: "GET",
    });
  });

  it("creates an advertiser identity for ad creatives", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        code: 0,
        data: { identity_id: "identity-123" },
        message: "OK",
        request_id: "request-identity",
      })
    );
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });

    await expect(
      client.createIdentity({
        displayName: "Patronage",
        imageUri: "tos-image-uri",
      })
    ).resolves.toStrictEqual({ identity_id: "identity-123" });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://business-api.tiktok.com/open_api/v1.3/identity/create/"
    );
    expect(init).toStrictEqual({
      body: JSON.stringify({
        advertiser_id: "987654321",
        display_name: "Patronage",
        image_uri: "tos-image-uri",
      }),
      headers: {
        "Access-Token": "access-token",
        "Content-Type": "application/json",
      },
      method: "POST",
    });
  });

  it("updates campaign statuses", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        code: 0,
        data: {
          campaign_ids: ["111", "222"],
        },
        message: "OK",
        request_id: "request-campaign-status",
      })
    );
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });

    await expect(
      client.updateCampaignStatus({
        campaignIds: ["111", "222"],
        operationStatus: "DISABLE",
        postbackWindowMode: "POSTBACK_WINDOW_MODE1",
      })
    ).resolves.toStrictEqual({
      campaign_ids: ["111", "222"],
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://business-api.tiktok.com/open_api/v1.3/campaign/status/update/"
    );
    expect(init).toStrictEqual({
      body: JSON.stringify({
        advertiser_id: "987654321",
        campaign_ids: ["111", "222"],
        operation_status: "DISABLE",
        postback_window_mode: "POSTBACK_WINDOW_MODE1",
      }),
      headers: {
        "Access-Token": "access-token",
        "Content-Type": "application/json",
      },
      method: "POST",
    });
  });

  it("requires an explicit acknowledgement before deleting campaigns", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });

    await expect(
      // @ts-expect-error DELETE must be explicitly acknowledged.
      client.updateCampaignStatus({
        campaignIds: ["111"],
        operationStatus: "DELETE",
      })
    ).rejects.toThrow("TikTok campaign deletion requires confirmDelete: true.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects campaign status updates above TikTok's batch limit", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });

    await expect(
      client.updateCampaignStatus({
        campaignIds: Array.from({ length: 21 }, (_, index) => String(index)),
        operationStatus: "DISABLE",
      })
    ).rejects.toThrow(
      "TikTok campaign status updates require 1 to 20 campaign IDs."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects numeric campaign IDs in a status update response", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        code: 0,
        data: { campaign_ids: [111] },
        message: "OK",
      })
    );
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });

    await expect(
      client.updateCampaignStatus({
        campaignIds: ["111"],
        operationStatus: "DISABLE",
      })
    ).rejects.toThrow(
      "TikTok campaign status update returned an invalid result."
    );
  });

  it("tracks server-side web events with hashed identifiers", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ code: 0, data: {}, message: "OK" }));
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });
    const events = [
      {
        event: "Purchase",
        event_id: "order-123",
        event_time: 1_722_470_400,
        page: { url: "https://example.com/checkout" },
        properties: {
          content_ids: ["sku-123"],
          content_type: "product" as const,
          currency: "USD",
          order_id: "order-123",
          value: 20,
        },
        user: {
          email:
            "848a771458438fc2ec420560d769fb9b9b86851ee338ec56517baabd79d3bb4f",
          external_id:
            "80fba0ae1c48e3978e43e4efc365e14e12ea0c830ba8ba5b9a2dafc7e3f2ab8b",
          phone:
            "9f7ec22d72092cd3c0b58726ed9c2d91b92e51a3f29837508fb2948bb22dd2fd",
          ttclid: "ttclid-123",
          user_agent: "Mozilla/5.0",
        },
      },
    ];

    await expect(
      client.trackWebEvents({ eventSourceId: "PIXELCODE123", events })
    ).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://business-api.tiktok.com/open_api/v1.3/event/track/"
    );
    expect(init).toStrictEqual({
      body: JSON.stringify({
        data: events,
        event_source: "web",
        event_source_id: "PIXELCODE123",
      }),
      headers: {
        "Access-Token": "access-token",
        "Content-Type": "application/json",
      },
      method: "POST",
    });
  });

  it("rejects event batches exceeding 1,000 events before calling fetch", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });
    const event = {
      event: "ViewContent",
      event_time: 1_722_470_400,
      page: { url: "https://example.com" },
    };

    await expect(
      client.trackWebEvents({
        eventSourceId: "PIXELCODE123",
        events: Array.from({ length: 1001 }, () => event),
      })
    ).rejects.toThrow(
      "TikTok event tracking supports at most 1,000 events per request."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects raw web-event identifiers before calling fetch", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });

    await expect(
      client.trackWebEvents({
        eventSourceId: "PIXELCODE123",
        events: [
          {
            event: "Purchase",
            event_time: 1_722_470_400,
            page: { url: "https://example.com/checkout" },
            user: { email: "donor@example.org" },
          },
        ],
      })
    ).rejects.toThrow(
      "TikTok web event user.email must be a lowercase SHA-256 hex digest."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("runs a synchronous basic report", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        code: 0,
        data: {
          list: [
            {
              dimensions: {
                ad_id: "111",
                stat_time_day: "2026-07-01 00:00:00",
              },
              metrics: { clicks: "25", impressions: "1000", spend: "12.34" },
            },
          ],
          page_info: {
            page: 1,
            page_size: 100,
            total_number: 1,
            total_page: 1,
          },
        },
        message: "OK",
        request_id: "request-report",
      })
    );
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });

    await expect(
      client.getBasicReport({
        dataLevel: "AUCTION_AD",
        dimensions: ["ad_id", "stat_time_day"],
        endDate: "2026-07-31",
        filtering: [
          {
            fieldName: "ad_ids",
            filterType: "IN",
            filterValue: '["111","222"]',
          },
        ],
        metrics: ["spend", "impressions", "clicks"],
        page: 1,
        pageSize: 100,
        startDate: "2026-07-01",
      })
    ).resolves.toStrictEqual({
      list: [
        {
          dimensions: {
            ad_id: "111",
            stat_time_day: "2026-07-01 00:00:00",
          },
          metrics: { clicks: "25", impressions: "1000", spend: "12.34" },
        },
      ],
      pageInfo: {
        page: 1,
        page_size: 100,
        total_number: 1,
        total_page: 1,
      },
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const requestUrl = new URL(String(url));
    expect(requestUrl.pathname).toBe("/open_api/v1.3/report/integrated/get/");
    expect(Object.fromEntries(requestUrl.searchParams)).toStrictEqual({
      advertiser_id: "987654321",
      data_level: "AUCTION_AD",
      dimensions: '["ad_id","stat_time_day"]',
      end_date: "2026-07-31",
      filtering:
        '[{"field_name":"ad_ids","filter_type":"IN","filter_value":"[\\"111\\",\\"222\\"]"}]',
      metrics: '["spend","impressions","clicks"]',
      page: "1",
      page_size: "100",
      report_type: "BASIC",
      start_date: "2026-07-01",
    });
    expect(init).toStrictEqual({
      headers: { "Access-Token": "access-token" },
      method: "GET",
    });
  });

  it("gets information for the configured advertiser", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        code: 0,
        data: {
          list: [{ advertiser_id: "987654321", name: "Patronage Test" }],
        },
        message: "OK",
      })
    );
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });

    await expect(client.getAdvertiserInfo()).resolves.toStrictEqual({
      advertiser_id: "987654321",
      name: "Patronage Test",
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://business-api.tiktok.com/open_api/v1.3/advertiser/info/?advertiser_ids=%5B%22987654321%22%5D&fields=%5B%22advertiser_id%22%2C%22name%22%5D"
    );
    expect(init).toStrictEqual({
      headers: { "Access-Token": "access-token" },
      method: "GET",
    });
  });

  it("lists creative portfolios", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        code: 0,
        data: {
          creative_portfolios: [
            {
              card_type: "IMAGE",
              creative_portfolio_id: "portfolio-123",
              creative_portfolio_preview_url: "https://example.com/preview",
              creative_portfolio_type: "CARD",
              image_id: "image-123",
            },
          ],
          page_info: {
            page: 1,
            page_size: 100,
            total_number: 1,
            total_page: 1,
          },
        },
        message: "OK",
      })
    );
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });

    await expect(
      client.listCreativePortfolios({
        creativePortfolioIds: ["portfolio-123"],
        creativePortfolioTypes: ["CARD"],
        page: 1,
        pageSize: 100,
      })
    ).resolves.toStrictEqual({
      pageInfo: {
        page: 1,
        page_size: 100,
        total_number: 1,
        total_page: 1,
      },
      portfolios: [
        {
          creative_portfolio_id: "portfolio-123",
          creative_portfolio_preview_url: "https://example.com/preview",
          creative_portfolio_type: "CARD",
        },
      ],
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    const requestUrl = new URL(String(url));
    expect(requestUrl.pathname).toBe("/open_api/v1.3/creative/portfolio/list/");
    expect(Object.fromEntries(requestUrl.searchParams)).toStrictEqual({
      advertiser_id: "987654321",
      filtering:
        '{"creative_portfolio_types":["CARD"],"creative_portfolio_ids":["portfolio-123"]}',
      page: "1",
      page_size: "100",
    });
    expect(init).toStrictEqual({
      headers: { "Access-Token": "access-token" },
      method: "GET",
    });
  });

  it("creates a traffic campaign", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        code: 0,
        data: { campaign_id: "123456789" },
        message: "OK",
      })
    );
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });

    await expect(
      client.createCampaign({
        budget: 500,
        budgetMode: "BUDGET_MODE_TOTAL",
        campaignName: "Traffic Campaign",
        objectiveType: "TRAFFIC",
        operationStatus: "DISABLE",
      })
    ).resolves.toStrictEqual({ campaign_id: "123456789" });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://business-api.tiktok.com/open_api/v1.3/campaign/create/"
    );
    expect(init).toStrictEqual({
      body: JSON.stringify({
        advertiser_id: "987654321",
        objective_type: "TRAFFIC",
        campaign_name: "Traffic Campaign",
        budget_mode: "BUDGET_MODE_TOTAL",
        operation_status: "DISABLE",
        budget: 500,
      }),
      headers: {
        "Access-Token": "access-token",
        "Content-Type": "application/json",
      },
      method: "POST",
    });
  });

  it("creates a file-backed custom audience", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        code: 0,
        data: { custom_audience_id: "123" },
        message: "OK",
        request_id: "request-custom-audience",
      })
    );
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });

    await expect(
      client.createCustomAudience({
        calculateType: "EMAIL_SHA256",
        filePaths: ["uploaded-file-path-123"],
        name: "Donors July 2026",
      })
    ).resolves.toStrictEqual({ custom_audience_id: "123" });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://business-api.tiktok.com/open_api/v1.3/dmp/custom_audience/create/"
    );
    expect(init).toStrictEqual({
      body: JSON.stringify({
        advertiser_id: "987654321",
        custom_audience_name: "Donors July 2026",
        file_paths: ["uploaded-file-path-123"],
        calculate_type: "EMAIL_SHA256",
      }),
      headers: {
        "Access-Token": "access-token",
        "Content-Type": "application/json",
      },
      method: "POST",
    });
  });

  it("uploads a file for a custom audience", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        code: 0,
        data: { file_path: "uploaded-file-path-123" },
        message: "OK",
        request_id: "request-custom-audience-upload",
      })
    );
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });

    await expect(
      client.uploadCustomAudienceFile({
        calculateType: "EMAIL_SHA256",
        file: new Blob(["email"], { type: "text/plain" }),
        fileName: "donors.txt",
        fileSignature: "a3f4af91c1a9c8ec0d9a8a7b6c5d4e3f",
      })
    ).resolves.toStrictEqual({ file_path: "uploaded-file-path-123" });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://business-api.tiktok.com/open_api/v1.3/dmp/custom_audience/file/upload/"
    );
    expect(init?.headers).toStrictEqual({ "Access-Token": "access-token" });
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(FormData);
    if (!(init?.body instanceof FormData)) {
      throw new Error(
        "Expected custom audience upload to use multipart form data."
      );
    }
    expect(init.body.get("advertiser_id")).toBe("987654321");
    expect(init.body.get("calculate_type")).toBe("EMAIL_SHA256");
    expect(init.body.get("file_name")).toBe("donors.txt");
    expect(init.body.get("file_signature")).toBe(
      "a3f4af91c1a9c8ec0d9a8a7b6c5d4e3f"
    );
    expect(init.body.get("file")).toBeInstanceOf(Blob);
  });

  it("creates a lookalike audience with the v1.3 contract", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        code: 0,
        data: { custom_audience_id: "456" },
        message: "OK",
        request_id: "request-lookalike",
      })
    );
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });

    await expect(
      client.createLookalikeAudience({
        audienceSize: "BALANCED",
        includeSource: false,
        locationIds: ["US"],
        mobileOs: "ALL",
        name: "US Donor Lookalike",
        placements: ["TikTok"],
        sourceAudienceId: "123",
      })
    ).resolves.toStrictEqual({ custom_audience_id: "456" });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://business-api.tiktok.com/open_api/v1.3/dmp/custom_audience/lookalike/create/"
    );
    expect(init).toStrictEqual({
      body: JSON.stringify({
        advertiser_id: "987654321",
        custom_audience_name: "US Donor Lookalike",
        lookalike_spec: {
          source_audience_id: "123",
          include_source: false,
          mobile_os: "ALL",
          placements: ["TikTok"],
          location_ids: ["US"],
          audience_size: "BALANCED",
        },
      }),
      headers: {
        "Access-Token": "access-token",
        "Content-Type": "application/json",
      },
      method: "POST",
    });
  });

  it("creates a single-video Spark Pull ad with an identity", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        code: 0,
        data: {
          ad_ids: ["ad-123"],
          creatives: [
            {
              ad_format: "SINGLE_VIDEO",
              ad_id: "ad-123",
              ad_name: "Spark Pull Ad",
              adgroup_id: "adgroup-123",
              advertiser_id: "987654321",
              call_to_action: "LEARN_MORE",
              identity_id: "identity-123",
              identity_type: "TT_USER",
              operation_status: "ENABLE",
              tiktok_item_id: "item-123",
            },
          ],
          need_audit: false,
        },
        message: "OK",
      })
    );
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });

    await expect(
      client.createAd({
        adFormat: "SINGLE_VIDEO",
        adGroupId: "adgroup-123",
        adName: "Spark Pull Ad",
        callToAction: "LEARN_MORE",
        identityId: "identity-123",
        identityType: "TT_USER",
        landingPageUrl: "https://patronage.com/donate",
        operationStatus: "DISABLE",
        tiktokItemId: "item-123",
      })
    ).resolves.toStrictEqual({ ad_ids: ["ad-123"] });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://business-api.tiktok.com/open_api/v1.3/ad/create/"
    );
    expect(init).toStrictEqual({
      body: JSON.stringify({
        advertiser_id: "987654321",
        adgroup_id: "adgroup-123",
        creatives: [
          {
            ad_name: "Spark Pull Ad",
            identity_type: "TT_USER",
            identity_id: "identity-123",
            ad_format: "SINGLE_VIDEO",
            tiktok_item_id: "item-123",
            call_to_action: "LEARN_MORE",
            operation_status: "DISABLE",
            landing_page_url: "https://patronage.com/donate",
          },
        ],
      }),
      headers: {
        "Access-Token": "access-token",
        "Content-Type": "application/json",
      },
      method: "POST",
    });
  });

  it("lists interest categories available for targeting", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        code: 0,
        data: {
          interest_categories: [
            {
              interest_category_id: "10",
              interest_category_name: "Education",
              level: 1,
              placements: [],
              special_industries: ["HOUSING", "EMPLOYMENT", "CREDIT"],
              sub_category_ids: ["10100", "10101"],
            },
          ],
        },
        message: "OK",
      })
    );
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });

    await expect(
      client.listInterestCategories({
        language: "en",
        placements: ["PLACEMENT_TIKTOK"],
        specialIndustries: ["HOUSING"],
        version: 2,
      })
    ).resolves.toStrictEqual([
      {
        interest_category_id: "10",
        interest_category_name: "Education",
        level: 1,
        placements: [],
        special_industries: ["HOUSING", "EMPLOYMENT", "CREDIT"],
        sub_category_ids: ["10100", "10101"],
      },
    ]);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://business-api.tiktok.com/open_api/v1.3/tool/interest_category/?advertiser_id=987654321&version=2&language=en&placements=%5B%22PLACEMENT_TIKTOK%22%5D&special_industries=%5B%22HOUSING%22%5D"
    );
    expect(init).toStrictEqual({
      headers: { "Access-Token": "access-token" },
      method: "GET",
    });
  });

  it("lists advertiser identities", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        code: 0,
        data: {
          identity_list: [
            {
              ads_only_mode: null,
              available_status: "AVAILABLE",
              can_pull_video: true,
              display_name: "Patronage",
              identity_authorized_bc_id: null,
              identity_id: "identity-123",
              identity_type: "TT_USER",
              profile_image: "https://example.com/profile.jpg",
              username: "patronage",
            },
          ],
          page_info: {
            page: 1,
            page_size: 20,
            total_number: 1,
            total_page: 1,
          },
        },
        message: "OK",
      })
    );
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });

    await expect(
      client.listIdentities({ identityType: "TT_USER", page: 1, pageSize: 20 })
    ).resolves.toStrictEqual({
      identities: [
        {
          display_name: "Patronage",
          identity_id: "identity-123",
          identity_type: "TT_USER",
          profile_image: "https://example.com/profile.jpg",
        },
      ],
      pageInfo: {
        page: 1,
        page_size: 20,
        total_number: 1,
        total_page: 1,
      },
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://business-api.tiktok.com/open_api/v1.3/identity/get/?advertiser_id=987654321&identity_type=TT_USER&page=1&page_size=20"
    );
    expect(init).toStrictEqual({
      headers: { "Access-Token": "access-token" },
      method: "GET",
    });
  });

  it("lists campaigns", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        code: 0,
        data: {
          list: [
            {
              advertiser_id: "987654321",
              campaign_id: "campaign-123",
              campaign_name: "Traffic Campaign",
            },
          ],
          page_info: {
            page: 1,
            page_size: 100,
            total_number: 1,
            total_page: 1,
          },
        },
        message: "OK",
      })
    );
    const client = createTikTokAdsClient({
      accessToken: "access-token",
      advertiserId: "987654321",
      fetch: fetchMock,
    });

    await expect(
      client.listCampaigns({
        campaignIds: ["campaign-123"],
        page: 1,
        pageSize: 100,
      })
    ).resolves.toStrictEqual({
      campaigns: [
        {
          advertiser_id: "987654321",
          campaign_id: "campaign-123",
          campaign_name: "Traffic Campaign",
        },
      ],
      pageInfo: {
        page: 1,
        page_size: 100,
        total_number: 1,
        total_page: 1,
      },
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://business-api.tiktok.com/open_api/v1.3/campaign/get/?advertiser_id=987654321&fields=%5B%22advertiser_id%22%2C%22campaign_id%22%2C%22campaign_name%22%5D&filtering=%7B%22campaign_ids%22%3A%5B%22campaign-123%22%5D%7D&page=1&page_size=100"
    );
    expect(init).toStrictEqual({
      headers: { "Access-Token": "access-token" },
      method: "GET",
    });
  });
});
