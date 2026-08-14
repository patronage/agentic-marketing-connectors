import { describe, expect, it, vi } from "vitest";

import type { GoogleAdsClient } from "../rest/index.js";
import {
  buildPauseAdGroupOperations,
  planPauseAdGroups,
  pauseAdGroups,
} from "./pause-ad-groups.js";

describe("pause ad group workflow", () => {
  it("builds update operations that set status PAUSED with updateMask", () => {
    expect(
      buildPauseAdGroupOperations({
        adGroupIds: ["111", "222"],
        customerId: "123-456-7890",
      })
    ).toStrictEqual([
      {
        adGroupOperation: {
          update: {
            resourceName: "customers/1234567890/adGroups/111",
            status: "PAUSED",
          },
          updateMask: "status",
        },
      },
      {
        adGroupOperation: {
          update: {
            resourceName: "customers/1234567890/adGroups/222",
            status: "PAUSED",
          },
          updateMask: "status",
        },
      },
    ]);
  });

  it("fails locally for unsafe or ambiguous inputs", () => {
    expect(() =>
      buildPauseAdGroupOperations({
        adGroupIds: [],
        customerId: "1234567890",
      })
    ).toThrow("ad group id");

    expect(() =>
      buildPauseAdGroupOperations({
        adGroupIds: ["not-a-number"],
        customerId: "1234567890",
      })
    ).toThrow("adGroupId");

    expect(() =>
      buildPauseAdGroupOperations({
        adGroupIds: ["111", "111"],
        customerId: "1234567890",
      })
    ).toThrow("duplicate");

    expect(() =>
      buildPauseAdGroupOperations({
        adGroupIds: ["111"],
        customerId: "not-a-number",
      })
    ).toThrow("customerId");
  });

  it("defaults typed writes to validation mode and requires explicit execution", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>().mockResolvedValue({
        mutateOperationResponses: [],
        requestId: "req",
      }),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await pauseAdGroups(client, {
      adGroupIds: ["111"],
      customerId: "1234567890",
    });

    expect(client.mutate).toHaveBeenLastCalledWith({
      customerId: "1234567890",
      operations: expect.any(Array),
      validateOnly: true,
    });

    await pauseAdGroups(client, {
      adGroupIds: ["111"],
      customerId: "1234567890",
      mode: "execute",
    });

    expect(client.mutate).toHaveBeenLastCalledWith({
      customerId: "1234567890",
      operations: expect.any(Array),
      validateOnly: false,
    });
  });

  it("creates a fingerprinted provider-validated plan without executing", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>().mockResolvedValue({
        mutateOperationResponses: [],
        requestId: "validation-request",
      }),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    const first = await planPauseAdGroups(client, {
      adGroupIds: ["111", "222"],
      customerId: "123-456-7890",
      operationId: "action-1",
    });
    const second = await planPauseAdGroups(client, {
      adGroupIds: ["111", "222"],
      customerId: "1234567890",
      operationId: "action-2",
    });

    expect(client.mutate).toHaveBeenCalledTimes(2);
    expect(client.mutate).toHaveBeenNthCalledWith(1, {
      customerId: "1234567890",
      operations: expect.any(Array),
      validateOnly: true,
    });
    expect(first.plan).toStrictEqual({
      adGroupIds: ["111", "222"],
      customerId: "1234567890",
      operation: "google_ads.pause_ad_groups",
    });
    expect(first.receipt).toMatchObject({
      operationId: "action-1",
      operationKind: "google_ads.pause_ad_groups",
      provider: "google-ads",
      stage: "provider-validated",
      status: "validated",
    });
    expect(first.receipt.planFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(second.receipt.planFingerprint).toBe(first.receipt.planFingerprint);
  });
});
