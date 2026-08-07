import { describe, expect, it, vi } from "vitest";

import { createLinkedInConversionsClient } from "./conversions.js";

const CAMPAIGN = "urn:li:sponsoredCampaign:337643194";
const CONVERSION = "urn:lla:llaPartnerConversion:70203";

describe(createLinkedInConversionsClient, () => {
  it("reads a campaign-conversion association by composite key", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        associatedAt: 1_506_552_037_373,
        campaign: CAMPAIGN,
        conversion: CONVERSION,
      })
    );
    const client = createLinkedInConversionsClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: fetchMock,
    });

    await expect(
      client.getCampaignConversion({
        campaign: CAMPAIGN,
        conversion: CONVERSION,
      })
    ).resolves.toStrictEqual({
      associatedAt: 1_506_552_037_373,
      campaign: CAMPAIGN,
      conversion: CONVERSION,
    });

    const requestUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestUrl).toContain(
      "/rest/campaignConversions/(campaign:urn%3Ali%3AsponsoredCampaign%3A337643194,conversion:urn%3Alla%3AllaPartnerConversion%3A70203)"
    );
    expect(requestUrl).not.toContain("urn%253A");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      "LinkedIn-Version": "202606",
      "X-Restli-Protocol-Version": "2.0.0",
    });
  });

  it("rejects invalid inputs and mismatched success responses", async () => {
    const client = createLinkedInConversionsClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          associatedAt: 1_506_552_037_373,
          campaign: "urn:li:sponsoredCampaign:other",
          conversion: CONVERSION,
        })
      ),
    });

    await expect(
      client.getCampaignConversion({
        campaign: "337643194",
        conversion: CONVERSION,
      })
    ).rejects.toThrow("campaign must be a urn:li:sponsoredCampaign: URN");
    await expect(
      client.getCampaignConversion({
        campaign: CAMPAIGN,
        conversion: CONVERSION,
      })
    ).rejects.toThrow("identifiers did not match the request");
  });

  it("reads a conversion rule for the configured account", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        account: "urn:li:sponsoredAccount:519072844",
        attributionType: "LAST_TOUCH_BY_CAMPAIGN",
        enabled: true,
        id: 104_004,
        name: "Completed checkout",
        type: "PURCHASE",
      })
    );
    const client = createLinkedInConversionsClient({
      accessToken: "token",
      adAccountId: "519072844",
      fetch: fetchMock,
    });

    await expect(client.getConversion("104004")).resolves.toMatchObject({
      attributionType: "LAST_TOUCH_BY_CAMPAIGN",
      id: "104004",
      type: "PURCHASE",
    });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/rest/conversions/104004");
    expect(url.searchParams.get("account")).toBe(
      "urn:li:sponsoredAccount:519072844"
    );
  });
});
