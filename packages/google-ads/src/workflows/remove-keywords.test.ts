import { describe, expect, it, vi } from "vitest";

import type { GoogleAdsClient } from "../rest/index.js";
import {
  buildRemoveKeywordsOperations,
  removeKeywords,
} from "./remove-keywords.js";

function clientWithScopes(
  scopes: { adGroupId: string; criterionId: string; negative: boolean }[]
) {
  return {
    mutate: vi.fn<GoogleAdsClient["mutate"]>().mockResolvedValue({
      mutateOperationResponses: [],
      requestId: "req",
    }),
    search: vi.fn<GoogleAdsClient["search"]>().mockImplementation((input) => {
      const negative = input.query.includes(
        "ad_group_criterion.negative = TRUE"
      );
      return Promise.resolve({
        requestId: "req",
        rows: scopes
          .filter((scope) => scope.negative === negative)
          .map((scope) => ({
            adGroup: { id: scope.adGroupId },
            adGroupCriterion: {
              criterionId: scope.criterionId,
              ...(scope.negative ? { negative: true } : {}),
            },
          })),
      });
    }),
    searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
  };
}

const positive = {
  adGroupId: "999",
  criterionId: "111",
  negative: false,
  text: "calfresh application",
};
const negative = {
  adGroupId: "999",
  criterionId: "222",
  negative: true,
  text: "texas",
};

