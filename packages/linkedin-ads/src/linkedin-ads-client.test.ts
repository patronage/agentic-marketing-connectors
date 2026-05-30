import { describe, expect, it, vi } from "vitest";

import {
  buildBoostPostPlan,
  createLinkedInAdsClient,
} from "./linkedin-ads-client.js";

describe("createLinkedInAdsClient", () => {
  it("fetches campaign analytics with Rest.li params and headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        elements: [
          {
            clicks: 12,
            costInLocalCurrency: "42.00",
            impressions: 1200,
            pivotValues: ["urn:li:sponsoredCampaign:123"],
          },
        ],
      })
    );
    const client = createLinkedInAdsClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: fetchMock,
    });

    await expect(
      client.getAnalytics({
        campaigns: ["123"],
        pivot: "CAMPAIGN",
        since: { day: 31, month: 3, year: 2026 },
        until: { day: 1, month: 4, year: 2026 },
      })
    ).resolves.toHaveLength(1);

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    const request = fetchMock.mock.calls[0]?.[1];
    expect(requestUrl.pathname).toBe("/rest/adAnalytics");
    expect(requestUrl.searchParams.get("accounts")).toBe(
      "List(urn:li:sponsoredAccount:12345)"
    );
    expect(requestUrl.searchParams.get("campaigns")).toBe(
      "List(urn:li:sponsoredCampaign:123)"
    );
    expect(requestUrl.searchParams.get("dateRange")).toBe(
      "(start:(year:2026,month:3,day:31),end:(year:2026,month:4,day:1))"
    );
    const defaultFields = requestUrl.searchParams.get("fields") ?? "";
    expect(defaultFields.split(",")).toEqual(
      expect.arrayContaining(["pivotValues", "dateRange"])
    );
    expect(request?.headers).toMatchObject({
      Authorization: "Bearer token",
      "LinkedIn-Version": "202506",
      "X-Restli-Protocol-Version": "2.0.0",
    });
  });

  it("normalizes bare creative IDs to sponsored creative URNs", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ elements: [] }));
    const client = createLinkedInAdsClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: fetchMock,
    });

    await client.getAnalytics({
      creatives: ["12345", "urn:li:sponsoredCreative:67890"],
      pivot: "CREATIVE",
      since: { day: 31, month: 3, year: 2026 },
      until: { day: 1, month: 4, year: 2026 },
    });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.searchParams.get("creatives")).toBe(
      "List(urn:li:sponsoredCreative:12345,urn:li:sponsoredCreative:67890)"
    );
  });

  it("lists campaigns with account and status search filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        elements: [
          {
            id: "urn:li:sponsoredCampaign:123",
            name: "Climate Action Counts",
            status: "ACTIVE",
          },
        ],
        paging: { total: 1 },
      })
    );
    const client = createLinkedInAdsClient({
      accessToken: "token",
      adAccountId: "urn:li:sponsoredAccount:12345",
      fetch: fetchMock,
    });

    await expect(
      client.listCampaigns({ statuses: ["ACTIVE", "PAUSED"] })
    ).resolves.toEqual({
      campaigns: [
        {
          id: "urn:li:sponsoredCampaign:123",
          name: "Climate Action Counts",
          status: "ACTIVE",
        },
      ],
      total: 1,
    });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/rest/adAccounts/12345/adCampaigns");
    expect(requestUrl.searchParams.get("q")).toBe("search");
    expect(requestUrl.searchParams.get("search")).toContain("ACTIVE,PAUSED");
  });

  it("returns the Rest.li resource id when campaign create has no body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        headers: { "x-restli-id": "urn:li:sponsoredCampaign:123" },
        status: 201,
      })
    );
    const client = createLinkedInAdsClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: fetchMock,
    });

    await expect(
      client.createCampaign({
        campaignGroup: "urn:li:sponsoredCampaignGroup:456",
        dailyBudget: { amount: "25", currencyCode: "USD" },
        name: "Boost",
        targetingCriteria: { includedTargetingFacets: {} },
      })
    ).resolves.toEqual({ id: "urn:li:sponsoredCampaign:123" });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/rest/adAccounts/12345/adCampaigns");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
  });

  it("checks token validity with the configured ad account", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: "12345" }));
    const client = createLinkedInAdsClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: fetchMock,
    });

    await expect(client.checkToken()).resolves.toEqual({ valid: true });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/rest/adAccounts/12345");
  });

  it("returns invalid token status for 401 responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ message: "Unauthorized" }, { status: 401 })
      );
    const client = createLinkedInAdsClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: fetchMock,
    });

    await expect(client.checkToken()).resolves.toEqual({ valid: false });
  });

  it("returns invalid token status for unauthorized ad account access", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { message: "Not enough permissions to access this ad account" },
          { status: 403 }
        )
      );
    const client = createLinkedInAdsClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: fetchMock,
    });

    await expect(client.checkToken()).resolves.toEqual({ valid: false });
  });

  it("builds a boost plan without network access", () => {
    const plan = buildBoostPostPlan(
      {
        campaignGroup: "group-1",
        dailyBudget: 40,
        days: 3,
        organizationUrn: "urn:li:organization:999",
        postUrn: "urn:li:share:123",
      },
      "12345"
    );

    expect(plan.campaign).toMatchObject({
      campaignGroup: "urn:li:sponsoredCampaignGroup:group-1",
      associatedEntity: "urn:li:organization:999",
      name: "Boost: 123",
      objectiveType: "ENGAGEMENT",
      status: "PAUSED",
    });
    expect(plan.creative).toMatchObject({
      campaign: "$campaignId",
      content: { reference: "urn:li:share:123" },
      intendedStatus: "ACTIVE",
    });
  });

  it("requires an organization URN for boost plans", () => {
    expect(() =>
      buildBoostPostPlan(
        {
          campaignGroup: "group-1",
          postUrn: "urn:li:share:123",
        },
        "12345"
      )
    ).toThrow(
      "organizationUrn is required for LinkedIn sponsored content boosts."
    );
  });

  it("boosts a post by creating a campaign and creative", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          id: "urn:li:sponsoredCampaign:123",
          name: "Boost: 123",
          status: "PAUSED",
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          id: "urn:li:sponsoredCreative:456",
          status: "ACTIVE",
        })
      );
    const client = createLinkedInAdsClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: fetchMock,
    });

    await expect(
      client.boostPost({
        campaignGroup: "group-1",
        organizationUrn: "urn:li:organization:999",
        postUrn: "urn:li:share:123",
      })
    ).resolves.toMatchObject({
      campaign: { id: "urn:li:sponsoredCampaign:123" },
      creative: { id: "urn:li:sponsoredCreative:456" },
    });

    expect(
      fetchMock.mock.calls.map((call) => new URL(String(call[0])).pathname)
    ).toEqual([
      "/rest/adAccounts/12345/adCampaigns",
      "/rest/adAccounts/12345/creatives",
    ]);
    const creativeBody = JSON.parse(
      String(fetchMock.mock.calls[1]?.[1]?.body)
    ) as { campaign: string; content: { reference: string } };
    expect(creativeBody).toMatchObject({
      campaign: "urn:li:sponsoredCampaign:123",
      content: { reference: "urn:li:share:123" },
      intendedStatus: "ACTIVE",
    });
    expect(creativeBody).not.toHaveProperty("reference");
    expect(creativeBody).not.toHaveProperty("status");
  });

  it("lists lead forms and retrieves lead responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          elements: [{ id: "urn:li:leadGenForm:1", name: "Signup" }],
          paging: { total: 1 },
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          elements: [{ id: "lead-1", submittedAt: 1_779_553_200_000 }],
          paging: { total: 1 },
        })
      );
    const client = createLinkedInAdsClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: fetchMock,
    });

    await expect(client.listLeadForms()).resolves.toEqual({
      forms: [{ id: "urn:li:leadGenForm:1", name: "Signup" }],
      total: 1,
    });
    await expect(
      client.getLeadFormResponses({
        formId: "1",
        submittedAfter: 1_779_553_200_000,
      })
    ).resolves.toEqual({
      leads: [{ id: "lead-1", submittedAt: 1_779_553_200_000 }],
      total: 1,
    });

    const formsUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(formsUrl.pathname).toBe("/rest/leadForms");
    expect(formsUrl.searchParams.get("owner")).toBe(
      "urn:li:sponsoredAccount:12345"
    );
    const responsesUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(responsesUrl.searchParams.get("form")).toBe("urn:li:leadGenForm:1");
  });

  it("updates campaign status with Rest.li partial update", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const client = createLinkedInAdsClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: fetchMock,
    });

    await client.pauseCampaign("urn:li:sponsoredCampaign:123");

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/rest/adAccounts/12345/adCampaigns/123");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        "X-RestLi-Method": "PARTIAL_UPDATE",
      }),
      method: "POST",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      patch: { $set: { status: "PAUSED" } },
    });
  });
});
