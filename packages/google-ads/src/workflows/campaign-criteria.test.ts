import { describe, expect, it, vi } from "vitest";

import type { GoogleAdsClient } from "../rest/index.js";
import {
  buildCampaignCriterionOperations,
  updateCampaignCriteria,
} from "./campaign-criteria.js";

describe("campaign criteria workflow", () => {
  it("builds ad schedule and device bid modifier criteria", () => {
    expect(
      buildCampaignCriterionOperations({
        criteria: [
          {
            campaignId: "22",
            dayOfWeek: "MONDAY",
            endHour: 17,
            endMinute: "THIRTY",
            startHour: 8,
            startMinute: "FIFTEEN",
            type: "adSchedule",
          },
          {
            bidModifier: 0,
            criterionResourceName:
              "customers/1234567890/campaignCriteria/22~30001",
            type: "deviceBidModifier",
          },
        ],
        customerId: "123-456-7890",
      })
    ).toStrictEqual([
      {
        campaignCriterionOperation: {
          create: {
            adSchedule: {
              dayOfWeek: "MONDAY",
              endHour: 17,
              endMinute: "THIRTY",
              startHour: 8,
              startMinute: "FIFTEEN",
            },
            campaign: "customers/1234567890/campaigns/22",
          },
        },
      },
      {
        campaignCriterionOperation: {
          update: {
            bidModifier: 0,
            resourceName: "customers/1234567890/campaignCriteria/22~30001",
          },
          updateMask: "bid_modifier",
        },
      },
    ]);
  });

  it("builds placement, topic, and brand-list criteria", () => {
    expect(
      buildCampaignCriterionOperations({
        criteria: [
          {
            campaignId: "22",
            type: "placementExclusion",
            url: "  example.com  ",
          },
          {
            campaignId: "22",
            topicConstant: "topicConstants/42",
            type: "topicExclusion",
          },
          {
            campaignId: "22",
            negative: false,
            sharedSet: "customers/1234567890/sharedSets/99",
            type: "brandList",
          },
        ],
        customerId: "1234567890",
      })
    ).toStrictEqual([
      {
        campaignCriterionOperation: {
          create: {
            campaign: "customers/1234567890/campaigns/22",
            negative: true,
            placement: { url: "example.com" },
          },
        },
      },
      {
        campaignCriterionOperation: {
          create: {
            campaign: "customers/1234567890/campaigns/22",
            negative: true,
            topic: { topicConstant: "topicConstants/42" },
          },
        },
      },
      {
        campaignCriterionOperation: {
          create: {
            brandList: {
              sharedSet: "customers/1234567890/sharedSets/99",
            },
            campaign: "customers/1234567890/campaigns/22",
            negative: false,
          },
        },
      },
    ]);
  });

  it("rejects invalid and duplicate criteria locally", () => {
    expect(() =>
      buildCampaignCriterionOperations({ criteria: [], customerId: "123" })
    ).toThrow("At least one campaign criterion");

    expect(() =>
      buildCampaignCriterionOperations({
        criteria: [
          {
            campaignId: "22",
            dayOfWeek: "MONDAY",
            endHour: 8,
            endMinute: "ZERO",
            startHour: 8,
            startMinute: "ZERO",
            type: "adSchedule",
          },
        ],
        customerId: "123",
      })
    ).toThrow("end time must be after start time");

    expect(() =>
      buildCampaignCriterionOperations({
        criteria: [
          {
            bidModifier: 0.01,
            criterionResourceName: "customers/123/campaignCriteria/22~30001",
            type: "deviceBidModifier",
          },
        ],
        customerId: "123",
      })
    ).toThrow("bidModifier");

    expect(() =>
      buildCampaignCriterionOperations({
        criteria: [
          {
            campaignId: "22",
            type: "placementExclusion",
            url: "adsenseformobileapps.com",
          },
        ],
        customerId: "123",
      })
    ).toThrow("not a supported placement");

    expect(() =>
      buildCampaignCriterionOperations({
        criteria: [
          {
            campaignId: "22",
            negative: true,
            sharedSet: "customers/999/sharedSets/99",
            type: "brandList",
          },
        ],
        customerId: "123",
      })
    ).toThrow("must belong to customer");

    const duplicate = {
      campaignId: "22",
      type: "placementExclusion" as const,
      url: "example.com",
    };
    expect(() =>
      buildCampaignCriterionOperations({
        criteria: [duplicate, duplicate],
        customerId: "123",
      })
    ).toThrow("duplicate campaign criterion");
  });

  it("always performs provider validation and rejects execute mode", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>().mockResolvedValue({
        mutateOperationResponses: [],
        requestId: "req",
      }),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };
    const input = {
      criteria: [
        {
          campaignId: "22",
          type: "placementExclusion" as const,
          url: "example.com",
        },
      ],
      customerId: "123-456-7890",
      partialFailure: true,
    };

    await updateCampaignCriteria(client, input);

    expect(client.mutate).toHaveBeenCalledExactlyOnceWith({
      customerId: "1234567890",
      operations: [
        {
          campaignCriterionOperation: {
            create: {
              campaign: "customers/1234567890/campaigns/22",
              negative: true,
              placement: { url: "example.com" },
            },
          },
        },
      ],
      partialFailure: true,
      validateOnly: true,
    });

    await expect(
      updateCampaignCriteria(client, { ...input, mode: "execute" })
    ).rejects.toThrow("targeting review");
    expect(client.mutate).toHaveBeenCalledOnce();
  });
});
