import { describe, expect, it, vi } from "vitest";

import type { GoogleAdsClient } from "../rest/index.js";
import {
  buildCampaignAssetOperations,
  buildCreateAssetOperations,
  buildLinkAssetOperations,
  updateCampaignAssets,
} from "./campaign-assets.js";
import type { AssetFieldType, AssetLinkScope } from "./campaign-assets.js";

describe("campaign asset workflow", () => {
  it("builds and links image assets at campaign scope", () => {
    expect(
      buildCampaignAssetOperations({
        assets: [
          {
            data: " aGVsbG8= ",
            name: "  Hero image  ",
            resourceName: "customers/1234567890/assets/-98",
            type: "image",
          },
        ],
        customerId: "123-456-7890",
        links: [
          {
            assetResourceName: "customers/1234567890/assets/-98",
            campaignId: "222",
            fieldType: "MARKETING_IMAGE",
            scope: "campaign",
          },
        ],
      })
    ).toStrictEqual([
      {
        assetOperation: {
          create: {
            imageAsset: { data: "aGVsbG8=" },
            name: "Hero image",
            resourceName: "customers/1234567890/assets/-98",
          },
        },
      },
      {
        campaignAssetOperation: {
          create: {
            asset: "customers/1234567890/assets/-98",
            campaign: "customers/1234567890/campaigns/222",
            fieldType: "MARKETING_IMAGE",
          },
        },
      },
    ]);
  });

  it("builds and links call assets at campaign scope", () => {
    expect(
      buildCampaignAssetOperations({
        assets: [
          {
            countryCode: " us ",
            phoneNumber: "  (800) 555-0100  ",
            resourceName: "customers/1234567890/assets/-99",
            type: "call",
          },
        ],
        customerId: "123-456-7890",
        links: [
          {
            assetResourceName: "customers/1234567890/assets/-99",
            campaignId: "222",
            fieldType: "CALL",
            scope: "campaign",
          },
        ],
      })
    ).toStrictEqual([
      {
        assetOperation: {
          create: {
            callAsset: {
              countryCode: "US",
              phoneNumber: "(800) 555-0100",
            },
            name: "Call: (800) 555-0100",
            resourceName: "customers/1234567890/assets/-99",
          },
        },
      },
      {
        campaignAssetOperation: {
          create: {
            asset: "customers/1234567890/assets/-99",
            campaign: "customers/1234567890/campaigns/222",
            fieldType: "CALL",
          },
        },
      },
    ]);
  });

  it("builds sitelink, callout, and business-name asset create operations", () => {
    expect(
      buildCreateAssetOperations({
        assets: [
          {
            description1: "See the plan",
            description2: "Read more",
            finalUrls: ["https://example.com/plan"],
            linkText: "Energy Plan",
            resourceName: "customers/1234567890/assets/-100",
            type: "sitelink",
          },
          {
            calloutText: "No PAC money",
            resourceName: "customers/1234567890/assets/-101",
            type: "callout",
          },
          {
            businessName: "Patronage",
            resourceName: "customers/1234567890/assets/-102",
            type: "businessName",
          },
        ],
        customerId: "123-456-7890",
      })
    ).toStrictEqual([
      {
        assetOperation: {
          create: {
            finalUrls: ["https://example.com/plan"],
            name: "Sitelink: Energy Plan",
            resourceName: "customers/1234567890/assets/-100",
            sitelinkAsset: {
              description1: "See the plan",
              description2: "Read more",
              linkText: "Energy Plan",
            },
          },
        },
      },
      {
        assetOperation: {
          create: {
            calloutAsset: { calloutText: "No PAC money" },
            name: "Callout: No PAC money",
            resourceName: "customers/1234567890/assets/-101",
          },
        },
      },
      {
        assetOperation: {
          create: {
            name: "Business name: Patronage",
            resourceName: "customers/1234567890/assets/-102",
            textAsset: { text: "Patronage" },
          },
        },
      },
    ]);
  });

  it("builds YouTube video assets from trimmed 11-character video IDs", () => {
    expect(
      buildCreateAssetOperations({
        assets: [
          {
            name: "  Campaign video  ",
            resourceName: "customers/1234567890/assets/-103",
            type: "youtubeVideo",
            youtubeVideoId: "  jV1vkHv4zq8  ",
          },
          {
            resourceName: "customers/1234567890/assets/-104",
            type: "youtubeVideo",
            youtubeVideoId: "dQw4w9WgXcQ",
          },
        ],
        customerId: "123-456-7890",
      })
    ).toStrictEqual([
      {
        assetOperation: {
          create: {
            name: "Campaign video",
            resourceName: "customers/1234567890/assets/-103",
            youtubeVideoAsset: { youtubeVideoId: "jV1vkHv4zq8" },
          },
        },
      },
      {
        assetOperation: {
          create: {
            resourceName: "customers/1234567890/assets/-104",
            youtubeVideoAsset: { youtubeVideoId: "dQw4w9WgXcQ" },
          },
        },
      },
    ]);
  });

  it("builds campaign, ad group, and customer asset link operations", () => {
    expect(
      buildLinkAssetOperations({
        customerId: "1234567890",
        links: [
          {
            assetResourceName: "customers/1234567890/assets/100",
            campaignId: "222",
            fieldType: "SITELINK",
            scope: "campaign",
          },
          {
            adGroupId: "333",
            assetResourceName: "customers/1234567890/assets/101",
            fieldType: "CALLOUT",
            scope: "adGroup",
          },
          {
            assetResourceName: "customers/1234567890/assets/102",
            fieldType: "BUSINESS_NAME",
            scope: "customer",
          },
          {
            assetResourceName: "customers/1234567890/assets/103",
            campaignId: "222",
            fieldType: "MARKETING_IMAGE",
            scope: "campaign",
          },
        ],
      })
    ).toStrictEqual([
      {
        campaignAssetOperation: {
          create: {
            asset: "customers/1234567890/assets/100",
            campaign: "customers/1234567890/campaigns/222",
            fieldType: "SITELINK",
          },
        },
      },
      {
        adGroupAssetOperation: {
          create: {
            adGroup: "customers/1234567890/adGroups/333",
            asset: "customers/1234567890/assets/101",
            fieldType: "CALLOUT",
          },
        },
      },
      {
        customerAssetOperation: {
          create: {
            asset: "customers/1234567890/assets/102",
            fieldType: "BUSINESS_NAME",
          },
        },
      },
      {
        campaignAssetOperation: {
          create: {
            asset: "customers/1234567890/assets/103",
            campaign: "customers/1234567890/campaigns/222",
            fieldType: "MARKETING_IMAGE",
          },
        },
      },
    ]);
  });

  it("combines create and link operations in stable order", () => {
    expect(
      buildCampaignAssetOperations({
        assets: [
          {
            calloutText: "Climate action",
            resourceName: "customers/1234567890/assets/-100",
            type: "callout",
          },
        ],
        customerId: "1234567890",
        links: [
          {
            assetResourceName: "customers/1234567890/assets/-100",
            campaignId: "222",
            fieldType: "CALLOUT",
            scope: "campaign",
          },
        ],
      })
    ).toStrictEqual([
      expect.objectContaining({ assetOperation: expect.any(Object) }),
      expect.objectContaining({ campaignAssetOperation: expect.any(Object) }),
    ]);
  });

  it("rejects unsafe or ambiguous asset inputs locally", () => {
    expect(() =>
      buildCreateAssetOperations({
        assets: [
          {
            data: "not base64!",
            resourceName: "customers/1234567890/assets/-98",
            type: "image",
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("base64-encoded image byte string");

    expect(() =>
      buildCreateAssetOperations({
        assets: [
          {
            countryCode: "USA",
            phoneNumber: "800-555-0100",
            resourceName: "customers/1234567890/assets/-99",
            type: "call",
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("two-letter ISO-3166");

    expect(() =>
      buildCreateAssetOperations({
        assets: [
          {
            countryCode: "US",
            phoneNumber: " ",
            resourceName: "customers/1234567890/assets/-99",
            type: "call",
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("phoneNumber");

    expect(() =>
      buildCreateAssetOperations({
        assets: [
          {
            calloutText: "",
            resourceName: "customers/1234567890/assets/-100",
            type: "callout",
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("calloutText");

    expect(() =>
      buildCreateAssetOperations({
        assets: [
          {
            finalUrls: ["ftp://example.com"],
            linkText: "Bad URL",
            resourceName: "customers/1234567890/assets/-100",
            type: "sitelink",
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("http:// or https://");

    expect(() =>
      buildCreateAssetOperations({
        assets: [
          {
            businessName: "x".repeat(26),
            resourceName: "customers/1234567890/assets/-100",
            type: "businessName",
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("businessName");

    expect(() =>
      buildCreateAssetOperations({
        assets: [
          {
            calloutText: "A",
            resourceName: "customers/9999999999/assets/-100",
            type: "callout",
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("must belong to customer");

    expect(() =>
      buildCreateAssetOperations({
        assets: [
          {
            calloutText: "Existing assets cannot be created",
            resourceName: "customers/1234567890/assets/100",
            type: "callout",
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("negative asset temp ID");

    for (const youtubeVideoId of ["", "too-short", "way-too-long-video-id"]) {
      expect(() =>
        buildCreateAssetOperations({
          assets: [
            {
              resourceName: "customers/1234567890/assets/-103",
              type: "youtubeVideo",
              youtubeVideoId,
            },
          ],
          customerId: "1234567890",
        })
      ).toThrow("11-character value");
    }
  });

  it("rejects unsafe or ambiguous asset links locally", () => {
    expect(() =>
      buildLinkAssetOperations({
        customerId: "1234567890",
        links: [
          {
            assetResourceName: "customers/1234567890/assets/100",
            campaignId: "bad",
            fieldType: "SITELINK",
            scope: "campaign",
          },
        ],
      })
    ).toThrow("campaignId");

    expect(() =>
      buildLinkAssetOperations({
        customerId: "1234567890",
        links: [
          {
            assetResourceName: "customers/1234567890/assets/100",
            fieldType: "NOT_A_FIELD" as "SITELINK",
            scope: "customer",
          },
        ],
      })
    ).toThrow("not supported for customer");

    expect(() =>
      buildLinkAssetOperations({
        customerId: "1234567890",
        links: [
          {
            assetResourceName: "customers/1234567890/assets/100",
            campaignId: "222",
            fieldType: "SITELINK",
            scope: "campaign",
          },
          {
            assetResourceName: "customers/1234567890/assets/100",
            campaignId: "222",
            fieldType: "SITELINK",
            scope: "campaign",
          },
        ],
      })
    ).toThrow("duplicate asset link");
  });

  it("validates asset field types by link scope", () => {
    expect(() =>
      buildLinkAssetOperations({
        customerId: "1234567890",
        links: [
          {
            adGroupId: "333",
            assetResourceName: "customers/1234567890/assets/100",
            fieldType: "MARKETING_IMAGE",
            scope: "adGroup",
          },
        ],
      })
    ).toThrow("not supported for adGroup");

    expect(() =>
      buildLinkAssetOperations({
        customerId: "1234567890",
        links: [
          {
            assetResourceName: "customers/1234567890/assets/100",
            campaignId: "222",
            fieldType: "LOGO" as "BUSINESS_LOGO",
            scope: "campaign",
          },
        ],
      })
    ).toThrow("not supported for campaign");

    expect(() =>
      buildLinkAssetOperations({
        customerId: "1234567890",
        links: [
          {
            assetResourceName: "customers/1234567890/assets/100",
            fieldType: "LOGO" as "BUSINESS_LOGO",
            scope: "customer",
          },
        ],
      })
    ).toThrow("not supported for customer");

    for (const scope of ["adGroup", "campaign", "customer"] as const) {
      const link = youtubeVideoLinkForScope(scope);
      expect(() =>
        buildLinkAssetOperations({
          customerId: "1234567890",
          links: [link],
        })
      ).toThrow(`not supported for ${scope}`);
    }
  });

  it("requires negative temp asset links to match a same-request create", () => {
    expect(() =>
      buildLinkAssetOperations({
        customerId: "1234567890",
        links: [
          {
            assetResourceName: "customers/1234567890/assets/-100",
            campaignId: "222",
            fieldType: "CALLOUT",
            scope: "campaign",
          },
        ],
      })
    ).toThrow("matching asset create");

    expect(() =>
      buildCampaignAssetOperations({
        assets: [
          {
            calloutText: "Climate action",
            resourceName: "customers/1234567890/assets/-101",
            type: "callout",
          },
        ],
        customerId: "1234567890",
        links: [
          {
            assetResourceName: "customers/1234567890/assets/-100",
            campaignId: "222",
            fieldType: "CALLOUT",
            scope: "campaign",
          },
        ],
      })
    ).toThrow("matching asset create");

    expect(
      buildCampaignAssetOperations({
        assets: [
          {
            calloutText: "Climate action",
            resourceName: "customers/1234567890/assets/-100",
            type: "callout",
          },
        ],
        customerId: "1234567890",
        links: [
          {
            assetResourceName: "customers/1234567890/assets/-100",
            campaignId: "222",
            fieldType: "CALLOUT",
            scope: "campaign",
          },
        ],
      })
    ).toStrictEqual([
      expect.objectContaining({ assetOperation: expect.any(Object) }),
      expect.objectContaining({ campaignAssetOperation: expect.any(Object) }),
    ]);
  });

  it("defaults writes to validate-only until apply guardrails are implemented", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>().mockResolvedValue({
        mutateOperationResponses: [],
        requestId: "req",
      }),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await updateCampaignAssets(client, {
      assets: [
        {
          calloutText: "Climate action",
          resourceName: "customers/1234567890/assets/-100",
          type: "callout",
        },
      ],
      customerId: "1234567890",
      partialFailure: true,
    });

    expect(client.mutate).toHaveBeenCalledExactlyOnceWith({
      customerId: "1234567890",
      operations: [
        {
          assetOperation: {
            create: {
              calloutAsset: { calloutText: "Climate action" },
              name: "Callout: Climate action",
              resourceName: "customers/1234567890/assets/-100",
            },
          },
        },
      ],
      partialFailure: true,
      validateOnly: true,
    });

    await expect(
      updateCampaignAssets(client, {
        customerId: "1234567890",
        links: [
          {
            assetResourceName: "customers/1234567890/assets/100",
            campaignId: "222",
            fieldType: "SITELINK",
            scope: "campaign",
          },
        ],
        mode: "execute",
      })
    ).rejects.toThrow("asset policy review");

    expect(client.mutate).toHaveBeenCalledOnce();
  });

  it("rejects partial failure for same-request temp asset create and link dependencies", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>().mockResolvedValue({
        mutateOperationResponses: [],
        requestId: "req",
      }),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await expect(
      updateCampaignAssets(client, {
        assets: [
          {
            calloutText: "Climate action",
            resourceName: "customers/1234567890/assets/-100",
            type: "callout",
          },
        ],
        customerId: "1234567890",
        links: [
          {
            assetResourceName: "customers/1234567890/assets/-100",
            campaignId: "222",
            fieldType: "CALLOUT",
            scope: "campaign",
          },
        ],
        partialFailure: true,
      })
    ).rejects.toThrow("does not support partialFailure");

    expect(client.mutate).not.toHaveBeenCalled();
  });
});

function youtubeVideoLinkForScope(scope: AssetLinkScope) {
  const common = {
    assetResourceName: "customers/1234567890/assets/103",
    fieldType: "YOUTUBE_VIDEO" as AssetFieldType,
  };

  if (scope === "adGroup") {
    return { ...common, adGroupId: "333", scope };
  }

  if (scope === "campaign") {
    return { ...common, campaignId: "222", scope };
  }

  return { ...common, scope };
}
