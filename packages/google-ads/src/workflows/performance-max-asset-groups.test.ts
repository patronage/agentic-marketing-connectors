import { describe, expect, it, vi } from "vitest";

import type { GoogleAdsClient } from "../rest/index.js";
import {
  buildPerformanceMaxAssetGroupOperations,
  deployPerformanceMaxAssetGroups,
} from "./performance-max-asset-groups.js";

describe("Performance Max asset groups workflow", () => {
  it("builds asset group, text asset, and asset group asset operations", () => {
    expect(
      buildPerformanceMaxAssetGroupOperations({
        assetGroups: [
          {
            campaignId: "222",
            finalMobileUrls: ["https://m.example.com/pmax"],
            finalUrls: ["https://example.com/pmax"],
            name: "PMax Core",
            resourceName: "customers/1234567890/assetGroups/-100",
          },
        ],
        customerId: "123-456-7890",
        links: [
          {
            assetGroupResourceName: "customers/1234567890/assetGroups/-100",
            assetResourceName: "customers/1234567890/assets/-200",
            fieldType: "HEADLINE",
          },
          {
            assetGroupResourceName: "customers/1234567890/assetGroups/-100",
            assetResourceName: "customers/1234567890/assets/300",
            fieldType: "MARKETING_IMAGE",
          },
        ],
        textAssets: [
          {
            fieldType: "HEADLINE",
            resourceName: "customers/1234567890/assets/-200",
            text: "Clean energy now",
          },
        ],
      })
    ).toStrictEqual([
      {
        assetGroupOperation: {
          create: {
            campaign: "customers/1234567890/campaigns/222",
            finalMobileUrls: ["https://m.example.com/pmax"],
            finalUrls: ["https://example.com/pmax"],
            name: "PMax Core",
            resourceName: "customers/1234567890/assetGroups/-100",
            status: "PAUSED",
          },
        },
      },
      {
        assetOperation: {
          create: {
            name: "HEADLINE: Clean energy now",
            resourceName: "customers/1234567890/assets/-200",
            textAsset: { text: "Clean energy now" },
          },
        },
      },
      {
        assetGroupAssetOperation: {
          create: {
            asset: "customers/1234567890/assets/-200",
            assetGroup: "customers/1234567890/assetGroups/-100",
            fieldType: "HEADLINE",
          },
        },
      },
      {
        assetGroupAssetOperation: {
          create: {
            asset: "customers/1234567890/assets/300",
            assetGroup: "customers/1234567890/assetGroups/-100",
            fieldType: "MARKETING_IMAGE",
          },
        },
      },
    ]);
  });

  it("supports linking existing assets to an existing asset group", () => {
    expect(
      buildPerformanceMaxAssetGroupOperations({
        customerId: "1234567890",
        links: [
          {
            assetGroupResourceName: "customers/1234567890/assetGroups/999",
            assetResourceName: "customers/1234567890/assets/300",
            fieldType: "MARKETING_IMAGE",
          },
        ],
      })
    ).toStrictEqual([
      {
        assetGroupAssetOperation: {
          create: {
            asset: "customers/1234567890/assets/300",
            assetGroup: "customers/1234567890/assetGroups/999",
            fieldType: "MARKETING_IMAGE",
          },
        },
      },
    ]);
  });

  it("rejects unsafe or ambiguous asset group inputs locally", () => {
    expect(() =>
      buildPerformanceMaxAssetGroupOperations({
        customerId: "1234567890",
        links: [],
      })
    ).toThrow("At least one asset group asset link");

    expect(() =>
      buildPerformanceMaxAssetGroupOperations({
        assetGroups: [
          {
            campaignId: "222",
            finalUrls: ["https://example.com"],
            name: "Bad",
            resourceName: "customers/1234567890/assetGroups/100",
          },
        ],
        customerId: "1234567890",
        links: [],
      })
    ).toThrow("negative asset group temp ID");

    expect(() =>
      buildPerformanceMaxAssetGroupOperations({
        assetGroups: [
          {
            campaignId: "bad",
            finalUrls: ["https://example.com"],
            name: "Bad",
            resourceName: "customers/1234567890/assetGroups/-100",
          },
        ],
        customerId: "1234567890",
        links: [],
      })
    ).toThrow("campaignId");

    expect(() =>
      buildPerformanceMaxAssetGroupOperations({
        assetGroups: [
          {
            campaignId: "222",
            finalUrls: ["ftp://example.com"],
            name: "Bad",
            resourceName: "customers/1234567890/assetGroups/-100",
          },
        ],
        customerId: "1234567890",
        links: [],
      })
    ).toThrow("http:// or https://");
  });

  it("rejects unsafe or ambiguous PMax text assets and links", () => {
    expect(() =>
      buildPerformanceMaxAssetGroupOperations({
        assetGroups: [
          {
            campaignId: "222",
            finalUrls: ["https://example.com"],
            name: "PMax",
            resourceName: "customers/1234567890/assetGroups/-100",
          },
        ],
        customerId: "1234567890",
        links: [
          {
            assetGroupResourceName: "customers/1234567890/assetGroups/-100",
            assetResourceName: "customers/1234567890/assets/-200",
            fieldType: "HEADLINE",
          },
        ],
      })
    ).toThrow("matching text asset create");

    expect(() =>
      buildPerformanceMaxAssetGroupOperations({
        assetGroups: [
          {
            campaignId: "222",
            finalUrls: ["https://example.com"],
            name: "PMax",
            resourceName: "customers/1234567890/assetGroups/-100",
          },
        ],
        customerId: "1234567890",
        links: [],
        textAssets: [
          {
            fieldType: "HEADLINE",
            resourceName: "customers/1234567890/assets/200",
            text: "Bad temp",
          },
        ],
      })
    ).toThrow("negative asset temp ID");

    expect(() =>
      buildPerformanceMaxAssetGroupOperations({
        assetGroups: [
          {
            campaignId: "222",
            finalUrls: ["https://example.com"],
            name: "PMax",
            resourceName: "customers/1234567890/assetGroups/-100",
          },
        ],
        customerId: "1234567890",
        links: [],
        textAssets: [
          {
            fieldType: "HEADLINE",
            resourceName: "customers/1234567890/assets/-200",
            text: "x".repeat(31),
          },
        ],
      })
    ).toThrow("30 characters or fewer");

    expect(() =>
      buildPerformanceMaxAssetGroupOperations({
        assetGroups: [
          {
            campaignId: "222",
            finalUrls: ["https://example.com"],
            name: "PMax",
            resourceName: "customers/1234567890/assetGroups/-100",
          },
        ],
        customerId: "1234567890",
        links: [
          {
            assetGroupResourceName: "customers/1234567890/assetGroups/-101",
            assetResourceName: "customers/1234567890/assets/300",
            fieldType: "MARKETING_IMAGE",
          },
        ],
      })
    ).toThrow("matching asset group create");

    expect(() =>
      buildPerformanceMaxAssetGroupOperations({
        assetGroups: [
          {
            campaignId: "222",
            finalUrls: ["https://example.com"],
            name: "PMax",
            resourceName: "customers/1234567890/assetGroups/-100",
          },
        ],
        customerId: "1234567890",
        links: [
          {
            assetGroupResourceName: "customers/1234567890/assetGroups/-100",
            assetResourceName: "customers/1234567890/assets/-200",
            fieldType: "MARKETING_IMAGE",
          },
        ],
        textAssets: [
          {
            fieldType: "HEADLINE",
            resourceName: "customers/1234567890/assets/-200",
            text: "Headline",
          },
        ],
      })
    ).toThrow("text-compatible");
  });

  it("rejects duplicate, brand, and unsupported asset group asset links", () => {
    expect(() =>
      buildPerformanceMaxAssetGroupOperations({
        assetGroups: [
          {
            campaignId: "222",
            finalUrls: ["https://example.com"],
            name: "PMax",
            resourceName: "customers/1234567890/assetGroups/-100",
          },
        ],
        customerId: "1234567890",
        links: [
          {
            assetGroupResourceName: "customers/1234567890/assetGroups/-100",
            assetResourceName: "customers/1234567890/assets/300",
            fieldType: "NOT_A_FIELD" as "HEADLINE",
          },
        ],
      })
    ).toThrow("Unsupported Performance Max asset fieldType");

    for (const fieldType of [
      "BUSINESS_NAME",
      "LOGO",
      "LANDSCAPE_LOGO",
    ] as const) {
      expect(() =>
        buildPerformanceMaxAssetGroupOperations({
          assetGroups: [
            {
              campaignId: "222",
              finalUrls: ["https://example.com"],
              name: "PMax",
              resourceName: "customers/1234567890/assetGroups/-100",
            },
          ],
          customerId: "1234567890",
          links: [
            {
              assetGroupResourceName: "customers/1234567890/assetGroups/-100",
              assetResourceName: "customers/1234567890/assets/300",
              fieldType: fieldType as "HEADLINE",
            },
          ],
        })
      ).toThrow("Unsupported Performance Max asset fieldType");
    }

    expect(() =>
      buildPerformanceMaxAssetGroupOperations({
        assetGroups: [
          {
            campaignId: "222",
            finalUrls: ["https://example.com"],
            name: "PMax",
            resourceName: "customers/1234567890/assetGroups/-100",
          },
        ],
        customerId: "1234567890",
        links: [
          {
            assetGroupResourceName: "customers/1234567890/assetGroups/-100",
            assetResourceName: "customers/1234567890/assets/300",
            fieldType: "MARKETING_IMAGE",
          },
          {
            assetGroupResourceName: "customers/1234567890/assetGroups/-100",
            assetResourceName: "customers/1234567890/assets/300",
            fieldType: "MARKETING_IMAGE",
          },
        ],
      })
    ).toThrow("duplicate asset group asset link");
  });

  it("defaults writes to validate-only until PMax apply guardrails are implemented", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>().mockResolvedValue({
        mutateOperationResponses: [],
        requestId: "req",
      }),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await deployPerformanceMaxAssetGroups(client, {
      assetGroups: [
        {
          campaignId: "222",
          finalUrls: ["https://example.com"],
          name: "PMax",
          resourceName: "customers/1234567890/assetGroups/-100",
        },
      ],
      customerId: "1234567890",
      links: [
        {
          assetGroupResourceName: "customers/1234567890/assetGroups/-100",
          assetResourceName: "customers/1234567890/assets/300",
          fieldType: "MARKETING_IMAGE",
        },
      ],
    });

    expect(client.mutate).toHaveBeenCalledExactlyOnceWith({
      customerId: "1234567890",
      operations: [
        {
          assetGroupOperation: {
            create: {
              campaign: "customers/1234567890/campaigns/222",
              finalUrls: ["https://example.com"],
              name: "PMax",
              resourceName: "customers/1234567890/assetGroups/-100",
              status: "PAUSED",
            },
          },
        },
        {
          assetGroupAssetOperation: {
            create: {
              asset: "customers/1234567890/assets/300",
              assetGroup: "customers/1234567890/assetGroups/-100",
              fieldType: "MARKETING_IMAGE",
            },
          },
        },
      ],
      partialFailure: false,
      validateOnly: true,
    });

    await expect(
      deployPerformanceMaxAssetGroups(client, {
        assetGroups: [
          {
            campaignId: "222",
            finalUrls: ["https://example.com"],
            name: "PMax",
            resourceName: "customers/1234567890/assetGroups/-100",
          },
        ],
        customerId: "1234567890",
        links: [
          {
            assetGroupResourceName: "customers/1234567890/assetGroups/-100",
            assetResourceName: "customers/1234567890/assets/300",
            fieldType: "MARKETING_IMAGE",
          },
        ],
        partialFailure: true,
      })
    ).rejects.toThrow("does not support partialFailure");

    await expect(
      deployPerformanceMaxAssetGroups(client, {
        assetGroups: [
          {
            campaignId: "222",
            finalUrls: ["https://example.com"],
            name: "PMax",
            resourceName: "customers/1234567890/assetGroups/-100",
          },
        ],
        customerId: "1234567890",
        links: [
          {
            assetGroupResourceName: "customers/1234567890/assetGroups/-100",
            assetResourceName: "customers/1234567890/assets/300",
            fieldType: "MARKETING_IMAGE",
          },
        ],
        mode: "execute",
      })
    ).rejects.toThrow("PMax asset policy review");

    expect(client.mutate).toHaveBeenCalledOnce();
  });
});
