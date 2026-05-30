import { describe, expect, it, vi } from "vitest";

import { addKeywords, buildAddKeywordsOperations } from "./add-keywords.js";

describe("add keywords workflow", () => {
  it("builds create operations targeting an existing ad group", () => {
    expect(
      buildAddKeywordsOperations({
        adGroupId: "999",
        customerId: "123-456-7890",
        keywords: [
          { matchType: "PHRASE", text: "who is running for governor" },
          { matchType: "EXACT", text: "example community fund endorsements" },
        ],
      })
    ).toEqual([
      {
        adGroupCriterionOperation: {
          create: {
            adGroup: "customers/1234567890/adGroups/999",
            keyword: {
              matchType: "PHRASE",
              text: "who is running for governor",
            },
            status: "ENABLED",
          },
        },
      },
      {
        adGroupCriterionOperation: {
          create: {
            adGroup: "customers/1234567890/adGroups/999",
            keyword: {
              matchType: "EXACT",
              text: "example community fund endorsements",
            },
            status: "ENABLED",
          },
        },
      },
    ]);
  });

  it("fails locally for unsafe or ambiguous keyword inputs", () => {
    expect(() =>
      buildAddKeywordsOperations({
        adGroupId: "999",
        customerId: "1234567890",
        keywords: [],
      })
    ).toThrow("At least one keyword");

    expect(() =>
      buildAddKeywordsOperations({
        adGroupId: "999",
        customerId: "1234567890",
        keywords: [{ matchType: "PHRASE", text: " " }],
      })
    ).toThrow("Keyword text");

    expect(() =>
      buildAddKeywordsOperations({
        adGroupId: "999",
        customerId: "1234567890",
        keywords: [
          { matchType: "PHRASE", text: "duplicate" },
          { matchType: "PHRASE", text: " duplicate " },
        ],
      })
    ).toThrow("duplicate");

    expect(() =>
      buildAddKeywordsOperations({
        adGroupId: "not-a-number",
        customerId: "1234567890",
        keywords: [{ matchType: "PHRASE", text: "valid" }],
      })
    ).toThrow("adGroupId");
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

    await addKeywords(client, {
      adGroupId: "999",
      customerId: "1234567890",
      keywords: [{ matchType: "PHRASE", text: "who is running for governor" }],
    });

    expect(client.mutate).toHaveBeenLastCalledWith({
      customerId: "1234567890",
      operations: expect.any(Array),
      validateOnly: true,
    });

    await addKeywords(client, {
      adGroupId: "999",
      customerId: "1234567890",
      keywords: [{ matchType: "PHRASE", text: "who is running for governor" }],
      mode: "execute",
    });

    expect(client.mutate).toHaveBeenLastCalledWith({
      customerId: "1234567890",
      operations: expect.any(Array),
      validateOnly: false,
    });
  });
});
