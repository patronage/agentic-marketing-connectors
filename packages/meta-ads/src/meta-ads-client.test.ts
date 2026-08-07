/* oxlint-disable vitest/require-mock-type-parameters -- Legacy workflow mocks are inferred from their fetch fixtures. */

import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  buildBoostPostPlan,
  createMetaAdsClient,
  extractAdPreviewUrl,
} from "./index.js";
import type {
  MetaAdCreativeAssetFeedSpec,
  MetaAdsActionAttributionWindow,
  MetaAdsApiError,
} from "./index.js";

describe(createMetaAdsClient, () => {
  it("matches Meta v25 action attribution windows exactly", () => {
    expectTypeOf<MetaAdsActionAttributionWindow>().toEqualTypeOf<
      | "1d_view"
      | "7d_view"
      | "28d_view"
      | "1d_click"
      | "7d_click"
      | "28d_click"
      | "1d_ev"
      | "dda"
      | "default"
      | "7d_view_first_conversion"
      | "28d_view_first_conversion"
      | "7d_view_all_conversions"
      | "28d_view_all_conversions"
      | "skan_view"
      | "skan_click"
      | "skan_click_second_postback"
      | "skan_view_second_postback"
      | "skan_click_third_postback"
      | "skan_view_third_postback"
    >();
  });

  it("fetches ad set insights with time range and campaign filters", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
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
    expect(requestUrl.pathname).toBe("/v25.0/act_123/insights");
    expect(requestUrl.searchParams.get("access_token")).toBe("token");
    expect(requestUrl.searchParams.get("level")).toBe("adset");
    expect(requestUrl.searchParams.get("fields")).toContain(
      "video_thruplay_watched_actions"
    );
    expect(
      JSON.parse(requestUrl.searchParams.get("time_range") ?? "{}")
    ).toStrictEqual({
      since: "2026-03-31",
      until: "2026-04-01",
    });
    expect(requestUrl.searchParams.get("filtering")).toContain("campaign-1");
  });

  it("fetches segmented insights with breakdown presets", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: [
          {
            ad_id: "ad-1",
            age: "25-34",
            gender: "female",
            impressions: "100",
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
      client.getInsights({
        breakdownPreset: "age-gender",
        level: "ad",
        since: "2026-03-31",
        until: "2026-04-01",
      })
    ).resolves.toStrictEqual([
      { ad_id: "ad-1", age: "25-34", gender: "female", impressions: "100" },
    ]);

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v25.0/act_123/insights");
    expect(requestUrl.searchParams.get("breakdowns")).toBe("age,gender");
    expect(requestUrl.searchParams.has("action_breakdowns")).toBeFalsy();
  });

  it("fetches action-segmented insights with action breakdown presets", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: [
          {
            actions: [{ action_type: "link_click", value: "10" }],
            ad_id: "ad-1",
          },
        ],
      })
    );
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await client.getInsights({
      breakdownPreset: "action",
      level: "ad",
      since: "2026-03-31",
      until: "2026-04-01",
    });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.searchParams.get("action_breakdowns")).toBe(
      "action_type"
    );
    expect(requestUrl.searchParams.has("breakdowns")).toBeFalsy();
  });

  it("fetches device insights with action attribution windows", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: [
          {
            ad_id: "ad-1",
            device_platform: "mobile_app",
            impressions: "100",
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
      client.getInsights({
        actionAttributionWindows: ["1d_view", "7d_click"],
        breakdownPreset: "device",
        level: "ad",
        since: "2026-03-31",
        until: "2026-04-01",
      })
    ).resolves.toStrictEqual([
      {
        ad_id: "ad-1",
        device_platform: "mobile_app",
        impressions: "100",
      },
    ]);

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.searchParams.get("breakdowns")).toBe("device_platform");
    expect(
      JSON.parse(
        requestUrl.searchParams.get("action_attribution_windows") ?? "[]"
      )
    ).toStrictEqual(["1d_view", "7d_click"]);
  });

  it("applies breakdown presets to async insights jobs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ report_run_id: "report-1" }));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await client.createAsyncInsightsJob({
      breakdownPreset: "placement",
      level: "ad",
      since: "2026-03-31",
      until: "2026-04-01",
    });

    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get("breakdowns")).toBe("publisher_platform,platform_position");
    expect(body.get("async")).toBe("true");
  });

  it("rejects mixing raw breakdowns with breakdown presets", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: [] }));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.getInsights({
        breakdown: "publisher_platform",
        breakdownPreset: "platform",
        level: "ad",
        since: "2026-03-31",
        until: "2026-04-01",
      })
    ).rejects.toThrow(
      "Insights accepts breakdown or breakdownPreset, not both."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates async insights jobs with existing insight filters", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ report_run_id: "report-1" }));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.createAsyncInsightsJob({
        breakdown: "publisher_platform",
        campaignId: "campaign-1",
        level: "ad",
        limit: 2500,
        since: "2026-03-31",
        until: "2026-04-01",
      })
    ).resolves.toStrictEqual({ report_run_id: "report-1" });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v25.0/act_123/insights");
    expect(requestUrl.searchParams.get("access_token")).toBe("token");
    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get("async")).toBe("true");
    expect(body.get("level")).toBe("ad");
    expect(body.get("limit")).toBe("2500");
    expect(body.get("fields")).toContain("quality_ranking");
    expect(body.get("breakdowns")).toBe("publisher_platform");
    expect(JSON.parse(body.get("time_range") ?? "{}")).toStrictEqual({
      since: "2026-03-31",
      until: "2026-04-01",
    });
    expect(body.get("filtering")).toContain("campaign-1");
  });

  it("polls async insights job status with per-request proof", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        async_percent_completion: 80,
        async_status: "Job Running",
        id: "report-1",
      })
    );
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.getAsyncInsightsJob({
        accessToken: "job-token",
        appSecretProof: "job-proof",
        reportRunId: "report-1",
      })
    ).resolves.toStrictEqual({
      async_percent_completion: 80,
      async_status: "Job Running",
      id: "report-1",
    });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v25.0/report-1");
    expect(requestUrl.searchParams.get("access_token")).toBe("job-token");
    expect(requestUrl.searchParams.get("appsecret_proof")).toBe("job-proof");
    expect(requestUrl.searchParams.get("fields")).toContain("async_status");
    expect(requestUrl.searchParams.get("fields")).toContain("error_user_msg");
  });

  it("fetches async insights job results from the report insights edge", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              ad_id: "ad-1",
              impressions: "100",
              spend: "12.34",
            },
            {
              ad_id: "ad-2",
              impressions: "200",
              spend: "23.45",
            },
            {
              ad_id: "ad-3",
              impressions: "300",
              spend: "34.56",
            },
          ],
          paging: {
            next: "https://graph.facebook.com/v25.0/report-1/insights?limit=3&after=abc",
          },
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              ad_id: "ad-4",
              impressions: "400",
              spend: "45.67",
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
      client.getAsyncInsightsJobResults({
        accessToken: "job-token",
        appSecretProof: "job-proof",
        fields: "ad_id,impressions,spend",
        limit: 3,
        reportRunId: "report-1",
      })
    ).resolves.toStrictEqual([
      { ad_id: "ad-1", impressions: "100", spend: "12.34" },
      { ad_id: "ad-2", impressions: "200", spend: "23.45" },
      { ad_id: "ad-3", impressions: "300", spend: "34.56" },
      { ad_id: "ad-4", impressions: "400", spend: "45.67" },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v25.0/report-1/insights");
    expect(requestUrl.searchParams.get("access_token")).toBe("job-token");
    expect(requestUrl.searchParams.get("appsecret_proof")).toBe("job-proof");
    expect(requestUrl.searchParams.get("fields")).toBe(
      "ad_id,impressions,spend"
    );
    expect(requestUrl.searchParams.get("limit")).toBe("3");
    const nextUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(nextUrl.searchParams.get("after")).toBe("abc");
    expect(nextUrl.searchParams.get("access_token")).toBe("job-token");
    expect(nextUrl.searchParams.get("appsecret_proof")).toBe("job-proof");
  });

  it("reads validated ad account metadata with fixed fields", async () => {
    const account = {
      account_id: "123",
      account_status: 1,
      amount_spent: "12345",
      balance: "234",
      currency: "USD",
      funding_source: "payment-1",
      id: "act_123",
      name: "Patronage",
      spend_cap: "50000",
      timezone_id: 1,
      timezone_name: "America/Los_Angeles",
      timezone_offset_hours_utc: -7,
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(account));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.getAdAccount({
        accessToken: "account-token",
        appSecretProof: "account-proof",
      })
    ).resolves.toStrictEqual(account);

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v25.0/act_123");
    expect(requestUrl.searchParams.get("access_token")).toBe("account-token");
    expect(requestUrl.searchParams.get("appsecret_proof")).toBe(
      "account-proof"
    );
    expect(requestUrl.searchParams.get("fields")).toBe(
      "id,account_id,name,account_status,currency,timezone_id,timezone_name,timezone_offset_hours_utc,spend_cap,amount_spent,balance,funding_source"
    );
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("GET");
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeUndefined();
  });

  it("lists ad account activities with audit filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: [
          {
            actor_name: "Ops User",
            event_time: "2026-05-01T12:00:00+0000",
            event_type: "update_ad_run_status",
            object_id: "ad-1",
            object_type: "AD",
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
      client.listAdAccountActivities({
        accessToken: "audit-token",
        appSecretProof: "audit-proof",
        businessId: "business-1",
        category: "AD",
        fields: "event_time,event_type,object_id,actor_name",
        pageSize: 50,
        since: "2026-05-01",
        until: "2026-05-02",
      })
    ).resolves.toStrictEqual([
      {
        actor_name: "Ops User",
        event_time: "2026-05-01T12:00:00+0000",
        event_type: "update_ad_run_status",
        object_id: "ad-1",
        object_type: "AD",
      },
    ]);

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v25.0/act_123/activities");
    expect(requestUrl.searchParams.get("access_token")).toBe("audit-token");
    expect(requestUrl.searchParams.get("appsecret_proof")).toBe("audit-proof");
    expect(requestUrl.searchParams.get("business_id")).toBe("business-1");
    expect(requestUrl.searchParams.get("category")).toBe("AD");
    expect(requestUrl.searchParams.get("fields")).toBe(
      "event_time,event_type,object_id,actor_name"
    );
    expect(requestUrl.searchParams.get("limit")).toBe("50");
    expect(requestUrl.searchParams.get("since")).toBe("2026-05-01");
    expect(requestUrl.searchParams.get("until")).toBe("2026-05-02");
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeUndefined();
  });

  it("follows paginated ad account activities while preserving proof", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: [
            { event_type: "create_campaign", object_id: "campaign-1" },
            { event_type: "update_ad_set_budget", object_id: "adset-1" },
          ],
          paging: {
            next: "https://graph.facebook.com/v25.0/act_123/activities?limit=2&after=abc",
          },
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [{ event_type: "update_ad_run_status", object_id: "ad-1" }],
        })
      );
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      appSecretProof: "token-proof",
      fetch: fetchMock,
    });

    await expect(
      client.listAdAccountActivities({ pageSize: 2 })
    ).resolves.toStrictEqual([
      { event_type: "create_campaign", object_id: "campaign-1" },
      { event_type: "update_ad_set_budget", object_id: "adset-1" },
      { event_type: "update_ad_run_status", object_id: "ad-1" },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(firstUrl.searchParams.get("limit")).toBe("2");
    expect(firstUrl.searchParams.get("fields")).toBe(
      [
        "actor_id",
        "actor_name",
        "application_id",
        "application_name",
        "date_time_in_timezone",
        "event_time",
        "event_type",
        "translated_event_type",
        "object_id",
        "object_name",
        "object_type",
        "extra_data",
      ].join(",")
    );
    const nextUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(nextUrl.searchParams.get("after")).toBe("abc");
    expect(nextUrl.searchParams.get("access_token")).toBe("token");
    expect(nextUrl.searchParams.get("appsecret_proof")).toBe("token-proof");
  });

  it("caps ad account activity results separately from page size", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: [
            { event_type: "create_campaign", object_id: "campaign-1" },
            { event_type: "update_ad_set_budget", object_id: "adset-1" },
          ],
          paging: {
            next: "https://graph.facebook.com/v25.0/act_123/activities?limit=2&after=abc",
          },
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [{ event_type: "update_ad_run_status", object_id: "ad-1" }],
        })
      );
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.listAdAccountActivities({ maxResults: 2, pageSize: 2 })
    ).resolves.toStrictEqual([
      { event_type: "create_campaign", object_id: "campaign-1" },
      { event_type: "update_ad_set_budget", object_id: "adset-1" },
    ]);

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("creates automated rules with delivery rule specs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ id: "rule-1" }));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    const evaluationSpec = {
      evaluation_type: "SCHEDULE",
      filters: [
        {
          field: "spend",
          operator: "GREATER_THAN",
          value: 5000,
        },
      ],
    };
    const executionSpec = {
      execution_type: "PAUSE",
      execution_options: [{ field: "entity_status", value: "PAUSED" }],
    };
    const scheduleSpec = {
      schedule_type: "SEMI_HOURLY",
    };

    await expect(
      client.createAutomatedRule({
        accessToken: "rules-token",
        appSecretProof: "rules-proof",
        evaluationSpec,
        executionSpec,
        name: "Pause high spend ads",
        scheduleSpec,
        status: "ENABLED",
      })
    ).resolves.toStrictEqual({ id: "rule-1" });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v25.0/act_123/adrules_library");
    expect(requestUrl.searchParams.get("access_token")).toBe("rules-token");
    expect(requestUrl.searchParams.get("appsecret_proof")).toBe("rules-proof");
    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get("name")).toBe("Pause high spend ads");
    expect(JSON.parse(body.get("evaluation_spec") ?? "{}")).toStrictEqual(
      evaluationSpec
    );
    expect(JSON.parse(body.get("execution_spec") ?? "{}")).toStrictEqual(
      executionSpec
    );
    expect(JSON.parse(body.get("schedule_spec") ?? "{}")).toStrictEqual(
      scheduleSpec
    );
    expect(body.get("status")).toBe("ENABLED");
  });

  it("lists automated rules with exact default fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: [
          {
            disable_error_code: 1_870_034,
            id: "rule-1",
            name: "Pause high spend ads",
            status: "HAS_ISSUES",
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
      client.listAutomatedRules({ pageSize: 25 })
    ).resolves.toStrictEqual([
      {
        disable_error_code: 1_870_034,
        id: "rule-1",
        name: "Pause high spend ads",
        status: "HAS_ISSUES",
      },
    ]);

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v25.0/act_123/adrules_library");
    expect(requestUrl.searchParams.get("fields")).toBe(
      [
        "id",
        "name",
        "account_id",
        "status",
        "disable_error_code",
        "created_by",
        "created_time",
        "updated_time",
        "evaluation_spec",
        "execution_spec",
        "schedule_spec",
      ].join(",")
    );
    expect(requestUrl.searchParams.get("limit")).toBe("25");
  });

  it("lists automated rules with custom fields and local result caps", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: [
            { id: "rule-1", name: "One" },
            { id: "rule-2", name: "Two" },
          ],
          paging: {
            next: "https://graph.facebook.com/v25.0/act_123/adrules_library?limit=2&after=abc",
          },
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [{ id: "rule-3", name: "Three" }],
        })
      );
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      appSecretProof: "token-proof",
      fetch: fetchMock,
    });

    await expect(
      client.listAutomatedRules({
        fields: "id,name",
        maxResults: 2,
        pageSize: 2,
      })
    ).resolves.toStrictEqual([
      { id: "rule-1", name: "One" },
      { id: "rule-2", name: "Two" },
    ]);

    expect(fetchMock).toHaveBeenCalledOnce();
    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.searchParams.get("fields")).toBe("id,name");
    expect(requestUrl.searchParams.get("appsecret_proof")).toBe("token-proof");
  });

  it("updates automated rules with only changed fields", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ success: true }));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.updateAutomatedRule({
        executionSpec: {
          execution_type: "NOTIFICATION",
        },
        ruleId: "rule-1",
        status: "DISABLED",
      })
    ).resolves.toStrictEqual({ success: true });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v25.0/rule-1");
    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect([...body.entries()]).toStrictEqual([
      ["execution_spec", JSON.stringify({ execution_type: "NOTIFICATION" })],
      ["status", "DISABLED"],
    ]);
  });

  it("rejects empty automated rule updates", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ success: true }));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.updateAutomatedRule({ ruleId: "rule-1" })
    ).rejects.toThrow(
      "Automated rule update requires at least one field to update."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deletes automated rules by rule id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ success: true }));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.deleteAutomatedRule({
        accessToken: "rules-token",
        appSecretProof: "rules-proof",
        ruleId: "rule-1",
      })
    ).resolves.toStrictEqual({ success: true });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v25.0/rule-1");
    expect(requestUrl.searchParams.get("access_token")).toBe("rules-token");
    expect(requestUrl.searchParams.get("appsecret_proof")).toBe("rules-proof");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("DELETE");
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeUndefined();
  });

  it("creates ad labels on the configured ad account", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ id: "label-1" }));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.createAdLabel({
        accessToken: "label-token",
        appSecretProof: "label-proof",
        name: "taxonomy:issue:climate",
      })
    ).resolves.toStrictEqual({ id: "label-1", name: "taxonomy:issue:climate" });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v25.0/act_123/adlabels");
    expect(requestUrl.searchParams.get("access_token")).toBe("label-token");
    expect(requestUrl.searchParams.get("appsecret_proof")).toBe("label-proof");
    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect([...body.entries()]).toStrictEqual([
      ["name", "taxonomy:issue:climate"],
    ]);
  });

  it("lists ad labels with exact default fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: [
          { id: "label-1", name: "taxonomy:issue:climate" },
          { id: "label-2", name: "taxonomy:funnel:prospecting" },
        ],
      })
    );
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(client.listAdLabels({ pageSize: 25 })).resolves.toStrictEqual([
      { id: "label-1", name: "taxonomy:issue:climate" },
      { id: "label-2", name: "taxonomy:funnel:prospecting" },
    ]);

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v25.0/act_123/adlabels");
    expect(requestUrl.searchParams.get("fields")).toBe("id,name");
    expect(requestUrl.searchParams.get("limit")).toBe("25");
  });

  it("syncs ad labels by reusing existing labels and creating missing labels", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: [{ id: "label-1", name: "taxonomy:issue:climate" }],
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          id: "label-2",
          name: "taxonomy:funnel:prospecting",
        })
      );
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.syncAdLabels({
        accessToken: "label-token",
        appSecretProof: "label-proof",
        names: [
          "taxonomy:issue:climate",
          "taxonomy:funnel:prospecting",
          "taxonomy:issue:climate",
        ],
      })
    ).resolves.toStrictEqual({
      created: [{ id: "label-2", name: "taxonomy:funnel:prospecting" }],
      existing: [{ id: "label-1", name: "taxonomy:issue:climate" }],
      labels: [
        { id: "label-1", name: "taxonomy:issue:climate" },
        { id: "label-2", name: "taxonomy:funnel:prospecting" },
      ],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const listUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(listUrl.pathname).toBe("/v25.0/act_123/adlabels");
    expect(listUrl.searchParams.get("access_token")).toBe("label-token");
    expect(listUrl.searchParams.get("appsecret_proof")).toBe("label-proof");
    const createUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(createUrl.pathname).toBe("/v25.0/act_123/adlabels");
    const createBody = fetchMock.mock.calls[1]?.[1]?.body as URLSearchParams;
    expect(createBody.get("name")).toBe("taxonomy:funnel:prospecting");
  });

  it("forces name into ad label sync list fields for name matching", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: [{ id: "label-1", name: "taxonomy:issue:climate" }],
      })
    );
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.syncAdLabels({
        fields: "id",
        names: ["taxonomy:issue:climate"],
      })
    ).resolves.toStrictEqual({
      created: [],
      existing: [{ id: "label-1", name: "taxonomy:issue:climate" }],
      labels: [{ id: "label-1", name: "taxonomy:issue:climate" }],
    });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.searchParams.get("fields")).toBe("id,name");
  });

  it("recovers ad label sync when create races an existing label", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: [] }))
      .mockResolvedValueOnce(
        Response.json({
          error: {
            code: 100,
            message: "A label with the same name already exists.",
            type: "OAuthException",
          },
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [{ id: "label-1", name: "taxonomy:issue:climate" }],
        })
      );
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.syncAdLabels({ names: ["taxonomy:issue:climate"] })
    ).resolves.toStrictEqual({
      created: [{ id: "label-1", name: "taxonomy:issue:climate" }],
      existing: [],
      labels: [{ id: "label-1", name: "taxonomy:issue:climate" }],
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const createUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(createUrl.pathname).toBe("/v25.0/act_123/adlabels");
    const recoveryUrl = new URL(String(fetchMock.mock.calls[2]?.[0]));
    expect(recoveryUrl.pathname).toBe("/v25.0/act_123/adlabels");
    expect(recoveryUrl.searchParams.get("fields")).toBe("id,name");
  });

  it("applies ad labels to campaign, ad set, and ad objects", async () => {
    // oxlint-disable-next-line vitest/prefer-mock-return-shorthand, vitest/prefer-mock-promise-shorthand -- each request needs a fresh Response body.
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => Response.json({ success: true }));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.applyAdLabels({
        accessToken: "label-token",
        appSecretProof: "label-proof",
        labelIds: ["label-1", "label-2"],
        objectIds: ["campaign-1", "adset-1", "ad-1"],
      })
    ).resolves.toStrictEqual([
      { objectId: "campaign-1", success: true },
      { objectId: "adset-1", success: true },
      { objectId: "ad-1", success: true },
    ]);

    expect(
      fetchMock.mock.calls.map((call) => new URL(String(call[0])).pathname)
    ).toStrictEqual([
      "/v25.0/campaign-1/adlabels",
      "/v25.0/adset-1/adlabels",
      "/v25.0/ad-1/adlabels",
    ]);
    for (const call of fetchMock.mock.calls) {
      const requestUrl = new URL(String(call[0]));
      expect(requestUrl.searchParams.get("access_token")).toBe("label-token");
      expect(requestUrl.searchParams.get("appsecret_proof")).toBe(
        "label-proof"
      );
      const body = call[1]?.body as URLSearchParams;
      expect(JSON.parse(body.get("adlabels") ?? "[]")).toStrictEqual([
        { id: "label-1" },
        { id: "label-2" },
      ]);
    }
  });

  it("rejects invalid ad label mutations before requests", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ success: true }));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(client.createAdLabel({ name: " " })).rejects.toThrow(
      "Ad label name is required."
    );
    await expect(client.syncAdLabels({ names: [] })).rejects.toThrow(
      "Ad label names must include at least one value."
    );
    await expect(
      client.applyAdLabels({ labelIds: ["label-1"], objectIds: [] })
    ).rejects.toThrow("Ad label objectIds must include at least one value.");
    await expect(
      client.applyAdLabels({ labelIds: [" "], objectIds: ["ad-1"] })
    ).rejects.toThrow("Ad label labelIds cannot include blank values.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("searches the Ad Library with public reporting fields", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
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
    expect(requestUrl.pathname).toBe("/v25.0/ads_archive");
    expect(requestUrl.searchParams.get("ad_active_status")).toBe("ACTIVE");
    expect(requestUrl.searchParams.get("publisher_platform")).toBe("FACEBOOK");
    expect(requestUrl.searchParams.get("search_page_ids")).toBe("page-1");
    expect(requestUrl.searchParams.get("fields")).toContain("ad_snapshot_url");
  });

  it("finds campaigns by name", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
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
      client.findCampaignByName({ name: "Spring Boosting" })
    ).resolves.toStrictEqual({ id: "campaign-1", name: "Spring Boosting" });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v25.0/act_123/campaigns");
    expect(requestUrl.searchParams.get("filtering")).toContain("Spring");
  });

  it("rejects duplicate exact reconciliation matches across pages", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          data: [{ id: "campaign-1", name: "Exact" }],
          paging: { next: "https://graph.facebook.com/v25.0/next-page" },
        })
      )
      .mockResolvedValueOnce(
        Response.json({ data: [{ id: "campaign-2", name: "Exact" }] })
      );
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(client.findCampaignByName({ name: "Exact" })).rejects.toThrow(
      "multiple resources"
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("finds named boost resources on their provider-owned edges", async () => {
    const responseBody = {
      data: [
        { id: "wrong", name: "Other" },
        { id: "found", name: "Expected" },
      ],
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(responseBody))
      .mockResolvedValueOnce(Response.json(responseBody))
      .mockResolvedValueOnce(Response.json(responseBody));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.findAdSetByName({ campaignId: "campaign-1", name: "Expected" })
    ).resolves.toMatchObject({ id: "found" });
    await expect(
      client.findAdCreativeByName({ name: "Expected" })
    ).resolves.toMatchObject({ id: "found" });
    await expect(
      client.findAdByName({ adSetId: "adset-1", name: "Expected" })
    ).resolves.toMatchObject({ id: "found" });

    expect(
      fetchMock.mock.calls.map((call) => new URL(String(call[0])).pathname)
    ).toStrictEqual([
      "/v25.0/campaign-1/adsets",
      "/v25.0/act_123/adcreatives",
      "/v25.0/adset-1/ads",
    ]);
  });

  it("declares empty special ad categories when creating campaigns", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: "1" }));
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

  it("creates dynamic ad creatives from story and asset feed specs", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { id: "creative-1" },
          { headers: { "x-fb-trace-id": "creative-trace" } }
        )
      );
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });
    const assetFeedSpec: MetaAdCreativeAssetFeedSpec = {
      ad_formats: ["SINGLE_IMAGE"],
      bodies: [{ text: "Begin your adventure" }],
      call_to_action_types: ["SHOP_NOW"],
      images: [{ hash: "image-hash" }],
      link_urls: [{ website_url: "https://example.com/" }],
      titles: [{ text: "Level up" }],
    };
    const objectStorySpec = { page_id: "page-1" };

    await expect(
      client.createAdCreative({
        assetFeedSpec,
        name: "Dynamic creative",
        objectStorySpec,
      })
    ).resolves.toStrictEqual({
      id: "creative-1",
      providerRequestId: "creative-trace",
    });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v25.0/act_123/adcreatives");
    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(JSON.parse(body.get("object_story_spec") ?? "{}")).toStrictEqual(
      objectStorySpec
    );
    expect(JSON.parse(body.get("asset_feed_spec") ?? "{}")).toStrictEqual(
      assetFeedSpec
    );
  });

  it("surfaces ambiguous dynamic creative writes without retrying", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("connection closed after send"));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.createAdCreative({
        assetFeedSpec: {
          ad_formats: ["SINGLE_IMAGE"],
          bodies: [{ text: "Body" }],
          images: [{ hash: "image-hash" }],
          link_urls: [{ website_url: "https://example.com/" }],
          titles: [{ text: "Title" }],
        },
        name: "Ambiguous dynamic creative",
        objectStorySpec: { page_id: "page-1" },
      })
    ).rejects.toMatchObject({
      method: "POST",
      name: "MetaAdsAmbiguousWriteError",
      path: "/v25.0/act_123/adcreatives",
      provider: "meta",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("preserves provider request evidence on mutation results", async () => {
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json(
            { id: "campaign-1" },
            { headers: { "x-fb-trace-id": "trace-success" } }
          )
        ),
    });

    await expect(
      client.createCampaign({
        name: "Evidence",
        objective: "OUTCOME_AWARENESS",
      })
    ).resolves.toStrictEqual({
      id: "campaign-1",
      providerRequestId: "trace-success",
    });
  });

  it("uses stop_time for campaign creation end schedules", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: "1" }));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await client.createCampaign({
      endTime: "2026-06-30T00:00:00+0000",
      name: "Awareness",
      objective: "OUTCOME_AWARENESS",
      startTime: "2026-06-01T00:00:00+0000",
    });

    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get("start_time")).toBe("2026-06-01T00:00:00+0000");
    expect(body.get("stop_time")).toBe("2026-06-30T00:00:00+0000");
    expect(body.has("end_time")).toBeFalsy();
  });

  it("does not reuse default appsecret proof for overridden tokens", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ data: [] }));
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
    expect(requestUrl.searchParams.has("appsecret_proof")).toBeFalsy();
  });

  it("uses per-request appsecret proof for overridden tokens", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ data: [] }));
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
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
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
      .fn<typeof fetch>()
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
    ).resolves.toStrictEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([429, 503])(
    "surfaces HTTP %i writes as ambiguous without retrying",
    async (status) => {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(
          {
            error: {
              code: 4,
              fbtrace_id: "meta-trace-1",
              message: "Rate limit",
              type: "OAuthException",
            },
          },
          { status }
        )
      );
      const client = createMetaAdsClient({
        accessToken: "token",
        adAccountId: "act_123",
        fetch: fetchMock,
      });

      await expect(
        client.createCampaign({
          name: "Safety test",
          objective: "OUTCOME_TRAFFIC",
          specialAdCategories: [],
          status: "PAUSED",
        })
      ).rejects.toMatchObject({
        method: "POST",
        name: "MetaAdsAmbiguousWriteError",
        path: "/v25.0/act_123/campaigns",
        provider: "meta",
        providerRequestId: "meta-trace-1",
        status,
      });
      expect(fetchMock).toHaveBeenCalledOnce();
    }
  );

  it("surfaces transport failures after a write as ambiguous", async () => {
    const transportError = new TypeError("connection closed after send");
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(transportError);
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.createCampaign({
        name: "Safety test",
        objective: "OUTCOME_TRAFFIC",
        specialAdCategories: [],
        status: "PAUSED",
      })
    ).rejects.toMatchObject({
      cause: transportError,
      method: "POST",
      name: "MetaAdsAmbiguousWriteError",
      path: "/v25.0/act_123/campaigns",
      provider: "meta",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
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
    expect(plan.adSet.promotedObject).toStrictEqual({ page_id: "page-1" });
    expect(plan.adCreative).toMatchObject({
      authorizationCategory: "POLITICAL",
      objectStoryId: "page-1_post-1",
    });
  });

  it("updates campaign budget, schedule, and delivery status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ success: true }));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.updateCampaign({
        campaignId: "campaign-1",
        dailyBudget: 25.5,
        endTime: "2026-06-30T00:00:00+0000",
        startTime: "2026-06-01T00:00:00+0000",
        status: "ACTIVE",
      })
    ).resolves.toStrictEqual({ success: true });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v25.0/campaign-1");
    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get("daily_budget")).toBe("2550");
    expect(body.get("start_time")).toBe("2026-06-01T00:00:00+0000");
    expect(body.get("stop_time")).toBe("2026-06-30T00:00:00+0000");
    expect(body.has("end_time")).toBeFalsy();
    expect(body.get("status")).toBe("ACTIVE");
    expect(body.has("lifetime_budget")).toBeFalsy();
  });

  it("updates ad set lifetime budget and schedule", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ success: true }));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await client.updateAdSet({
      adSetId: "adset-1",
      endTime: "2026-06-15T00:00:00+0000",
      lifetimeBudget: 100,
      startTime: "2026-06-01T00:00:00+0000",
      status: "PAUSED",
    });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v25.0/adset-1");
    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get("lifetime_budget")).toBe("10000");
    expect(body.get("start_time")).toBe("2026-06-01T00:00:00+0000");
    expect(body.get("end_time")).toBe("2026-06-15T00:00:00+0000");
    expect(body.get("status")).toBe("PAUSED");
    expect(body.has("daily_budget")).toBeFalsy();
  });

  it("updates ad delivery status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ success: true }));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await client.updateAd({ adId: "ad-1", status: "ARCHIVED" });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v25.0/ad-1");
    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect([...body.entries()]).toStrictEqual([["status", "ARCHIVED"]]);
  });

  it("rejects campaign and ad set updates with both budget types", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ success: true }));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.updateCampaign({
        campaignId: "campaign-1",
        dailyBudget: 25,
        lifetimeBudget: 100,
      })
    ).rejects.toThrow(
      "Campaign update accepts dailyBudget or lifetimeBudget, not both."
    );
    await expect(
      client.updateAdSet({
        adSetId: "adset-1",
        dailyBudget: 25,
        lifetimeBudget: 100,
      })
    ).rejects.toThrow(
      "Ad set update accepts dailyBudget or lifetimeBudget, not both."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects empty campaign, ad set, and ad updates", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ success: true }));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.updateCampaign({ campaignId: "campaign-1" })
    ).rejects.toThrow("Campaign update requires at least one field to update.");
    await expect(client.updateAdSet({ adSetId: "adset-1" })).rejects.toThrow(
      "Ad set update requires at least one field to update."
    );
    await expect(
      client.updateAd({
        adId: "123_1",
        status: undefined as never,
      })
    ).rejects.toThrow("Ad update requires at least one field to update.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches ad preview bodies for existing ads", async () => {
    const previewBody =
      '<iframe src="https://www.facebook.com/ads/api/preview_iframe.php?d=A&amp;t=B"></iframe>';
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: [{ body: previewBody }],
      })
    );
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.getAdPreviews({
        adFormat: "DESKTOP_FEED_STANDARD",
        adId: "123_1",
        dynamicCreativeSpec: { page_id: "page-1" },
        height: 900,
        locale: "en_US",
        width: 600,
      })
    ).resolves.toStrictEqual([{ body: previewBody }]);

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v25.0/123_1/previews");
    expect(requestUrl.searchParams.get("ad_format")).toBe(
      "DESKTOP_FEED_STANDARD"
    );
    expect(requestUrl.searchParams.get("fields")).toBe("body");
    expect(requestUrl.searchParams.get("height")).toBe("900");
    expect(requestUrl.searchParams.get("locale")).toBe("en_US");
    expect(requestUrl.searchParams.get("width")).toBe("600");
    expect(
      JSON.parse(requestUrl.searchParams.get("dynamic_creative_spec") ?? "{}")
    ).toStrictEqual({ page_id: "page-1" });
    expect(extractAdPreviewUrl({ body: previewBody })).toBe(
      "https://www.facebook.com/ads/api/preview_iframe.php?d=A&t=B"
    );
  });

  it("generates creative preview bodies for QA before ad creation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        data: [
          {
            body: '<iframe src="https://www.facebook.com/preview"></iframe>',
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
      client.generateAdCreativePreviews({
        adFormat: "INSTAGRAM_STANDARD",
        creative: {
          object_story_spec: {
            page_id: "page-1",
          },
        },
        fields: "body",
      })
    ).resolves.toStrictEqual([
      { body: '<iframe src="https://www.facebook.com/preview"></iframe>' },
    ]);

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v25.0/act_123/generatepreviews");
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBeUndefined();
    expect(requestUrl.searchParams.get("ad_format")).toBe("INSTAGRAM_STANDARD");
    expect(requestUrl.searchParams.get("fields")).toBe("body");
    expect(
      JSON.parse(requestUrl.searchParams.get("creative") ?? "{}")
    ).toStrictEqual({
      object_story_spec: {
        page_id: "page-1",
      },
    });
  });

  it("extracts preview URLs from quoted iframe bodies", () => {
    expect(
      extractAdPreviewUrl(
        "<iframe src='https://www.facebook.com/preview?x=1&amp;y=2'></iframe>"
      )
    ).toBe("https://www.facebook.com/preview?x=1&y=2");
    expect(extractAdPreviewUrl({})).toBeUndefined();
  });

  it("extracts only safe iframe preview URLs", () => {
    expect(
      extractAdPreviewUrl(
        '<img src="https://www.facebook.com/image.jpg"><iframe src="https://www.facebook.com/preview"></iframe>'
      )
    ).toBe("https://www.facebook.com/preview");
    expect(
      extractAdPreviewUrl('<iframe src="javascript:alert(1)"></iframe>')
    ).toBeUndefined();
    expect(
      extractAdPreviewUrl('<iframe src="data:text/html;base64,PHNj"></iframe>')
    ).toBeUndefined();
    expect(
      extractAdPreviewUrl('<img src="https://www.facebook.com/image.jpg">')
    ).toBeUndefined();
  });

  it("uploads ad images from remote URLs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        images: {
          "hero.jpg": {
            hash: "image-hash",
            url: "https://example.com/hero-cdn.jpg",
          },
        },
      })
    );
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.uploadAdImage({
        accessToken: "asset-token",
        appSecretProof: "asset-proof",
        filename: "hero.jpg",
        sourceUrl: "https://example.com/hero.jpg",
      })
    ).resolves.toStrictEqual({
      images: {
        "hero.jpg": {
          hash: "image-hash",
          url: "https://example.com/hero-cdn.jpg",
        },
      },
    });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v25.0/act_123/adimages");
    expect(requestUrl.searchParams.get("access_token")).toBe("asset-token");
    expect(requestUrl.searchParams.get("appsecret_proof")).toBe("asset-proof");
    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get("filename")).toBe("hero.jpg");
    expect(body.get("url")).toBe("https://example.com/hero.jpg");
  });

  it("uploads ad images from ArrayBuffer bytes as base64 form data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        images: { "hero.jpg": { hash: "image-hash" } },
      })
    );
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await client.uploadAdImage({
      bytes: new TextEncoder().encode("image-bytes").buffer,
      filename: "hero.jpg",
    });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v25.0/act_123/adimages");
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.headers).toStrictEqual({
      "content-type": "application/x-www-form-urlencoded",
    });
    const body = init?.body as URLSearchParams;
    expect(body.get("filename")).toBe("hero.jpg");
    expect(body.get("bytes")).toBe("aW1hZ2UtYnl0ZXM=");
  });

  it("throws structured Graph API errors for media uploads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        error: {
          code: 100,
          error_user_msg: "Invalid image URL",
          fbtrace_id: "trace-1",
          message: "Unsupported image URL",
          type: "GraphMethodException",
        },
      })
    );
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.uploadAdImage({ sourceUrl: "https://example.com/not-image" })
    ).rejects.toMatchObject({
      code: 100,
      fbtraceId: "trace-1",
      message: "Unsupported image URL",
      name: "MetaAdsApiError",
      type: "GraphMethodException",
      userMessage: "Invalid image URL",
    } satisfies Partial<MetaAdsApiError>);
  });

  it("uploads ad videos from remote file URLs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ id: "video-1" }));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.uploadAdVideo({
        description: "Launch cut",
        fileUrl: "https://example.com/launch.mp4",
        title: "Launch Video",
      })
    ).resolves.toStrictEqual({ id: "video-1" });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v25.0/act_123/advideos");
    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get("file_url")).toBe("https://example.com/launch.mp4");
    expect(body.get("title")).toBe("Launch Video");
    expect(body.get("description")).toBe("Launch cut");
  });

  it("uploads ad videos from bytes with title metadata", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ id: "video-1" }));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await client.uploadAdVideo({
      bytes: new Blob(["video-bytes"], { type: "video/mp4" }),
      filename: "launch.mp4",
      title: "Launch Video",
    });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v25.0/act_123/advideos");
    const body = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    const upload = body.get("source") as Blob & { name?: string };
    expect(upload).toBeInstanceOf(Blob);
    expect(upload.name).toBe("launch.mp4");
    await expect(upload.text()).resolves.toBe("video-bytes");
    expect(body.get("title")).toBe("Launch Video");
    expect(body.has("description")).toBeFalsy();
  });

  it("rejects media uploads without exactly one source", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ id: "video-1" }));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(client.uploadAdImage({})).rejects.toThrow(
      "Ad image upload requires sourceUrl or bytes."
    );
    await expect(
      client.uploadAdImage({
        bytes: new ArrayBuffer(1),
        sourceUrl: "https://example.com/hero.jpg",
      })
    ).rejects.toThrow("Ad image upload accepts sourceUrl or bytes, not both.");
    await expect(client.uploadAdVideo({})).rejects.toThrow(
      "Ad video upload requires fileUrl or bytes."
    );
    await expect(
      client.uploadAdVideo({
        bytes: new ArrayBuffer(1),
        fileUrl: "https://example.com/launch.mp4",
      })
    ).rejects.toThrow("Ad video upload accepts fileUrl or bytes, not both.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects direct video byte uploads over the small-upload cap", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ id: "video-1" }));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.uploadAdVideo({
        bytes: new ArrayBuffer(8 * 1024 * 1024 + 1),
        filename: "large-video.mp4",
      })
    ).rejects.toThrow(
      "Ad video upload bytes must be 8388608 bytes or smaller; use fileUrl or a resumable upload workflow for larger videos."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates custom audiences with generated website rules", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: "aud-1" }));
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
    expect(requestUrl.pathname).toBe("/v25.0/act_123/customaudiences");
    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get("subtype")).toBe("WEBSITE");
    expect(body.get("rule")).toContain("pixel-1");
  });

  it("creates customer-file and lookalike audiences with v25 payloads", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ id: "aud-1" }))
      .mockResolvedValueOnce(Response.json({ id: "lookalike-1" }));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await client.createCustomAudience({
      customerFileSource: "USER_PROVIDED_ONLY",
      name: "Customer List",
      subtype: "CUSTOM",
    });
    await client.createLookalikeAudience({
      country: "US",
      name: "Customer List Lookalike",
      originAudienceId: "aud-1",
      ratio: 0.01,
    });

    const customerFileBody = fetchMock.mock.calls[0]?.[1]
      ?.body as URLSearchParams;
    expect(customerFileBody.get("customer_file_source")).toBe(
      "USER_PROVIDED_ONLY"
    );
    const lookalikeBody = fetchMock.mock.calls[1]?.[1]?.body as URLSearchParams;
    expect(lookalikeBody.get("origin_audience_id")).toBe("aud-1");
    const lookalikeSpec = JSON.parse(
      lookalikeBody.get("lookalike_spec") ?? "{}"
    );
    expect(lookalikeSpec).toStrictEqual({
      country: "US",
      ratio: 0.01,
    });
    expect(lookalikeSpec).not.toHaveProperty("type");
    expect(lookalikeSpec).not.toHaveProperty("origin");
    expect(lookalikeSpec).not.toHaveProperty("origin_audience_id");
  });

  it("serializes a type-mode lookalike without a ratio", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: "lookalike-1" }));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await client.createLookalikeAudience({
      country: "US",
      name: "Similarity Lookalike",
      originAudienceId: "aud-1",
      type: "similarity",
    });

    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(JSON.parse(body.get("lookalike_spec") ?? "{}")).toStrictEqual({
      country: "US",
      type: "similarity",
    });
  });

  it("treats an explicit undefined lookalike type as ratio mode", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: "lookalike-1" }));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await client.createLookalikeAudience({
      country: "US",
      name: "Ratio Lookalike",
      originAudienceId: "aud-1",
      ratio: 0.05,
      type: undefined,
    });

    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(JSON.parse(body.get("lookalike_spec") ?? "{}")).toStrictEqual({
      country: "US",
      ratio: 0.05,
    });
  });

  it("applies the lookalike ratio range guard only in ratio mode", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.createLookalikeAudience({
        country: "US",
        name: "Invalid Ratio Lookalike",
        originAudienceId: "aud-1",
        ratio: 0.21,
      })
    ).rejects.toThrow("Lookalike ratio must be between 0.01 and 0.20.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("validates an explicit undefined lookalike type as ratio mode", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.createLookalikeAudience({
        country: "US",
        name: "Invalid Ratio Lookalike",
        originAudienceId: "aud-1",
        ratio: 0.21,
        type: undefined,
      })
    ).rejects.toThrow("Lookalike ratio must be between 0.01 and 0.20.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists, shares, and unshares custom-audience ad accounts", async () => {
    const sharingResult = {
      sharing_data: [
        {
          ad_acct_id: "456",
          audience_share_status: "SHARED",
          business_id: "789",
          errors: [],
        },
      ],
      success: true,
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ data: [{ id: "456" }] }))
      .mockResolvedValueOnce(Response.json(sharingResult))
      .mockResolvedValueOnce(Response.json({ success: true }));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.listCustomAudienceAdAccounts({
        audienceId: "123_1",
        permissions: "targeting",
      })
    ).resolves.toStrictEqual([{ id: "456" }]);
    await expect(
      client.shareCustomAudience({
        adAccountIds: ["456"],
        audienceId: "123_1",
        permissions: "targeting_and_insights",
        relationshipType: ["AGENCY"],
        replace: true,
      })
    ).resolves.toStrictEqual(sharingResult);
    await expect(
      client.unshareCustomAudience({
        adAccountIds: ["456"],
        audienceId: "123_1",
      })
    ).resolves.toStrictEqual({ success: true });

    const readUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(readUrl.pathname).toBe("/v25.0/123_1/adaccounts");
    expect(readUrl.searchParams.get("permissions")).toBe("targeting");
    const shareBody = fetchMock.mock.calls[1]?.[1]?.body as URLSearchParams;
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("POST");
    expect(JSON.parse(shareBody.get("adaccounts") ?? "[]")).toStrictEqual([
      "456",
    ]);
    expect(shareBody.get("permissions")).toBe("targeting_and_insights");
    expect(
      JSON.parse(shareBody.get("relationship_type") ?? "[]")
    ).toStrictEqual(["AGENCY"]);
    expect(shareBody.get("replace")).toBe("true");
    expect(new URL(String(fetchMock.mock.calls[1]?.[0])).pathname).toBe(
      "/v25.0/123_1/ad_accounts"
    );
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe("DELETE");
    expect(new URL(String(fetchMock.mock.calls[2]?.[0])).pathname).toBe(
      "/v25.0/123_1/ad_accounts"
    );
  });

  it("rejects act-prefixed audience-sharing account IDs", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.shareCustomAudience({
        adAccountIds: ["act_456"],
        audienceId: "123_1",
      })
    ).rejects.toThrow("Ad account IDs must contain bare numeric IDs");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["share", "unshare"] as const)(
    "surfaces ambiguous custom-audience %s writes",
    async (operation) => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockRejectedValue(new TypeError("connection closed after send"));
      const client = createMetaAdsClient({
        accessToken: "token",
        adAccountId: "act_123",
        fetch: fetchMock,
      });

      const result =
        operation === "share"
          ? client.shareCustomAudience({
              adAccountIds: ["456"],
              audienceId: "123_1",
            })
          : client.unshareCustomAudience({
              adAccountIds: ["456"],
              audienceId: "123_1",
            });
      await expect(result).rejects.toMatchObject({
        method: operation === "share" ? "POST" : "DELETE",
        name: "MetaAdsAmbiguousWriteError",
        path: "/v25.0/123_1/ad_accounts",
      });
      expect(fetchMock).toHaveBeenCalledOnce();
    }
  );

  it("adds and removes hashed audience users with batch sessions", async () => {
    const response = {
      audience_id: "aud-1",
      num_invalid_entries: 0,
      num_received: 1,
      session_id: "session-1",
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(response))
      .mockResolvedValueOnce(Response.json(response));
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });
    const input = {
      data: [["a".repeat(64)]],
      dataSource: {
        sub_type: "HASHES",
        type: "FILE_IMPORTED" as const,
      },
      schema: ["EMAIL"] as ["EMAIL"],
      session: {
        batch_seq: 1,
        estimated_num_total: 1,
        last_batch_flag: true,
        session_id: "session-1",
      },
    };

    await client.syncAudienceUsers("123_1", input);
    await client.removeAudienceUsers("123_1", input);

    for (const call of fetchMock.mock.calls) {
      const requestUrl = new URL(String(call[0]));
      expect(requestUrl.pathname).toBe("/v25.0/123_1/users");
      const body = call[1]?.body as URLSearchParams;
      expect(JSON.parse(body.get("payload") ?? "{}")).toMatchObject({
        data: input.data,
        data_source: input.dataSource,
        schema: ["EMAIL"],
      });
      expect(JSON.parse(body.get("session") ?? "{}")).toStrictEqual(
        input.session
      );
    }
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe("DELETE");
  });

  it("rejects unhashed PII before uploading audience users", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.syncAudienceUsers("123_1", {
        data: [["person@example.com"]],
        schema: ["EMAIL"],
      })
    ).rejects.toThrow("field EMAIL at row 1 must be a lowercase SHA-256");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["../../me/feed", "", " ", "act_123"])(
    "rejects hostile audience IDs before requesting Meta: %j",
    async (audienceId) => {
      const fetchMock = vi.fn<typeof fetch>();
      const client = createMetaAdsClient({
        accessToken: "token",
        adAccountId: "act_123",
        fetch: fetchMock,
      });

      await expect(
        client.syncAudienceUsers(audienceId, {
          data: [["a".repeat(64)]],
          schema: ["EMAIL"],
        })
      ).rejects.toThrow(
        "Custom audience ID must contain only digits and underscores."
      );
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it("lists normalized targeting sentence lines for an ad", async () => {
    const response = {
      data: [
        {
          id: "line-1",
          params: { geo_locations: { countries: ["US"] } },
          targetingsentencelines: ["People living in the United States"],
        },
      ],
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(response));
    const client = createMetaAdsClient({
      accessToken: "client-token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.listAdTargetingSentenceLines({
        accessToken: "ad-token",
        adId: "123_1",
      })
    ).resolves.toStrictEqual(response.data);

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v25.0/123_1/targetingsentencelines");
    expect(requestUrl.searchParams.get("access_token")).toBe("ad-token");
    expect(requestUrl.searchParams.get("limit")).toBe("100");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("GET");
  });

  it("lists lead forms and retrieves form leads with v25 fields", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ data: [{ id: "form-1", name: "Newsletter" }] })
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              ad_id: "ad-1",
              created_time: "2026-07-31T19:00:00+0000",
              field_data: [{ name: "email", values: ["person@example.com"] }],
              form_id: "form-1",
              id: "lead-1",
            },
          ],
        })
      );
    const client = createMetaAdsClient({
      accessToken: "client-token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.listLeadForms({ accessToken: "page-token", pageId: "123_1" })
    ).resolves.toStrictEqual([{ id: "form-1", name: "Newsletter" }]);
    await expect(
      client.getLeads({
        accessToken: "lead-token",
        createdAfterUnix: 1_769_870_743,
        formId: "123_2",
      })
    ).resolves.toHaveLength(1);

    const formsUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(formsUrl.pathname).toBe("/v25.0/123_1/leadgen_forms");
    expect(formsUrl.searchParams.get("access_token")).toBe("page-token");
    expect(formsUrl.searchParams.get("fields")).toBe("id,name");

    const leadsUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(leadsUrl.pathname).toBe("/v25.0/123_2/leads");
    expect(leadsUrl.searchParams.get("access_token")).toBe("lead-token");
    expect(leadsUrl.searchParams.get("fields")).toBe(
      "id,created_time,ad_id,form_id,field_data"
    );
    expect(
      JSON.parse(leadsUrl.searchParams.get("filtering") ?? "[]")
    ).toStrictEqual([
      {
        field: "time_created",
        operator: "GREATER_THAN",
        value: 1_769_870_743,
      },
    ]);
  });

  it("rejects invalid lead timestamps before fetching", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const client = createMetaAdsClient({
      accessToken: "token",
      adAccountId: "act_123",
      fetch: fetchMock,
    });

    await expect(
      client.getLeads({ createdAfterUnix: 1.5, formId: "123_2" })
    ).rejects.toThrow("createdAfterUnix must be a non-negative Unix timestamp");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends conversion events to the configured pixel", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
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
            event_source_url: "https://example.com/thanks",
            event_time: 1_779_553_200,
            user_data: {
              client_user_agent: "Mozilla/5.0",
              em: "a".repeat(64),
            },
          },
        ],
        testEventCode: "TEST123",
      },
      pixelId: "123_1",
    });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/v25.0/123_1/events");
    const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get("test_event_code")).toBe("TEST123");
    expect(body.get("data")).toContain("Lead");
  });

  it("rejects unhashed conversion identifiers before sending events", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const client = createMetaAdsClient({
      accessToken: "pixel-token",
      adAccountId: "act_unused",
      fetch: fetchMock,
    });

    await expect(
      client.sendConversionEvents({
        events: {
          events: [
            {
              action_source: "email",
              event_name: "Lead",
              event_time: 1_779_553_200,
              user_data: { em: "person@example.com" },
            },
          ],
        },
        pixelId: "123_1",
      })
    ).rejects.toThrow("user_data.em on event 1 must contain lowercase SHA-256");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects conversion events without user matching data", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const client = createMetaAdsClient({
      accessToken: "pixel-token",
      adAccountId: "act_unused",
      fetch: fetchMock,
    });

    await expect(
      client.sendConversionEvents({
        events: {
          events: [
            {
              action_source: "system_generated",
              event_name: "Lead",
              event_time: 1_779_553_200,
              user_data: {},
            },
          ],
        },
        pixelId: "123_1",
      })
    ).rejects.toThrow("requires at least one non-empty user_data value");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exchanges and inspects user tokens without ad account paths", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
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
    ).resolves.toStrictEqual({ access_token: "long-token" });
    await expect(
      client.inspectToken({
        appId: "app",
        appSecret: "secret",
        token: "long-token",
      })
    ).resolves.toStrictEqual({ data: { is_valid: true, type: "USER" } });

    const exchangeUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(exchangeUrl.pathname).toBe("/v25.0/oauth/access_token");
    expect(exchangeUrl.searchParams.get("fb_exchange_token")).toBe(
      "short-token"
    );
    const inspectUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(inspectUrl.pathname).toBe("/v25.0/debug_token");
    expect(inspectUrl.searchParams.get("access_token")).toBe("app|secret");
  });
});
