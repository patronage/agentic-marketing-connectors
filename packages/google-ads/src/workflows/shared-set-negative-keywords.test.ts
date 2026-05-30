import { describe, expect, it, vi } from "vitest";

import {
  addSharedSetNegativeKeywords,
  applyAccountNegativeKeywordList,
  buildAddSharedSetNegativeKeywordOperations,
  buildApplyAccountNegativeKeywordListOperations,
} from "./shared-set-negative-keywords.js";

describe("apply account negative keyword list workflow", () => {
  it("builds create-set + criteria + attach operations referencing a single temp resource name", () => {
    expect(
      buildApplyAccountNegativeKeywordListOperations({
        campaignIds: ["111", "222"],
        customerId: "123-456-7890",
        keywords: [
          { matchType: "PHRASE", text: "mayor" },
          { matchType: "EXACT", text: "wikipedia" },
        ],
        listName: "Account-Wide Negatives",
      })
    ).toEqual([
      {
        sharedSetOperation: {
          create: {
            name: "Account-Wide Negatives",
            resourceName: "customers/1234567890/sharedSets/-1",
            type: "NEGATIVE_KEYWORDS",
          },
        },
      },
      {
        sharedCriterionOperation: {
          create: {
            keyword: { matchType: "PHRASE", text: "mayor" },
            sharedSet: "customers/1234567890/sharedSets/-1",
          },
        },
      },
      {
        sharedCriterionOperation: {
          create: {
            keyword: { matchType: "EXACT", text: "wikipedia" },
            sharedSet: "customers/1234567890/sharedSets/-1",
          },
        },
      },
      {
        campaignSharedSetOperation: {
          create: {
            campaign: "customers/1234567890/campaigns/111",
            sharedSet: "customers/1234567890/sharedSets/-1",
          },
        },
      },
      {
        campaignSharedSetOperation: {
          create: {
            campaign: "customers/1234567890/campaigns/222",
            sharedSet: "customers/1234567890/sharedSets/-1",
          },
        },
      },
    ]);
  });

  it("fails locally for unsafe or ambiguous inputs", () => {
    expect(() =>
      buildApplyAccountNegativeKeywordListOperations({
        campaignIds: ["111"],
        customerId: "1234567890",
        keywords: [],
        listName: "x",
      })
    ).toThrow("At least one negative keyword");

    expect(() =>
      buildApplyAccountNegativeKeywordListOperations({
        campaignIds: [],
        customerId: "1234567890",
        keywords: [{ matchType: "PHRASE", text: "mayor" }],
        listName: "x",
      })
    ).toThrow("campaignId");

    expect(() =>
      buildApplyAccountNegativeKeywordListOperations({
        campaignIds: ["111"],
        customerId: "1234567890",
        keywords: [{ matchType: "PHRASE", text: "  " }],
        listName: "x",
      })
    ).toThrow("keyword text");

    expect(() =>
      buildApplyAccountNegativeKeywordListOperations({
        campaignIds: ["111"],
        customerId: "1234567890",
        keywords: [{ matchType: "PHRASE", text: "mayor" }],
        listName: "  ",
      })
    ).toThrow("listName");

    expect(() =>
      buildApplyAccountNegativeKeywordListOperations({
        campaignIds: ["111", "111"],
        customerId: "1234567890",
        keywords: [{ matchType: "PHRASE", text: "mayor" }],
        listName: "x",
      })
    ).toThrow("duplicate campaignId");

    expect(() =>
      buildApplyAccountNegativeKeywordListOperations({
        campaignIds: ["111"],
        customerId: "1234567890",
        keywords: [
          { matchType: "PHRASE", text: "duplicate" },
          { matchType: "PHRASE", text: " duplicate " },
        ],
        listName: "x",
      })
    ).toThrow("duplicate negative keyword");
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

    await applyAccountNegativeKeywordList(client, {
      campaignIds: ["111"],
      customerId: "1234567890",
      keywords: [{ matchType: "PHRASE", text: "mayor" }],
      listName: "x",
    });

    expect(client.mutate).toHaveBeenLastCalledWith({
      customerId: "1234567890",
      operations: expect.any(Array),
      validateOnly: true,
    });

    await applyAccountNegativeKeywordList(client, {
      campaignIds: ["111"],
      customerId: "1234567890",
      keywords: [{ matchType: "PHRASE", text: "mayor" }],
      listName: "x",
      mode: "execute",
    });

    expect(client.mutate).toHaveBeenLastCalledWith({
      customerId: "1234567890",
      operations: expect.any(Array),
      validateOnly: false,
    });
  });
});

describe("add to existing shared set workflow", () => {
  it("builds shared criterion create operations targeting an existing shared set", () => {
    expect(
      buildAddSharedSetNegativeKeywordOperations({
        customerId: "1234567890",
        keywords: [
          { matchType: "PHRASE", text: "mayor" },
          { matchType: "EXACT", text: "wikipedia" },
        ],
        sharedSetId: "987",
      })
    ).toEqual([
      {
        sharedCriterionOperation: {
          create: {
            keyword: { matchType: "PHRASE", text: "mayor" },
            sharedSet: "customers/1234567890/sharedSets/987",
          },
        },
      },
      {
        sharedCriterionOperation: {
          create: {
            keyword: { matchType: "EXACT", text: "wikipedia" },
            sharedSet: "customers/1234567890/sharedSets/987",
          },
        },
      },
    ]);
  });

  it("defaults add-to-existing writes to validation mode", async () => {
    const client = {
      mutate: vi.fn().mockResolvedValue({
        mutateOperationResponses: [],
        requestId: "req",
      }),
      search: vi.fn(),
      searchStream: vi.fn(),
    };

    await addSharedSetNegativeKeywords(client, {
      customerId: "1234567890",
      keywords: [{ matchType: "PHRASE", text: "mayor" }],
      sharedSetId: "987",
    });

    expect(client.mutate).toHaveBeenLastCalledWith({
      customerId: "1234567890",
      operations: expect.any(Array),
      validateOnly: true,
    });
  });
});
