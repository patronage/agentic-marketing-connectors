import { describe, expect, it, vi } from "vitest";

import type { GoogleAdsClient } from "../rest/index.js";
import {
  buildUpdateResponsiveSearchAdOperations,
  updateResponsiveSearchAds,
} from "./update-responsive-search-ads.js";

describe("update responsive search ads workflow", () => {
  it("builds ad update operations with exact RSA copy masks", () => {
    expect(
      buildUpdateResponsiveSearchAdOperations({
        ads: [
          {
            adId: "333",
            descriptions: [
              { pinnedField: "DESCRIPTION_1", text: "Support the plan" },
              { text: "Get the facts today" },
            ],
            headlines: [
              { pinnedField: "HEADLINE_1", text: "Clean Energy Now" },
              { text: "Jobs And Savings" },
              { text: "Lower Energy Bills" },
            ],
            path1: "energy",
            path2: "plan",
          },
        ],
        customerId: "123-456-7890",
      })
    ).toStrictEqual([
      {
        adOperation: {
          update: {
            resourceName: "customers/1234567890/ads/333",
            responsiveSearchAd: {
              descriptions: [
                {
                  pinnedField: "DESCRIPTION_1",
                  text: "Support the plan",
                },
                { text: "Get the facts today" },
              ],
              headlines: [
                {
                  pinnedField: "HEADLINE_1",
                  text: "Clean Energy Now",
                },
                { text: "Jobs And Savings" },
                { text: "Lower Energy Bills" },
              ],
              path1: "energy",
              path2: "plan",
            },
          },
          updateMask:
            "responsive_search_ad.headlines,responsive_search_ad.descriptions,responsive_search_ad.path1,responsive_search_ad.path2",
        },
      },
    ]);
  });

  it("supports replacing one complete RSA repeated field", () => {
    expect(
      buildUpdateResponsiveSearchAdOperations({
        ads: [
          {
            adId: "333",
            headlines: [
              { text: "One New Headline" },
              { text: "Second New Headline" },
              { text: "Third New Headline" },
            ],
          },
        ],
        customerId: "1234567890",
      })
    ).toStrictEqual([
      {
        adOperation: {
          update: {
            resourceName: "customers/1234567890/ads/333",
            responsiveSearchAd: {
              headlines: [
                { text: "One New Headline" },
                { text: "Second New Headline" },
                { text: "Third New Headline" },
              ],
            },
          },
          updateMask: "responsive_search_ad.headlines",
        },
      },
    ]);
  });

  it("rejects unsafe or ambiguous copy refreshes locally", () => {
    expect(() =>
      buildUpdateResponsiveSearchAdOperations({
        ads: [],
        customerId: "1234567890",
      })
    ).toThrow("At least one responsive search ad");

    expect(() =>
      buildUpdateResponsiveSearchAdOperations({
        ads: [
          {
            adId: "bad",
            headlines: [{ text: "One" }, { text: "Two" }, { text: "Three" }],
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("adId");

    expect(() =>
      buildUpdateResponsiveSearchAdOperations({
        ads: [
          {
            adId: "333",
            headlines: [{ text: "One" }, { text: "Two" }, { text: "Three" }],
          },
          {
            adId: "333",
            headlines: [
              { text: "Other One" },
              { text: "Other Two" },
              { text: "Other Three" },
            ],
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("duplicate responsive search ad");

    expect(() =>
      buildUpdateResponsiveSearchAdOperations({
        ads: [{ adId: "333" }],
        customerId: "1234567890",
      })
    ).toThrow("At least one update field");

    expect(() =>
      buildUpdateResponsiveSearchAdOperations({
        ads: [
          {
            adId: "333",
            headlines: [{ text: "Same" }, { text: "Same" }, { text: "Third" }],
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("duplicate text");
  });

  it("validates RSA copy limits and path fields", () => {
    expect(() =>
      buildUpdateResponsiveSearchAdOperations({
        ads: [
          {
            adId: "333",
            headlines: [
              { text: "x".repeat(31) },
              { text: "Two" },
              { text: "Three" },
            ],
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("30 characters or fewer");

    expect(() =>
      buildUpdateResponsiveSearchAdOperations({
        ads: [
          {
            adId: "333",
            descriptions: [{ text: "x".repeat(91) }, { text: "Two" }],
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("90 characters or fewer");

    expect(() =>
      buildUpdateResponsiveSearchAdOperations({
        ads: [
          {
            adId: "333",
            path1: "too/long",
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("URL separators");

    expect(() =>
      buildUpdateResponsiveSearchAdOperations({
        ads: [
          {
            adId: "333",
            headlines: [
              {
                pinnedField: "HEADLINE_4" as "HEADLINE_1",
                text: "Pinned",
              },
              { text: "Two" },
              { text: "Three" },
            ],
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("Unsupported pinnedField");
  });

  it("requires complete repeated fields and path1 when setting path2", () => {
    expect(() =>
      buildUpdateResponsiveSearchAdOperations({
        ads: [{ adId: "333", headlines: [{ text: "One" }] }],
        customerId: "1234567890",
      })
    ).toThrow("headlines must include at least 3 assets");

    expect(() =>
      buildUpdateResponsiveSearchAdOperations({
        ads: [{ adId: "333", descriptions: [{ text: "One" }] }],
        customerId: "1234567890",
      })
    ).toThrow("descriptions must include at least 2 assets");

    expect(() =>
      buildUpdateResponsiveSearchAdOperations({
        ads: [{ adId: "333", path2: "plan" }],
        customerId: "1234567890",
      })
    ).toThrow("path2 requires path1");
  });

  it("only allows validate-only writes until creative apply guardrails are implemented", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>().mockResolvedValue({
        mutateOperationResponses: [],
        requestId: "req",
      }),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await updateResponsiveSearchAds(client, {
      ads: [
        {
          adId: "333",
          headlines: [
            { text: "New Headline" },
            { text: "Second Headline" },
            { text: "Third Headline" },
          ],
        },
      ],
      customerId: "1234567890",
      partialFailure: true,
    });

    expect(client.mutate).toHaveBeenLastCalledWith({
      customerId: "1234567890",
      operations: [
        {
          adOperation: {
            update: {
              resourceName: "customers/1234567890/ads/333",
              responsiveSearchAd: {
                headlines: [
                  { text: "New Headline" },
                  { text: "Second Headline" },
                  { text: "Third Headline" },
                ],
              },
            },
            updateMask: "responsive_search_ad.headlines",
          },
        },
      ],
      partialFailure: true,
      validateOnly: true,
    });

    await expect(
      updateResponsiveSearchAds(client, {
        ads: [
          {
            adId: "333",
            headlines: [
              { text: "New Headline" },
              { text: "Second Headline" },
              { text: "Third Headline" },
            ],
          },
        ],
        customerId: "1234567890",
        mode: "execute",
      })
    ).rejects.toThrow("creative approval");

    expect(client.mutate).toHaveBeenCalledOnce();
  });
});
