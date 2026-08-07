import { describe, expect, it, vi } from "vitest";

import type { GoogleAdsClient } from "../rest/index.js";
import {
  buildAudienceSegmentOperations,
  updateAudienceSegments,
} from "./audience-segments.js";

describe("audience segments workflow", () => {
  it("builds conversion-backed user lists and ad group attachments", () => {
    expect(
      buildAudienceSegmentOperations({
        attachments: [
          {
            adGroupId: "222",
            bidModifier: 1.25,
            status: "PAUSED",
            userListResourceName: "customers/1234567890/userLists/333",
          },
        ],
        customerId: "123-456-7890",
        userLists: [
          {
            conversionActionIds: ["111", "112"],
            description: "  People who completed an action  ",
            membershipLifeSpan: 365,
            name: "  Completed actions  ",
          },
        ],
      })
    ).toStrictEqual([
      {
        userListOperation: {
          create: {
            basicUserList: {
              actions: [
                {
                  conversionAction:
                    "customers/1234567890/conversionActions/111",
                },
                {
                  conversionAction:
                    "customers/1234567890/conversionActions/112",
                },
              ],
            },
            description: "People who completed an action",
            membershipLifeSpan: "365",
            membershipStatus: "OPEN",
            name: "Completed actions",
          },
        },
      },
      {
        adGroupCriterionOperation: {
          create: {
            adGroup: "customers/1234567890/adGroups/222",
            bidModifier: 1.25,
            status: "PAUSED",
            userList: {
              userList: "customers/1234567890/userLists/333",
            },
          },
        },
      },
    ]);
  });

  it("rejects invalid user lists and attachments locally", () => {
    expect(() =>
      buildAudienceSegmentOperations({
        customerId: "1234567890",
      })
    ).toThrow("At least one user list create or ad group attachment");

    expect(() =>
      buildAudienceSegmentOperations({
        customerId: "1234567890",
        userLists: [
          {
            conversionActionIds: ["111"],
            membershipLifeSpan: 30,
            name: "   ",
          },
        ],
      })
    ).toThrow("name");

    for (const membershipLifeSpan of [-1, 30.5, 541]) {
      expect(() =>
        buildAudienceSegmentOperations({
          customerId: "1234567890",
          userLists: [
            {
              conversionActionIds: ["111"],
              membershipLifeSpan,
              name: "Audience",
            },
          ],
        })
      ).toThrow("between 0 and 540");
    }

    expect(() =>
      buildAudienceSegmentOperations({
        customerId: "1234567890",
        userLists: [
          {
            conversionActionIds: [],
            membershipLifeSpan: 30,
            name: "Audience",
          },
        ],
      })
    ).toThrow("conversionActionIds must not be empty");

    expect(() =>
      buildAudienceSegmentOperations({
        customerId: "1234567890",
        userLists: [
          {
            conversionActionIds: ["bad"],
            membershipLifeSpan: 30,
            name: "Audience",
          },
        ],
      })
    ).toThrow("conversionActionIds[0]");

    expect(() =>
      buildAudienceSegmentOperations({
        attachments: [
          {
            adGroupId: "222",
            userListResourceName: "customers/9999999999/userLists/333",
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("must belong to customer 1234567890");

    expect(() =>
      buildAudienceSegmentOperations({
        attachments: [
          {
            adGroupId: "bad",
            userListResourceName: "customers/1234567890/userLists/333",
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("adGroupId");

    expect(() =>
      buildAudienceSegmentOperations({
        attachments: [
          {
            adGroupId: "222",
            bidModifier: 10.1,
            userListResourceName: "customers/1234567890/userLists/333",
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("bidModifier");

    expect(() =>
      buildAudienceSegmentOperations({
        attachments: [
          {
            adGroupId: "222",
            bidModifier: 1.2,
            negative: true,
            userListResourceName: "customers/1234567890/userLists/333",
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("not supported for negative criteria");
  });

  it("calls the shared mutate client in validate-only mode", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>().mockResolvedValue({
        mutateOperationResponses: [],
        requestId: "req",
      }),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await expect(
      updateAudienceSegments(client, {
        attachments: [
          {
            adGroupId: "222",
            negative: true,
            userListResourceName: "customers/1234567890/userLists/333",
          },
        ],
        customerId: "123-456-7890",
        partialFailure: true,
      })
    ).resolves.toStrictEqual({
      mutateOperationResponses: [],
      requestId: "req",
    });

    expect(client.mutate).toHaveBeenCalledExactlyOnceWith({
      customerId: "1234567890",
      operations: [
        {
          adGroupCriterionOperation: {
            create: {
              adGroup: "customers/1234567890/adGroups/222",
              negative: true,
              userList: {
                userList: "customers/1234567890/userLists/333",
              },
            },
          },
        },
      ],
      partialFailure: true,
      validateOnly: true,
    });

    await expect(
      updateAudienceSegments(client, {
        attachments: [
          {
            adGroupId: "222",
            userListResourceName: "customers/1234567890/userLists/333",
          },
        ],
        customerId: "1234567890",
        mode: "execute",
      })
    ).rejects.toThrow("audience eligibility");

    expect(client.mutate).toHaveBeenCalledOnce();
  });
});
