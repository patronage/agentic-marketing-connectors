import { describe, expect, it, vi } from "vitest";

import { createLinkedInCreativesClient } from "./creatives.js";

const CREATIVE = "urn:li:sponsoredCreative:120491345";

describe(createLinkedInCreativesClient, () => {
  it("reads a creative by its encoded full URN", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        account: "urn:li:sponsoredAccount:520866471",
        campaign: "urn:li:sponsoredCampaign:123",
        content: { reference: "urn:li:share:456" },
        id: CREATIVE,
        intendedStatus: "ACTIVE",
        isServing: false,
        isTest: false,
        review: { status: "APPROVED" },
        servingHoldReasons: ["CAMPAIGN_STOPPED"],
      })
    );
    const client = createLinkedInCreativesClient({
      accessToken: "token",
      adAccountId: "520866471",
      fetch: fetchMock,
    });

    await expect(client.getCreative(CREATIVE)).resolves.toMatchObject({
      id: CREATIVE,
      intendedStatus: "ACTIVE",
      review: { status: "APPROVED" },
      servingHoldReasons: ["CAMPAIGN_STOPPED"],
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/rest/adAccounts/520866471/creatives/urn%3Ali%3AsponsoredCreative%3A120491345"
    );
  });

  it("rejects bare IDs and malformed creative state", async () => {
    const client = createLinkedInCreativesClient({
      accessToken: "token",
      adAccountId: "520866471",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          account: "urn:li:sponsoredAccount:520866471",
          campaign: "urn:li:sponsoredCampaign:123",
          content: { reference: "urn:li:share:456" },
          id: CREATIVE,
          intendedStatus: "RUNNING",
        })
      ),
    });

    await expect(client.getCreative("120491345")).rejects.toThrow(
      "must be a full urn:li:sponsoredCreative: URN"
    );
    await expect(client.getCreative(CREATIVE)).rejects.toThrow(
      "intendedStatus is unsupported"
    );
  });
});
