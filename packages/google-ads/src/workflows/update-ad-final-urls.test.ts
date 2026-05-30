import { describe, expect, it, vi } from "vitest";

import {
  buildUpdateAdFinalUrlOperations,
  updateAdFinalUrls,
} from "./update-ad-final-urls.js";

describe("update ad final URLs workflow", () => {
  it("builds adOperation.update operations with the final_urls updateMask", () => {
    expect(
      buildUpdateAdFinalUrlOperations({
        ads: [
          {
            adId: "111",
            finalUrls: ["https://example.com/landing-a"],
          },
          {
            adId: "222",
            finalUrls: ["https://example.com/landing-b"],
          },
        ],
        customerId: "123-456-7890",
      })
    ).toEqual([
      {
        adOperation: {
          update: {
            finalUrls: ["https://example.com/landing-a"],
            resourceName: "customers/1234567890/ads/111",
          },
          updateMask: "final_urls",
        },
      },
      {
        adOperation: {
          update: {
            finalUrls: ["https://example.com/landing-b"],
            resourceName: "customers/1234567890/ads/222",
          },
          updateMask: "final_urls",
        },
      },
    ]);
  });

  it("fails locally for unsafe or ambiguous inputs", () => {
    expect(() =>
      buildUpdateAdFinalUrlOperations({
        ads: [],
        customerId: "1234567890",
      })
    ).toThrow("At least one ad");

    expect(() =>
      buildUpdateAdFinalUrlOperations({
        ads: [{ adId: "not-a-number", finalUrls: ["https://x"] }],
        customerId: "1234567890",
      })
    ).toThrow("adId");

    expect(() =>
      buildUpdateAdFinalUrlOperations({
        ads: [
          { adId: "111", finalUrls: ["https://example.com"] },
          { adId: "111", finalUrls: ["https://other.com"] },
        ],
        customerId: "1234567890",
      })
    ).toThrow("duplicate adId");

    expect(() =>
      buildUpdateAdFinalUrlOperations({
        ads: [{ adId: "111", finalUrls: [] }],
        customerId: "1234567890",
      })
    ).toThrow("at least one finalUrl");

    expect(() =>
      buildUpdateAdFinalUrlOperations({
        ads: [{ adId: "111", finalUrls: ["ftp://example.com/file"] }],
        customerId: "1234567890",
      })
    ).toThrow("http:// or https://");

    expect(() =>
      buildUpdateAdFinalUrlOperations({
        ads: [{ adId: "111", finalUrls: ["   "] }],
        customerId: "1234567890",
      })
    ).toThrow("empty");
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

    await updateAdFinalUrls(client, {
      ads: [{ adId: "111", finalUrls: ["https://example.com/landing"] }],
      customerId: "1234567890",
    });

    expect(client.mutate).toHaveBeenLastCalledWith({
      customerId: "1234567890",
      operations: expect.any(Array),
      validateOnly: true,
    });

    await updateAdFinalUrls(client, {
      ads: [{ adId: "111", finalUrls: ["https://example.com/landing"] }],
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
