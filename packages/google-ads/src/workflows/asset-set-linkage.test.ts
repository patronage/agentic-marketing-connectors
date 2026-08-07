import { describe, expect, it, vi } from "vitest";

import type { GoogleAdsClient } from "../rest/index.js";
import {
  buildAssetSetLinkOperations,
  linkAssetSets,
} from "./asset-set-linkage.js";

describe("asset-set linkage workflow", () => {
  it("builds asset-set asset and campaign links", () => {
    expect(
      buildAssetSetLinkOperations({
        assetLinks: [
          {
            assetResourceName: "customers/1234567890/assets/111",
            assetSetResourceName: "customers/1234567890/assetSets/222",
          },
        ],
        campaignLinks: [
          {
            assetSetResourceName: "customers/1234567890/assetSets/222",
            campaignId: "333",
          },
        ],
        customerId: "123-456-7890",
      })
    ).toStrictEqual([
      {
        assetSetAssetOperation: {
          create: {
            asset: "customers/1234567890/assets/111",
            assetSet: "customers/1234567890/assetSets/222",
          },
        },
      },
      {
        campaignAssetSetOperation: {
          create: {
            assetSet: "customers/1234567890/assetSets/222",
            campaign: "customers/1234567890/campaigns/333",
          },
        },
      },
    ]);
  });

  it("rejects empty, cross-customer, invalid, and duplicate links", () => {
    expect(() =>
      buildAssetSetLinkOperations({ customerId: "1234567890" })
    ).toThrow("At least one asset-set");

    expect(() =>
      buildAssetSetLinkOperations({
        assetLinks: [
          {
            assetResourceName: "customers/9999999999/assets/111",
            assetSetResourceName: "customers/1234567890/assetSets/222",
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("must belong to customer");

    expect(() =>
      buildAssetSetLinkOperations({
        campaignLinks: [
          {
            assetSetResourceName: "customers/1234567890/assetSets/222",
            campaignId: "bad",
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("campaignId");

    const duplicate = {
      assetResourceName: "customers/1234567890/assets/111",
      assetSetResourceName: "customers/1234567890/assetSets/222",
    };
    expect(() =>
      buildAssetSetLinkOperations({
        assetLinks: [duplicate, duplicate],
        customerId: "1234567890",
      })
    ).toThrow("duplicate asset-set asset link");
  });

  it("validates through generic mutate and blocks execution", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>().mockResolvedValue({
        mutateOperationResponses: [],
        requestId: "req",
      }),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };
    const input = {
      assetLinks: [
        {
          assetResourceName: "customers/1234567890/assets/111",
          assetSetResourceName: "customers/1234567890/assetSets/222",
        },
      ],
      customerId: "123-456-7890",
      partialFailure: true,
    };

    await expect(linkAssetSets(client, input)).resolves.toStrictEqual({
      mutateOperationResponses: [],
      requestId: "req",
    });
    expect(client.mutate).toHaveBeenCalledExactlyOnceWith({
      customerId: "1234567890",
      operations: [
        {
          assetSetAssetOperation: {
            create: {
              asset: "customers/1234567890/assets/111",
              assetSet: "customers/1234567890/assetSets/222",
            },
          },
        },
      ],
      partialFailure: true,
      validateOnly: true,
    });

    await expect(
      linkAssetSets(client, { ...input, mode: "execute" })
    ).rejects.toThrow("does not support execute mode");
    expect(client.mutate).toHaveBeenCalledOnce();
  });
});
