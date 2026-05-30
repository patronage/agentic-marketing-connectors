import { describe, expect, it, vi } from "vitest";

import {
  buildPauseAdGroupOperations,
  pauseAdGroups,
} from "./pause-ad-groups.js";

describe("pause ad group workflow", () => {
  it("builds update operations that set status PAUSED with updateMask", () => {
    expect(
      buildPauseAdGroupOperations({
        adGroupIds: ["111", "222"],
        customerId: "123-456-7890",
      })
    ).toEqual([
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
      mutate: vi.fn().mockResolvedValue({
        mutateOperationResponses: [],
        requestId: "req",
      }),
      search: vi.fn(),
      searchStream: vi.fn(),
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
});
