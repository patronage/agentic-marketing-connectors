import { describe, expect, it, vi } from "vitest";

import type { GoogleAdsClient } from "../rest/index.js";
import {
  buildCreateCustomConversionGoalOperations,
  buildCreateUploadClickConversionActionOperations,
  buildUpdateCustomConversionGoalOperations,
  buildUpdateConversionActionOperations,
  buildUpdateConversionGoalOperations,
  createCustomConversionGoals,
  createUploadClickConversionActions,
  getCampaignConversionGoals,
  getConversionActions,
  getCustomerConversionGoals,
  normalizeCampaignConversionGoalRow,
  normalizeConversionActionRow,
  normalizeCustomerConversionGoalRow,
  updateConversionActions,
  updateConversionGoals,
  updateCustomConversionGoals,
} from "./conversion-goals.js";

describe("conversion action and goal workflow", () => {
  it("builds customer-scoped custom conversion goal creates", () => {
    expect(
      buildCreateCustomConversionGoalOperations({
        customConversionGoals: [
          {
            conversionActionIds: ["111", "222"],
            name: "  Qualified leads  ",
          },
        ],
        customerId: "123-456-7890",
      })
    ).toStrictEqual([
      {
        customConversionGoalOperation: {
          create: {
            conversionActions: [
              "customers/1234567890/conversionActions/111",
              "customers/1234567890/conversionActions/222",
            ],
            name: "Qualified leads",
          },
        },
      },
    ]);
  });

  it("rejects invalid custom conversion goal creates locally", () => {
    expect(() =>
      buildCreateCustomConversionGoalOperations({
        customConversionGoals: [],
        customerId: "bad",
      })
    ).toThrow("customerId");

    expect(() =>
      buildCreateCustomConversionGoalOperations({
        customConversionGoals: [],
        customerId: "1234567890",
      })
    ).toThrow("At least one custom conversion goal");

    expect(() =>
      buildCreateCustomConversionGoalOperations({
        customConversionGoals: [{ conversionActionIds: ["111"], name: " " }],
        customerId: "1234567890",
      })
    ).toThrow("name must not be empty");

    expect(() =>
      buildCreateCustomConversionGoalOperations({
        customConversionGoals: [
          { conversionActionIds: ["111"], name: "Qualified leads" },
          { conversionActionIds: ["222"], name: " Qualified leads " },
        ],
        customerId: "1234567890",
      })
    ).toThrow("duplicate custom conversion goal name");

    expect(() =>
      buildCreateCustomConversionGoalOperations({
        customConversionGoals: [
          { conversionActionIds: [], name: "Qualified leads" },
        ],
        customerId: "1234567890",
      })
    ).toThrow("conversionActionIds must not be empty");

    expect(() =>
      buildCreateCustomConversionGoalOperations({
        customConversionGoals: [
          { conversionActionIds: ["bad"], name: "Qualified leads" },
        ],
        customerId: "1234567890",
      })
    ).toThrow("conversionActionIds[0]");

    expect(() =>
      buildCreateCustomConversionGoalOperations({
        customConversionGoals: [
          {
            conversionActionIds: ["111", "111"],
            name: "Qualified leads",
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("duplicate conversionActionId");
  });

  it("validates custom conversion goal creates through mutate", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>().mockResolvedValue({
        mutateOperationResponses: [],
        requestId: "req",
      }),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };
    const input = {
      customConversionGoals: [
        { conversionActionIds: ["111"], name: "Qualified leads" },
      ],
      customerId: "123-456-7890",
      partialFailure: true,
    };

    await expect(
      createCustomConversionGoals(client, input)
    ).resolves.toStrictEqual({
      mutateOperationResponses: [],
      requestId: "req",
    });
    expect(client.mutate).toHaveBeenCalledExactlyOnceWith({
      customerId: "1234567890",
      operations: [
        {
          customConversionGoalOperation: {
            create: {
              conversionActions: ["customers/1234567890/conversionActions/111"],
              name: "Qualified leads",
            },
          },
        },
      ],
      partialFailure: true,
      validateOnly: true,
    });

    await expect(
      createCustomConversionGoals(client, { ...input, mode: "execute" })
    ).rejects.toThrow("conversion-goal baseline checks");
    expect(client.mutate).toHaveBeenCalledOnce();
  });

  it("builds custom conversion goal updates with exact masks", () => {
    expect(
      buildUpdateCustomConversionGoalOperations({
        customConversionGoals: [
          {
            conversionActionIds: ["111", "222"],
            customConversionGoalId: "333",
            name: "  Qualified donors  ",
            status: "ENABLED",
          },
        ],
        customerId: "123-456-7890",
      })
    ).toStrictEqual([
      {
        customConversionGoalOperation: {
          update: {
            conversionActions: [
              "customers/1234567890/conversionActions/111",
              "customers/1234567890/conversionActions/222",
            ],
            name: "Qualified donors",
            resourceName: "customers/1234567890/customConversionGoals/333",
            status: "ENABLED",
          },
          updateMask: "name,conversion_actions,status",
        },
      },
    ]);
  });

  it("rejects invalid custom conversion goal updates locally", () => {
    expect(() =>
      buildUpdateCustomConversionGoalOperations({
        customConversionGoals: [],
        customerId: "bad",
      })
    ).toThrow("customerId");

    expect(() =>
      buildUpdateCustomConversionGoalOperations({
        customConversionGoals: [],
        customerId: "1234567890",
      })
    ).toThrow("At least one custom conversion goal update");

    expect(() =>
      buildUpdateCustomConversionGoalOperations({
        customConversionGoals: [{ customConversionGoalId: "bad", name: "A" }],
        customerId: "1234567890",
      })
    ).toThrow("customConversionGoalId");

    expect(() =>
      buildUpdateCustomConversionGoalOperations({
        customConversionGoals: [
          { customConversionGoalId: "333", name: "A" },
          { customConversionGoalId: "333", name: "B" },
        ],
        customerId: "1234567890",
      })
    ).toThrow("duplicate customConversionGoalId");

    expect(() =>
      buildUpdateCustomConversionGoalOperations({
        customConversionGoals: [{ customConversionGoalId: "333", name: " " }],
        customerId: "1234567890",
      })
    ).toThrow("name must not be empty");

    expect(() =>
      buildUpdateCustomConversionGoalOperations({
        customConversionGoals: [
          { customConversionGoalId: "333", name: "Qualified donors" },
          { customConversionGoalId: "444", name: " Qualified donors " },
        ],
        customerId: "1234567890",
      })
    ).toThrow("duplicate custom conversion goal name");

    expect(() =>
      buildUpdateCustomConversionGoalOperations({
        customConversionGoals: [
          { conversionActionIds: [], customConversionGoalId: "333" },
        ],
        customerId: "1234567890",
      })
    ).toThrow("conversionActionIds must not be empty");

    expect(() =>
      buildUpdateCustomConversionGoalOperations({
        customConversionGoals: [
          { conversionActionIds: ["bad"], customConversionGoalId: "333" },
        ],
        customerId: "1234567890",
      })
    ).toThrow("conversionActionIds[0]");

    expect(() =>
      buildUpdateCustomConversionGoalOperations({
        customConversionGoals: [
          {
            conversionActionIds: ["111", "111"],
            customConversionGoalId: "333",
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("duplicate conversionActionId");

    expect(() =>
      buildUpdateCustomConversionGoalOperations({
        customConversionGoals: [
          { customConversionGoalId: "333", status: "UNKNOWN" as "ENABLED" },
        ],
        customerId: "1234567890",
      })
    ).toThrow("Unsupported custom conversion goal status");

    expect(() =>
      buildUpdateCustomConversionGoalOperations({
        customConversionGoals: [{ customConversionGoalId: "333" }],
        customerId: "1234567890",
      })
    ).toThrow("At least one update field");
  });

  it("validates custom conversion goal updates through mutate", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>().mockResolvedValue({
        mutateOperationResponses: [],
        requestId: "req",
      }),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };
    const input = {
      customConversionGoals: [
        { customConversionGoalId: "333", status: "REMOVED" as const },
      ],
      customerId: "123-456-7890",
      partialFailure: true,
    };

    await updateCustomConversionGoals(client, input);
    expect(client.mutate).toHaveBeenCalledExactlyOnceWith({
      customerId: "1234567890",
      operations: [
        {
          customConversionGoalOperation: {
            update: {
              resourceName: "customers/1234567890/customConversionGoals/333",
              status: "REMOVED",
            },
            updateMask: "status",
          },
        },
      ],
      partialFailure: true,
      validateOnly: true,
    });

    await expect(
      updateCustomConversionGoals(client, { ...input, mode: "execute" })
    ).rejects.toThrow("conversion-goal baseline checks");
    expect(client.mutate).toHaveBeenCalledOnce();
  });

  it("builds upload-click conversion action creates", () => {
    expect(
      buildCreateUploadClickConversionActionOperations({
        conversionActions: [
          {
            name: "  Imported donations  ",
            valueSettings: {
              alwaysUseDefaultValue: true,
              defaultValue: 15,
            },
            viewThroughLookbackWindowDays: 15,
          },
        ],
        customerId: "123-456-7890",
      })
    ).toStrictEqual([
      {
        conversionActionOperation: {
          create: {
            category: "DEFAULT",
            name: "Imported donations",
            status: "ENABLED",
            type: "UPLOAD_CLICKS",
            valueSettings: {
              alwaysUseDefaultValue: true,
              defaultValue: 15,
            },
            viewThroughLookbackWindowDays: "15",
          },
        },
      },
    ]);
  });

  it("rejects invalid upload-click conversion action creates locally", () => {
    expect(() =>
      buildCreateUploadClickConversionActionOperations({
        conversionActions: [],
        customerId: "1234567890",
      })
    ).toThrow("At least one upload-click conversion action");

    expect(() =>
      buildCreateUploadClickConversionActionOperations({
        conversionActions: [{ name: " " }],
        customerId: "1234567890",
      })
    ).toThrow("name must not be empty");

    expect(() =>
      buildCreateUploadClickConversionActionOperations({
        conversionActions: [{ name: "Import" }, { name: " Import " }],
        customerId: "1234567890",
      })
    ).toThrow("duplicate conversion action name");

    for (const viewThroughLookbackWindowDays of [0, 1.5, 31]) {
      expect(() =>
        buildCreateUploadClickConversionActionOperations({
          conversionActions: [
            { name: "Import", viewThroughLookbackWindowDays },
          ],
          customerId: "1234567890",
        })
      ).toThrow("integer between 1 and 30");
    }

    expect(() =>
      buildCreateUploadClickConversionActionOperations({
        conversionActions: [
          {
            name: "Import",
            valueSettings: {
              alwaysUseDefaultValue: true,
              defaultValue: Number.POSITIVE_INFINITY,
            },
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("defaultValue must be finite");
  });

  it("validates upload-click conversion action creates through mutate", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>().mockResolvedValue({
        mutateOperationResponses: [],
        requestId: "req",
      }),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };
    const input = {
      conversionActions: [{ name: "Imported donations" }],
      customerId: "123-456-7890",
      partialFailure: true,
    };

    await expect(
      createUploadClickConversionActions(client, input)
    ).resolves.toStrictEqual({
      mutateOperationResponses: [],
      requestId: "req",
    });
    expect(client.mutate).toHaveBeenCalledExactlyOnceWith({
      customerId: "1234567890",
      operations: [
        {
          conversionActionOperation: {
            create: {
              category: "DEFAULT",
              name: "Imported donations",
              status: "ENABLED",
              type: "UPLOAD_CLICKS",
            },
          },
        },
      ],
      partialFailure: true,
      validateOnly: true,
    });

    await expect(
      createUploadClickConversionActions(client, {
        ...input,
        mode: "execute",
      })
    ).rejects.toThrow("conversion-goal baseline checks");
    expect(client.mutate).toHaveBeenCalledOnce();
  });

  it("queries and normalizes conversion actions", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi.fn<GoogleAdsClient["search"]>().mockResolvedValue({
        requestId: "req",
        rows: [
          {
            conversionAction: {
              category: "PURCHASE",
              countingType: "MANY_PER_CLICK",
              id: "111",
              name: "Purchase",
              primaryForGoal: true,
              resourceName: "customers/1234567890/conversionActions/111",
              status: "ENABLED",
              type: "WEBPAGE",
              valueSettings: { defaultValue: "25.5" },
            },
          },
        ],
      }),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await expect(
      getConversionActions(client, {
        customerId: "1234567890",
        status: "ENABLED",
      })
    ).resolves.toStrictEqual([
      {
        category: "PURCHASE",
        countingType: "MANY_PER_CLICK",
        defaultValue: 25.5,
        id: "111",
        name: "Purchase",
        primaryForGoal: true,
        resourceName: "customers/1234567890/conversionActions/111",
        status: "ENABLED",
        type: "WEBPAGE",
      },
    ]);

    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining(
        "WHERE conversion_action.status = 'ENABLED'"
      ),
    });
    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining("FROM conversion_action"),
    });
    expect(client.search).toHaveBeenCalledWith({
      customerId: "1234567890",
      query: expect.stringContaining(
        "conversion_action.value_settings.default_value"
      ),
    });
  });

  it("paginates conversion action reads", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi
        .fn<GoogleAdsClient["search"]>()
        .mockResolvedValueOnce({
          nextPageToken: "page-2",
          requestId: "req-1",
          rows: [
            {
              conversionAction: {
                id: "111",
                name: "First",
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          requestId: "req-2",
          rows: [
            {
              conversionAction: {
                id: "222",
                name: "Second",
              },
            },
          ],
        }),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await expect(
      getConversionActions(client, { customerId: "1234567890" })
    ).resolves.toStrictEqual([
      expect.objectContaining({ id: "111", name: "First" }),
      expect.objectContaining({ id: "222", name: "Second" }),
    ]);

    expect(client.search).toHaveBeenNthCalledWith(2, {
      customerId: "1234567890",
      pageToken: "page-2",
      query: expect.stringContaining("conversion_action.status != 'REMOVED'"),
    });
  });

  it("queries customer and campaign conversion goals", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi
        .fn<GoogleAdsClient["search"]>()
        .mockResolvedValueOnce({
          requestId: "req-1",
          rows: [
            {
              customerConversionGoal: {
                biddable: true,
                category: "PURCHASE",
                origin: "WEBSITE",
                resourceName:
                  "customers/1234567890/customerConversionGoals/PURCHASE~WEBSITE",
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          requestId: "req-2",
          rows: [
            {
              campaign: { id: "333", name: "Search" },
              campaignConversionGoal: {
                biddable: false,
                category: "LEAD",
                origin: "WEBSITE",
                resourceName:
                  "customers/1234567890/campaignConversionGoals/333~LEAD~WEBSITE",
              },
            },
          ],
        }),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await expect(
      getCustomerConversionGoals(client, { customerId: "1234567890" })
    ).resolves.toStrictEqual([
      {
        biddable: true,
        campaignId: null,
        campaignName: null,
        category: "PURCHASE",
        origin: "WEBSITE",
        resourceName:
          "customers/1234567890/customerConversionGoals/PURCHASE~WEBSITE",
        scope: "customer",
      },
    ]);

    await expect(
      getCampaignConversionGoals(client, {
        campaignId: "333",
        customerId: "1234567890",
      })
    ).resolves.toStrictEqual([
      {
        biddable: false,
        campaignId: "333",
        campaignName: "Search",
        category: "LEAD",
        origin: "WEBSITE",
        resourceName:
          "customers/1234567890/campaignConversionGoals/333~LEAD~WEBSITE",
        scope: "campaign",
      },
    ]);

    expect(client.search).toHaveBeenNthCalledWith(1, {
      customerId: "1234567890",
      query: expect.stringContaining("FROM customer_conversion_goal"),
    });
    expect(client.search).toHaveBeenNthCalledWith(2, {
      customerId: "1234567890",
      query: expect.stringContaining("WHERE campaign.id = 333"),
    });
  });

  it("builds conversion action update operations with exact masks", () => {
    expect(
      buildUpdateConversionActionOperations({
        conversionActions: [
          {
            conversionActionId: "111",
            countingType: "ONE_PER_CLICK",
            defaultValue: 12.5,
            name: "Lead",
            primaryForGoal: true,
            status: "REMOVED",
          },
        ],
        customerId: "123-456-7890",
      })
    ).toStrictEqual([
      {
        conversionActionOperation: {
          update: {
            countingType: "ONE_PER_CLICK",
            name: "Lead",
            primaryForGoal: true,
            resourceName: "customers/1234567890/conversionActions/111",
            status: "REMOVED",
            valueSettings: { defaultValue: 12.5 },
          },
          updateMask:
            "name,status,primary_for_goal,counting_type,value_settings.default_value",
        },
      },
    ]);
  });

  it("builds customer and campaign conversion goal biddable updates", () => {
    expect(
      buildUpdateConversionGoalOperations({
        conversionGoals: [
          {
            biddable: false,
            category: "PURCHASE",
            origin: "WEBSITE",
            scope: "customer",
          },
          {
            biddable: true,
            campaignId: "333",
            category: "LEAD",
            origin: "WEBSITE",
            scope: "campaign",
          },
        ],
        customerId: "1234567890",
      })
    ).toStrictEqual([
      {
        customerConversionGoalOperation: {
          update: {
            biddable: false,
            resourceName:
              "customers/1234567890/customerConversionGoals/PURCHASE~WEBSITE",
          },
          updateMask: "biddable",
        },
      },
      {
        campaignConversionGoalOperation: {
          update: {
            biddable: true,
            resourceName:
              "customers/1234567890/campaignConversionGoals/333~LEAD~WEBSITE",
          },
          updateMask: "biddable",
        },
      },
    ]);
  });

  it("rejects unsafe or ambiguous conversion action updates locally", () => {
    expect(() =>
      buildUpdateConversionActionOperations({
        conversionActions: [],
        customerId: "1234567890",
      })
    ).toThrow("At least one conversion action update");

    expect(() =>
      buildUpdateConversionActionOperations({
        conversionActions: [
          { conversionActionId: "111", status: "ENABLED" },
          { conversionActionId: "111", status: "REMOVED" },
        ],
        customerId: "1234567890",
      })
    ).toThrow("duplicate conversionActionId");

    expect(() =>
      buildUpdateConversionActionOperations({
        conversionActions: [{ conversionActionId: "bad", status: "ENABLED" }],
        customerId: "1234567890",
      })
    ).toThrow("conversionActionId");

    expect(() =>
      buildUpdateConversionActionOperations({
        conversionActions: [{ conversionActionId: "111" }],
        customerId: "1234567890",
      })
    ).toThrow("At least one update field");

    expect(() =>
      buildUpdateConversionActionOperations({
        conversionActions: [
          {
            conversionActionId: "111",
            defaultValue: -1,
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("defaultValue");
  });

  it("rejects invalid conversion goal dimensions and duplicates", () => {
    expect(() =>
      buildUpdateConversionGoalOperations({
        conversionGoals: [],
        customerId: "1234567890",
      })
    ).toThrow("At least one conversion goal update");

    expect(() =>
      buildUpdateConversionGoalOperations({
        conversionGoals: [
          {
            biddable: true,
            category: "purchase",
            origin: "WEBSITE",
            scope: "customer",
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("category");

    expect(() =>
      buildUpdateConversionGoalOperations({
        conversionGoals: [
          {
            biddable: true,
            campaignId: "bad",
            category: "PURCHASE",
            origin: "WEBSITE",
            scope: "campaign",
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("campaignId");

    expect(() =>
      buildUpdateConversionGoalOperations({
        conversionGoals: [
          {
            biddable: true,
            category: "PURCHASE",
            origin: "WEBSITE",
            scope: "customer",
          },
          {
            biddable: false,
            category: "PURCHASE",
            origin: "WEBSITE",
            scope: "customer",
          },
        ],
        customerId: "1234567890",
      })
    ).toThrow("duplicate conversion goal");
  });

  it("only allows validate-only conversion mutations until apply guardrails are implemented", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>().mockResolvedValue({
        mutateOperationResponses: [],
        requestId: "req",
      }),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await updateConversionActions(client, {
      conversionActions: [{ conversionActionId: "111", status: "REMOVED" }],
      customerId: "1234567890",
      partialFailure: true,
    });

    expect(client.mutate).toHaveBeenLastCalledWith({
      customerId: "1234567890",
      operations: [
        {
          conversionActionOperation: {
            update: {
              resourceName: "customers/1234567890/conversionActions/111",
              status: "REMOVED",
            },
            updateMask: "status",
          },
        },
      ],
      partialFailure: true,
      validateOnly: true,
    });

    await expect(
      updateConversionGoals(client, {
        conversionGoals: [
          {
            biddable: false,
            category: "PURCHASE",
            origin: "WEBSITE",
            scope: "customer",
          },
        ],
        customerId: "1234567890",
        mode: "execute",
      })
    ).rejects.toThrow("conversion-goal baseline");

    expect(client.mutate).toHaveBeenCalledOnce();
  });

  it("normalizes snake-case rows", () => {
    expect(
      normalizeConversionActionRow({
        conversion_action: {
          counting_type: "ONE_PER_CLICK",
          id: 111,
          primary_for_goal: "false",
          resource_name: "customers/1234567890/conversionActions/111",
          value_settings: { default_value: 0 },
        },
      })
    ).toMatchObject({
      countingType: "ONE_PER_CLICK",
      defaultValue: 0,
      id: "111",
      primaryForGoal: false,
      resourceName: "customers/1234567890/conversionActions/111",
    });

    expect(
      normalizeCustomerConversionGoalRow({
        customer_conversion_goal: {
          biddable: "true",
          category: "PURCHASE",
          origin: "WEBSITE",
          resource_name:
            "customers/1234567890/customerConversionGoals/PURCHASE~WEBSITE",
        },
      })
    ).toMatchObject({
      biddable: true,
      scope: "customer",
    });

    expect(
      normalizeCampaignConversionGoalRow({
        campaign: { id: 333 },
        campaign_conversion_goal: {
          category: "LEAD",
          origin: "WEBSITE",
        },
      })
    ).toMatchObject({
      campaignId: "333",
      campaignName: null,
      scope: "campaign",
    });
  });
});
