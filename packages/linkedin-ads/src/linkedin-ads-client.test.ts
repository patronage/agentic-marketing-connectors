import { describe, expect, it, vi } from "vitest";

import { buildBoostPostPlan, createLinkedInAdsClient } from "./index.js";
import type { GetAnalyticsInput } from "./index.js";

function analyticsInput(): GetAnalyticsInput {
  return {
    pivot: "CAMPAIGN",
    since: { day: 1, month: 7, year: 2026 },
    until: { day: 2, month: 7, year: 2026 },
  };
}

describe(createLinkedInAdsClient, () => {
  it("fetches campaign analytics with Rest.li params and headers", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
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
    expect(defaultFields.split(",")).toStrictEqual(
      expect.arrayContaining(["pivotValues", "dateRange"])
    );
    expect(request?.headers).toMatchObject({
      Authorization: "Bearer token",
      "LinkedIn-Version": "202606",
      "X-Restli-Protocol-Version": "2.0.0",
    });
  });

  it("preserves an explicitly configured sunset version and surfaces failure", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { message: "Requested version 202506 is no longer supported" },
          { status: 426 }
        )
      );
    const client = createLinkedInAdsClient({
      accessToken: "token",
      adAccountId: "12345",
      apiVersion: "202506",
      fetch: fetchMock,
    });

    await expect(client.getAdAccount()).rejects.toMatchObject({ status: 426 });
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      "LinkedIn-Version": "202506",
    });
  });

  it("rejects malformed JSON from a successful response", async () => {
    const client = createLinkedInAdsClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        new Response("not-json", {
          headers: { "Content-Type": "application/json" },
          status: 200,
        })
      ),
    });

    await expect(client.getAnalytics(analyticsInput())).rejects.toThrow(
      "LinkedIn returned malformed JSON for successful GET /rest/adAnalytics."
    );
  });

  it("rejects a plausible-looking 200 response without an elements array", async () => {
    const client = createLinkedInAdsClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(Response.json({})),
    });

    await expect(client.getAnalytics(analyticsInput())).rejects.toThrow(
      "LinkedIn analytics read returned an invalid success response"
    );
  });

  it("normalizes bare creative IDs to sponsored creative URNs", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
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
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        elements: [
          {
            campaignGroup: "urn:li:sponsoredCampaignGroup:456",
            costType: "CPM",
            creativeSelection: "OPTIMIZED",
            id: "urn:li:sponsoredCampaign:123",
            locale: { country: "US", language: "en" },
            name: "Climate Action Counts",
            objectiveType: "BRAND_AWARENESS",
            status: "ACTIVE",
            type: "SPONSORED_UPDATES",
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
    ).resolves.toStrictEqual({
      campaigns: [
        {
          campaignGroup: "urn:li:sponsoredCampaignGroup:456",
          costType: "CPM",
          creativeSelection: "OPTIMIZED",
          id: "urn:li:sponsoredCampaign:123",
          locale: { country: "US", language: "en" },
          name: "Climate Action Counts",
          objectiveType: "BRAND_AWARENESS",
          status: "ACTIVE",
          type: "SPONSORED_UPDATES",
        },
      ],
      total: 1,
    });

    const rawUrl = String(fetchMock.mock.calls[0]?.[0]);
    const requestUrl = new URL(rawUrl);
    expect(requestUrl.pathname).toBe("/rest/adAccounts/12345/adCampaigns");
    expect(rawUrl).toContain("q=search");
    expect(rawUrl).toContain("pageSize=25");
    expect(rawUrl).toContain("search=(status:(values:List(ACTIVE,PAUSED)))");
    expect(rawUrl).not.toContain("sponsoredAccount");
  });

  it("validates campaign collection elements before returning them", async () => {
    const client = createLinkedInAdsClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          elements: [
            {
              id: "urn:li:sponsoredCampaign:123",
              name: "Climate Action Counts",
              status: "UNKNOWN_STATUS",
            },
          ],
        })
      ),
    });

    await expect(client.listCampaigns()).rejects.toThrow(
      "campaign read.status is unsupported"
    );
  });

  it("lists and creates campaign groups", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          elements: [{ id: 1, name: "Default", status: "ACTIVE" }],
          paging: { total: 1 },
        })
      )
      .mockResolvedValueOnce(
        new Response(null, { headers: { "x-restli-id": "2" }, status: 201 })
      );
    const client = createLinkedInAdsClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: fetchMock,
    });

    await expect(client.listCampaignGroups()).resolves.toMatchObject({
      total: 1,
    });
    await expect(
      client.createCampaignGroup({ name: "New Group" })
    ).resolves.toStrictEqual({
      id: "urn:li:sponsoredCampaignGroup:2",
      name: "New Group",
    });

    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).pathname).toBe(
      "/rest/adAccounts/12345/adCampaignGroups"
    );
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "POST" });
  });

  it("reports a clear error when campaign group creation returns no id", async () => {
    const client = createLinkedInAdsClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({}, { status: 201 })),
    });

    await expect(
      client.createCampaignGroup({ name: "New Group" })
    ).rejects.toThrow(
      "LinkedIn campaign group creation returned no resource ID."
    );
  });

  it("returns the Rest.li resource id when campaign create has no body", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
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
    ).resolves.toStrictEqual({ id: "urn:li:sponsoredCampaign:123" });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/rest/adAccounts/12345/adCampaigns");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
  });

  it("checks token validity with the configured ad account", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: "12345" }));
    const client = createLinkedInAdsClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: fetchMock,
    });

    await expect(client.checkToken()).resolves.toStrictEqual({ valid: true });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/rest/adAccounts/12345");
  });

  it("returns the configured ad account", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ id: "12345", name: "Canary account" })
      );
    const client = createLinkedInAdsClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: fetchMock,
    });

    await expect(client.getAdAccount()).resolves.toMatchObject({ id: "12345" });
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).pathname).toBe(
      "/rest/adAccounts/12345"
    );
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("GET");
  });

  it("lists creatives with a campaign-scoped criteria query", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        elements: [{ id: "urn:li:sponsoredCreative:7" }],
        paging: { total: 1 },
      })
    );
    const client = createLinkedInAdsClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: fetchMock,
    });

    await expect(
      client.listCreatives({ campaignId: "6", count: 1 })
    ).resolves.toMatchObject({ total: 1 });
    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/rest/adAccounts/12345/creatives");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "campaigns=List(urn%3Ali%3AsponsoredCampaign%3A6)"
    );
    expect(requestUrl.searchParams.get("q")).toBe("criteria");
  });

  it("returns invalid token status for 401 responses", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ message: "Unauthorized" }, { status: 401 })
      );
    const client = createLinkedInAdsClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: fetchMock,
    });

    await expect(client.checkToken()).resolves.toStrictEqual({ valid: false });
  });

  it("returns invalid token status for unauthorized ad account access", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
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

    await expect(client.checkToken()).resolves.toStrictEqual({ valid: false });
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

  it("lists lead forms and retrieves lead responses", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
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

    await expect(client.listLeadForms()).resolves.toStrictEqual({
      forms: [{ id: "urn:li:leadGenForm:1", name: "Signup" }],
      total: 1,
    });
    await expect(
      client.getLeadFormResponses({
        formId: "1",
        submittedAfter: 1_779_553_200_000,
      })
    ).resolves.toStrictEqual({
      leads: [{ id: "lead-1", submittedAt: 1_779_553_200_000 }],
      total: 1,
    });

    const formsUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(formsUrl.pathname).toBe("/rest/leadForms");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "owner=(sponsoredAccount:urn%3Ali%3AsponsoredAccount%3A12345)"
    );
    const responsesUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(responsesUrl.searchParams.get("form")).toBe("urn:li:leadGenForm:1");
  });

  it("lists organization posts for boost discovery", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        elements: [{ id: "urn:li:share:1", commentary: "Post" }],
        paging: { total: 1 },
      })
    );
    const client = createLinkedInAdsClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: fetchMock,
    });

    await expect(
      client.listOrganizationPosts({ organizationUrn: "99" })
    ).resolves.toMatchObject({ posts: [{ id: "urn:li:share:1" }], total: 1 });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/rest/posts");
    expect(url.searchParams.get("author")).toBe("urn:li:organization:99");
  });

  it("updates campaign status with Rest.li partial update", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
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
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    ).toStrictEqual({
      patch: { $set: { status: "PAUSED" } },
    });
  });
});