describe("remove keywords workflow", () => {
  it("builds remove operations for the declared scope", () => {
    expect(
      buildRemoveKeywordsOperations({
        criteria: [positive],
        customerId: "123-456-7890",
        expect: "positive",
      })
    ).toStrictEqual([
      {
        adGroupCriterionOperation: {
          remove: "customers/1234567890/adGroupCriteria/999~111",
        },
      },
    ]);

    expect(
      buildRemoveKeywordsOperations({
        criteria: [negative],
        customerId: "1234567890",
        expect: "negative",
      })
    ).toStrictEqual([
      {
        adGroupCriterionOperation: {
          remove: "customers/1234567890/adGroupCriteria/999~222",
        },
      },
    ]);
  });

  it("refuses to remove negatives when positives were declared", () => {
    // The failure this command exists to prevent: a keyword_view read without a
    // `negative` filter returns both kinds, and removing the wrong kind deletes
    // a negative list while reporting it as a keyword cleanup.
    expect(() =>
      buildRemoveKeywordsOperations({
        criteria: [positive, negative],
        customerId: "1234567890",
        expect: "positive",
      })
    ).toThrow(/negative/iu);
  });

  it("refuses to remove positives when negatives were declared", () => {
    expect(() =>
      buildRemoveKeywordsOperations({
        criteria: [negative, positive],
        customerId: "1234567890",
        expect: "negative",
      })
    ).toThrow(/positive/iu);
  });

  it("names the mismatched keywords so the caller can see what it nearly deleted", () => {
    expect(() =>
      buildRemoveKeywordsOperations({
        criteria: [positive, negative],
        customerId: "1234567890",
        expect: "positive",
      })
    ).toThrow(/texas/u);
  });

  it("fails locally for unsafe or ambiguous inputs", () => {
    expect(() =>
      buildRemoveKeywordsOperations({
        criteria: [],
        customerId: "1234567890",
        expect: "positive",
      })
    ).toThrow("At least one");

    expect(() =>
      buildRemoveKeywordsOperations({
        criteria: [{ ...positive, adGroupId: "not-a-number" }],
        customerId: "1234567890",
        expect: "positive",
      })
    ).toThrow("adGroupId");

    expect(() =>
      buildRemoveKeywordsOperations({
        criteria: [{ ...positive, criterionId: "abc" }],
        customerId: "1234567890",
        expect: "positive",
      })
    ).toThrow("criterionId");

    expect(() =>
      buildRemoveKeywordsOperations({
        criteria: [positive, positive],
        customerId: "1234567890",
        expect: "positive",
      })
    ).toThrow("duplicate");
  });

  it("rejects empty workflow input before reading the provider", async () => {
    const client = clientWithScopes([]);

    await expect(
      removeKeywords(client, {
        criteria: [],
        customerId: "1234567890",
        expect: "positive",
      })
    ).rejects.toThrow("At least one");

    expect(client.search).not.toHaveBeenCalled();
    expect(client.mutate).not.toHaveBeenCalled();
  });

  it("refuses when the account contradicts the declared scope", async () => {
    // The caller believes these are positives and says so. The account says
    // otherwise, and the account wins — this is the incident, caught.
    const client = clientWithScopes([
      { adGroupId: "999", criterionId: "111", negative: true },
    ]);

    await expect(
      removeKeywords(client, {
        criteria: [positive],
        customerId: "1234567890",
        expect: "positive",
      })
    ).rejects.toThrow(/account reports/iu);

    expect(client.mutate).not.toHaveBeenCalled();
  });

  it("refuses when a criterion cannot be found in the account", async () => {
    const client = clientWithScopes([]);

    await expect(
      removeKeywords(client, {
        criteria: [positive],
        customerId: "1234567890",
        expect: "positive",
      })
    ).rejects.toThrow(/not found/iu);

    expect(client.mutate).not.toHaveBeenCalled();
  });

  it("matches criteria on ad group and criterion id together", async () => {
    // Criterion ids repeat across ad groups. If the scope map keyed on the
    // criterion id alone, the negative in ad group 888 would answer for the
    // positive in 999 — or the reverse, which is the incident.
    const client = clientWithScopes([
      { adGroupId: "888", criterionId: "111", negative: true },
      { adGroupId: "999", criterionId: "111", negative: false },
    ]);

    await removeKeywords(client, {
      criteria: [positive],
      customerId: "1234567890",
      expect: "positive",
    });

    expect(client.mutate).toHaveBeenCalledOnce();

    await expect(
      removeKeywords(client, {
        criteria: [{ ...positive, adGroupId: "888" }],
        customerId: "1234567890",
        expect: "positive",
      })
    ).rejects.toThrow(/account reports/iu);
  });

  it("reads the account scope from snake_case responses too", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>().mockResolvedValue({
        mutateOperationResponses: [],
        requestId: "req",
      }),
      search: vi.fn<GoogleAdsClient["search"]>().mockImplementation((input) =>
        Promise.resolve({
          requestId: "req",
          rows: input.query.includes("negative = FALSE")
            ? [
                {
                  ad_group: { id: "999" },
                  ad_group_criterion: { criterion_id: "111" },
                },
              ]
            : [],
        })
      ),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await removeKeywords(client, {
      criteria: [positive],
      customerId: "1234567890",
      expect: "positive",
    });

    expect(client.mutate).toHaveBeenCalledOnce();
  });

  it("verifies against keyword criteria only", async () => {
    // An audience or age-range criterion also reports negative: false, so a
    // positive-scope check would pass it. Scoping the read to keywords makes
    // such an id unverifiable instead of approved.
    const client = clientWithScopes([
      { adGroupId: "999", criterionId: "111", negative: false },
    ]);

    await removeKeywords(client, {
      criteria: [positive],
      customerId: "1234567890",
      expect: "positive",
    });

    expect(client.search).toHaveBeenCalledTimes(2);
    for (const [input] of client.search.mock.calls) {
      expect(input.query).toContain("ad_group_criterion.type = 'KEYWORD'");
    }
  });

  it("derives scope from provider predicates, not returned field values", async () => {
    const mutate = vi.fn<GoogleAdsClient["mutate"]>().mockResolvedValue({
      mutateOperationResponses: [],
      requestId: "req",
    });
    const search = vi
      .fn<GoogleAdsClient["search"]>()
      .mockImplementation((input) =>
        Promise.resolve({
          requestId: "req",
          rows: input.query.includes("negative = TRUE")
            ? [
                {
                  adGroup: { id: "999" },
                  adGroupCriterion: {
                    criterionId: "222",
                    negative: "not-a-boolean",
                  },
                },
              ]
            : [],
        })
      );

    await expect(
      removeKeywords(
        {
          mutate,
          search,
          searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
        },
        {
          criteria: [negative],
          customerId: "1234567890",
          expect: "negative",
          mode: "execute",
        }
      )
    ).rejects.toThrow(/invalid negative value/iu);

    expect(mutate).not.toHaveBeenCalled();
  });

  it("rejects invalid values returned by the positive scope query", async () => {
    const client = clientWithScopes([]);
    client.search
      .mockResolvedValueOnce({
        requestId: "positive",
        rows: [
          {
            adGroup: { id: "999" },
            adGroupCriterion: { criterionId: "111", negative: "false" },
          },
        ],
      })
      .mockResolvedValueOnce({ requestId: "negative", rows: [] });

    await expect(
      removeKeywords(client, {
        criteria: [positive],
        customerId: "1234567890",
        expect: "positive",
        mode: "execute",
      })
    ).rejects.toThrow(/invalid negative value/iu);

    expect(client.mutate).not.toHaveBeenCalled();
  });

  it("requires literal true from the negative scope query", async () => {
    const client = clientWithScopes([]);
    client.search
      .mockResolvedValueOnce({ requestId: "positive", rows: [] })
      .mockResolvedValueOnce({
        requestId: "negative",
        rows: [
          {
            adGroup: { id: "999" },
            adGroupCriterion: { criterionId: "222" },
          },
        ],
      });

    await expect(
      removeKeywords(client, {
        criteria: [negative],
        customerId: "1234567890",
        expect: "negative",
        mode: "execute",
      })
    ).rejects.toThrow(/invalid negative value/iu);

    expect(client.mutate).not.toHaveBeenCalled();
  });

  it("rejects values that contradict the scoped provider predicate", async () => {
    const client = clientWithScopes([]);
    client.search
      .mockResolvedValueOnce({
        requestId: "positive",
        rows: [
          {
            adGroup: { id: "999" },
            adGroupCriterion: { criterionId: "111", negative: true },
          },
        ],
      })
      .mockResolvedValueOnce({ requestId: "negative", rows: [] });

    await expect(
      removeKeywords(client, {
        criteria: [positive],
        customerId: "1234567890",
        expect: "positive",
        mode: "execute",
      })
    ).rejects.toThrow(/invalid negative value/iu);

    expect(client.mutate).not.toHaveBeenCalled();
  });

  it("rejects a composite key returned by both scope queries", async () => {
    const client = clientWithScopes([]);
    client.search
      .mockResolvedValueOnce({
        requestId: "positive",
        rows: [
          {
            adGroup: { id: "999" },
            adGroupCriterion: { criterionId: "111" },
          },
        ],
      })
      .mockResolvedValueOnce({
        requestId: "negative",
        rows: [
          {
            adGroup: { id: "999" },
            adGroupCriterion: { criterionId: "111", negative: true },
          },
        ],
      });

    await expect(
      removeKeywords(client, {
        criteria: [positive],
        customerId: "1234567890",
        expect: "positive",
        mode: "execute",
      })
    ).rejects.toThrow(/both positive and negative/iu);

    expect(client.mutate).not.toHaveBeenCalled();
  });

  it("reads every scope page before authorizing mutation", async () => {
    const client = clientWithScopes([]);
    client.search
      .mockResolvedValueOnce({
        nextPageToken: "positive-page-2",
        requestId: "positive-page-1",
        rows: [],
      })
      .mockResolvedValueOnce({
        requestId: "positive-page-2",
        rows: [
          {
            adGroup: { id: "999" },
            adGroupCriterion: { criterionId: "111" },
          },
        ],
      })
      .mockResolvedValueOnce({ requestId: "negative-page-1", rows: [] });

    await removeKeywords(client, {
      criteria: [positive],
      customerId: "1234567890",
      expect: "positive",
    });

    expect(client.search).toHaveBeenCalledTimes(3);
    expect(client.search.mock.calls[1]?.[0]).toMatchObject({
      pageToken: "positive-page-2",
    });
    expect(client.mutate).toHaveBeenCalledOnce();
  });

  it("defaults typed writes to validation mode and requires explicit execution", async () => {
    const client = clientWithScopes([
      { adGroupId: "999", criterionId: "111", negative: false },
    ]);

    await removeKeywords(client, {
      criteria: [positive],
      customerId: "1234567890",
      expect: "positive",
    });

    expect(client.mutate).toHaveBeenLastCalledWith({
      customerId: "1234567890",
      operations: expect.any(Array),
      partialFailure: false,
      validateOnly: true,
    });

    await removeKeywords(client, {
      criteria: [positive],
      customerId: "1234567890",
      expect: "positive",
      mode: "execute",
    });

    expect(client.mutate).toHaveBeenLastCalledWith({
      customerId: "1234567890",
      operations: expect.any(Array),
      partialFailure: false,
      validateOnly: false,
    });
  });
});
