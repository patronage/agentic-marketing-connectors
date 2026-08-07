import { describe, expect, it, vi } from "vitest";

import { createLinkedInCampaignsClient } from "./campaigns.js";

describe(createLinkedInCampaignsClient, () => {
  it("reads documented campaign budget and delivery state", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        account: "urn:li:sponsoredAccount:12345",
        campaignGroup: "urn:li:sponsoredCampaignGroup:456",
        costType: "CPM",
        creativeSelection: "OPTIMIZED",
        dailyBudget: { amount: "50", currencyCode: "USD" },
        id: 141_049_524,
        locale: { country: "US", language: "en" },
        name: "Awareness",
        objectiveType: "BRAND_AWARENESS",
        pacingStrategy: "LIFETIME",
        runSchedule: { end: 1_800_000_000_000, start: 1_700_000_000_000 },
        servingStatuses: ["RUNNABLE"],
        status: "ACTIVE",
        totalBudget: { amount: "500", currencyCode: "USD" },
        type: "SPONSORED_UPDATES",
        unitCost: { amount: "0" },
      })
    );
    const client = createLinkedInCampaignsClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: fetchMock,
    });

    await expect(client.getCampaign("141049524")).resolves.toMatchObject({
      dailyBudget: { amount: "50", currencyCode: "USD" },
      campaignGroup: "urn:li:sponsoredCampaignGroup:456",
      costType: "CPM",
      creativeSelection: "OPTIMIZED",
      id: "141049524",
      locale: { country: "US", language: "en" },
      objectiveType: "BRAND_AWARENESS",
      pacingStrategy: "LIFETIME",
      servingStatuses: ["RUNNABLE"],
      totalBudget: { amount: "500", currencyCode: "USD" },
      type: "SPONSORED_UPDATES",
      unitCost: { amount: "0" },
    });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/rest/adAccounts/12345/adCampaigns/141049524");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      "LinkedIn-Version": "202606",
      "X-Restli-Protocol-Version": "2.0.0",
    });
  });

  it("rejects malformed campaign delivery state", async () => {
    const client = createLinkedInCampaignsClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          account: "urn:li:sponsoredAccount:12345",
          id: 141_049_524,
          name: "Awareness",
          servingStatuses: ["BILLING_HOLD"],
          status: "ACTIVE",
        })
      ),
    });

    await expect(client.getCampaign("141049524")).rejects.toThrow(
      "servingStatuses contains unsupported value"
    );
    await expect(client.getCampaign("not-an-id")).rejects.toThrow(
      "campaignId must be a numeric ID or URN"
    );
  });

  it("reads campaign-group budget and billing holds", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        account: "urn:li:sponsoredAccount:12345",
        backfilled: false,
        id: 512_358_882,
        name: "New Campaign Group",
        runSchedule: { end: 9_876_543_210_123, start: 1_234_567_890_987 },
        servingStatuses: ["BILLING_HOLD"],
        status: "ACTIVE",
        test: false,
        totalBudget: { amount: "60000.00", currencyCode: "USD" },
      })
    );
    const client = createLinkedInCampaignsClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: fetchMock,
    });

    await expect(client.getCampaignGroup("512358882")).resolves.toMatchObject({
      id: "512358882",
      servingStatuses: ["BILLING_HOLD"],
      totalBudget: { amount: "60000.00", currencyCode: "USD" },
    });
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).pathname).toBe(
      "/rest/adAccounts/12345/adCampaignGroups/512358882"
    );
  });
});
