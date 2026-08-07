import { verifyMutationLifecycleImplementationConformance } from "@patronage/connector-lifecycle";
import { describe, expect, it, vi } from "vitest";

import {
  CampaignBriefParseError,
  parseCampaignBrief,
  validateCampaignBrief,
} from "../deploy/parse-brief.js";
import type { CampaignBrief } from "../deploy/types.js";
import type { GoogleAdsClient } from "../rest/index.js";
import { GoogleAdsRequestError } from "../rest/index.js";
import {
  buildDeployCampaignOperations,
  deployCampaign,
  planDeployCampaign,
  runDeployCampaignLifecycle,
} from "./deploy-campaign.js";

const brief: CampaignBrief = {
  ad_groups: [
    {
      ads: [
        {
          descriptions: [
            "Support local families today.",
            "Double your impact now.",
          ],
          final_url: "https://example.com/issues/housing",
          headlines: [
            "Example Community Fund",
            "Donation Match",
            "Local Programs",
          ],
          path_1: "housing",
        },
      ],
      keywords: [
        { match_type: "PHRASE", text: "example community fund housing" },
      ],
      name: "Housing",
      negative_keywords: [{ match_type: "EXACT", text: "jobs" }],
      theme: "Housing support",
    },
  ],
  campaign_negative_keywords: [{ match_type: "PHRASE", text: "mayor" }],
  extensions: {
    callouts: ["Climate action"],
    sitelinks: [{ link_text: "Housing", path: "/issues/housing" }],
    structured_snippets: [{ header: "Types", values: ["Housing", "Climate"] }],
  },
  frontmatter: {
    bidding: "maximize-conversions",
    budget_daily: 50,
    campaign_name: "Search Housing",
    campaign_type: "SEARCH",
    client: "example-nonprofit",
    end_date: "2026-06-30",
    geographic_targets: ["2840"],
    language: "English",
    start_date: "2026-06-01",
  },
  objective: "Promote local housing support.",
};

describe("deploy campaign workflow", () => {
  it("builds one batched REST mutate using temp resource names", () => {
    const operations = buildDeployCampaignOperations({
      brief,
      customerId: "123-456-7890",
      status: "PAUSED",
    });

    expect(operations).toStrictEqual([
      {
        campaignBudgetOperation: {
          create: expect.objectContaining({
            amountMicros: 50_000_000,
            resourceName: "customers/1234567890/campaignBudgets/-1",
          }),
        },
      },
      {
        campaignOperation: {
          create: expect.objectContaining({
            campaignBudget: "customers/1234567890/campaignBudgets/-1",
            endDateTime: "2026-06-30 23:59:59",
            resourceName: "customers/1234567890/campaigns/-2",
            startDateTime: "2026-06-01 00:00:00",
            status: "PAUSED",
          }),
        },
      },
      expect.objectContaining({
        campaignCriterionOperation: expect.any(Object),
      }),
      expect.objectContaining({
        campaignCriterionOperation: expect.any(Object),
      }),
      expect.objectContaining({
        campaignCriterionOperation: expect.any(Object),
      }),
      {
        adGroupOperation: {
          create: expect.objectContaining({
            campaign: "customers/1234567890/campaigns/-2",
            resourceName: "customers/1234567890/adGroups/-10",
          }),
        },
      },
      {
        adGroupCriterionOperation: {
          create: expect.objectContaining({
            adGroup: "customers/1234567890/adGroups/-10",
            keyword: {
              matchType: "PHRASE",
              text: "example community fund housing",
            },
          }),
        },
      },
      {
        adGroupCriterionOperation: {
          create: expect.objectContaining({
            adGroup: "customers/1234567890/adGroups/-10",
            negative: true,
          }),
        },
      },
      {
        adGroupAdOperation: {
          create: expect.objectContaining({
            adGroup: "customers/1234567890/adGroups/-10",
          }),
        },
      },
      expect.objectContaining({ assetOperation: expect.any(Object) }),
      expect.objectContaining({ campaignAssetOperation: expect.any(Object) }),
      expect.objectContaining({ assetOperation: expect.any(Object) }),
      expect.objectContaining({ campaignAssetOperation: expect.any(Object) }),
      expect.objectContaining({ assetOperation: expect.any(Object) }),
      expect.objectContaining({ campaignAssetOperation: expect.any(Object) }),
    ]);
  });

  it("maps brief dates onto the v24 campaign datetime fields", () => {
    const operations = buildDeployCampaignOperations({
      brief,
      customerId: "123-456-7890",
      status: "PAUSED",
    }) as { campaignOperation?: { create: Record<string, unknown> } }[];

    const campaignCreate = operations.find(
      (operation) => operation.campaignOperation
    )?.campaignOperation?.create;
    expect(campaignCreate).toBeDefined();
    expect(campaignCreate?.startDateTime).toBe("2026-06-01 00:00:00");
    expect(campaignCreate?.endDateTime).toBe("2026-06-30 23:59:59");
    expect(campaignCreate).not.toHaveProperty("startDate");
    expect(campaignCreate).not.toHaveProperty("endDate");
  });

  it.each([
    ["manual-cpc", { manualCpc: { enhancedCpcEnabled: false } }, 1_500_000],
    ["maximize-clicks", { targetSpend: {} }, undefined],
    [
      "maximize-conversions",
      { maximizeConversions: { targetCpaMicros: "0" } },
      undefined,
    ],
  ] as const)(
    "builds the %s strategy and only gives Manual CPC ad groups a CPC bid",
    (bidding, expectedStrategy, expectedCpcBidMicros) => {
      const operations = buildDeployCampaignOperations({
        brief: { ...brief, frontmatter: { ...brief.frontmatter, bidding } },
        customerId: "1234567890",
        status: "PAUSED",
      }) as {
        adGroupOperation?: { create: Record<string, unknown> };
        campaignOperation?: { create: Record<string, unknown> };
      }[];

      const campaign = operations.find(
        (operation) => operation.campaignOperation
      )?.campaignOperation?.create;
      const adGroup = operations.find((operation) => operation.adGroupOperation)
        ?.adGroupOperation?.create;

      expect(campaign).toMatchObject(expectedStrategy);
      expect(adGroup).toBeDefined();
      expect(adGroup?.cpcBidMicros).toBe(expectedCpcBidMicros);
    }
  );

  it("emits the Maximize Clicks CPC ceiling when the brief sets max_cpc", () => {
    const operations = buildDeployCampaignOperations({
      brief: {
        ...brief,
        frontmatter: {
          ...brief.frontmatter,
          bidding: "maximize-clicks",
          max_cpc: 2,
        },
      },
      customerId: "1234567890",
      status: "PAUSED",
    }) as { campaignOperation?: { create: Record<string, unknown> } }[];

    const campaign = operations.find((operation) => operation.campaignOperation)
      ?.campaignOperation?.create;
    expect(campaign).toMatchObject({
      targetSpend: { cpcBidCeilingMicros: "2000000" },
    });
  });

  it.each(["manual-cpc", "maximize-clicks", "maximize-conversions"] as const)(
    "accepts %s as a Campaign Brief bidding strategy",
    (bidding) => {
      expect(
        validateCampaignBrief({
          ...brief,
          frontmatter: { ...brief.frontmatter, bidding },
        })
      ).not.toContainEqual(
        expect.objectContaining({ path: "frontmatter.bidding" })
      );
    }
  );

  it("reports an unsupported Campaign Brief bidding strategy", () => {
    expect(
      validateCampaignBrief({
        ...brief,
        frontmatter: {
          ...brief.frontmatter,
          bidding: "target-roas" as never,
        },
      })
    ).toContainEqual({
      message:
        "Bidding strategy must be one of: maximize-conversions, maximize-clicks, manual-cpc",
      path: "frontmatter.bidding",
    });
  });

  it("returns a human summary for CLI plan output", () => {
    expect(
      planDeployCampaign({
        brief,
        customerId: "1234567890",
        status: "PAUSED",
      }).summary
    ).toStrictEqual({
      adGroups: 1,
      ads: 1,
      bidding: "maximize-conversions",
      campaignNegativeKeywords: 1,
      callouts: 1,
      keywords: 1,
      negativeKeywords: 1,
      sitelinks: 1,
      structuredSnippets: 1,
    });
  });

  it("defaults package deployment to validate mode", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>().mockResolvedValue({
        mutateOperationResponses: [],
        requestId: "req",
      }),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await deployCampaign(client, {
      brief,
      customerId: "1234567890",
      status: "PAUSED",
    });

    expect(client.mutate).toHaveBeenCalledWith({
      customerId: "1234567890",
      operations: expect.any(Array),
      validateOnly: true,
    });
  });

  it("crosses plan, provider validation, and execution with a JSON receipt", async () => {
    const client = {
      mutate: vi
        .fn<GoogleAdsClient["mutate"]>()
        .mockResolvedValueOnce({
          mutateOperationResponses: [],
          requestId: "validate-request",
        })
        .mockResolvedValueOnce({
          mutateOperationResponses: [
            {
              campaignResult: {
                resourceName: "customers/1234567890/campaigns/9",
              },
            },
            {
              labelResult: {
                resourceName: "customers/1234567890/labels/10",
              },
            },
          ],
          requestId: "execute-request",
        }),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    const result = await runDeployCampaignLifecycle(
      client,
      { brief, customerId: "1234567890", status: "PAUSED" },
      { operationId: "deploy-1", targetStage: "executed" }
    );

    expect(result.receipt).toMatchObject({
      operationId: "deploy-1",
      operationKind: "campaign.deploy",
      provider: "google-ads",
      stage: "executed",
      status: "succeeded",
      steps: [
        { key: "local-plan", status: "succeeded" },
        {
          key: "provider-validation",
          providerRequestId: "validate-request",
          status: "succeeded",
        },
        {
          key: "execution",
          providerRequestId: "execute-request",
          providerResourceIds: ["customers/1234567890/campaigns/9"],
          status: "succeeded",
        },
        {
          key: "operation-label-cleanup",
          providerResourceIds: ["customers/1234567890/labels/10"],
          status: "pending",
        },
      ],
    });
    // oxlint-disable-next-line unicorn/prefer-structured-clone, react-doctor/no-json-parse-stringify-clone -- JSON persistence round-trip is the contract under test.
    expect(JSON.parse(JSON.stringify(result.receipt))).toStrictEqual(
      result.receipt
    );
    expect(
      client.mutate.mock.calls.map(([input]) => input.validateOnly)
    ).toStrictEqual([true, false]);
    const lifecycleOperations = client.mutate.mock.calls[0]?.[0].operations;
    expect(lifecycleOperations).toStrictEqual(
      expect.arrayContaining([
        {
          labelOperation: {
            create: {
              name: "patronage:deploy-1",
              resourceName: "customers/1234567890/labels/-3",
            },
          },
        },
        {
          campaignLabelOperation: {
            create: {
              campaign: "customers/1234567890/campaigns/-2",
              label: "customers/1234567890/labels/-3",
            },
          },
        },
      ])
    );
    const campaignCreate = lifecycleOperations?.find(
      (operation) =>
        typeof operation === "object" &&
        operation !== null &&
        "campaignOperation" in operation
    ) as { campaignOperation: { create: { name: string } } } | undefined;
    expect(campaignCreate?.campaignOperation.create.name).toBe(
      "Search Housing"
    );
  });

  it("preserves an opaque campaign result identifier as execution evidence", async () => {
    const client = {
      mutate: vi
        .fn<GoogleAdsClient["mutate"]>()
        .mockResolvedValueOnce({
          mutateOperationResponses: [],
          requestId: "validate-request",
        })
        .mockResolvedValueOnce({
          mutateOperationResponses: [
            {
              campaignResult: {
                resourceName: "customers/1234567890/campaigns/fixture-1",
              },
            },
          ],
          requestId: "execute-request",
        }),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    const result = await runDeployCampaignLifecycle(
      client,
      { brief, customerId: "1234567890", status: "PAUSED" },
      { operationId: "opaque-result", targetStage: "executed" }
    );

    expect(result.receipt).toMatchObject({
      stage: "executed",
      status: "succeeded",
      steps: [
        {},
        {},
        {
          providerResourceIds: ["customers/1234567890/campaigns/fixture-1"],
          status: "succeeded",
        },
        { key: "operation-label-cleanup", status: "pending" },
      ],
    });
  });

  it("records label cleanup failure without failing a live deployment", async () => {
    const executeClient = createLifecycleClient();
    vi.mocked(executeClient.mutate)
      .mockResolvedValueOnce({
        mutateOperationResponses: [],
        requestId: "validate-request",
      })
      .mockResolvedValueOnce({
        mutateOperationResponses: [
          {
            campaignResult: {
              resourceName: "customers/1234567890/campaigns/9",
            },
          },
          {
            labelResult: {
              resourceName: "customers/1234567890/labels/10",
            },
          },
        ],
        requestId: "execute-request",
      });

    const executed = await runDeployCampaignLifecycle(
      executeClient,
      { brief, customerId: "1234567890", status: "PAUSED" },
      { operationId: "cleanup-failure", targetStage: "executed" }
    );
    const cleanupClient = createLifecycleClient();
    vi.mocked(cleanupClient.mutate).mockRejectedValueOnce(
      new Error("label cleanup rejected")
    );
    const result = await runDeployCampaignLifecycle(
      cleanupClient,
      { brief, customerId: "1234567890", status: "PAUSED" },
      {
        operationId: "cleanup-failure",
        resumeReceipt: executed.receipt,
        targetStage: "executed",
      }
    );

    expect(result.receipt).toMatchObject({
      status: "succeeded",
      steps: [
        {},
        {},
        {},
        {
          attempted: true,
          failureDetail: "label cleanup rejected",
          key: "operation-label-cleanup",
          status: "failed",
        },
      ],
    });
  });

  it("rejects resume when the campaign plan has changed", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>().mockResolvedValue({
        mutateOperationResponses: [],
        requestId: "validate-request",
      }),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };
    const validated = await runDeployCampaignLifecycle(
      client,
      { brief, customerId: "1234567890", status: "PAUSED" },
      { operationId: "deploy-1", targetStage: "provider-validated" }
    );

    await expect(
      runDeployCampaignLifecycle(
        client,
        {
          brief: {
            ...brief,
            frontmatter: { ...brief.frontmatter, budget_daily: 51 },
          },
          customerId: "1234567890",
          status: "PAUSED",
        },
        {
          operationId: "deploy-1",
          resumeReceipt: validated.receipt,
          targetStage: "executed",
        }
      )
    ).rejects.toThrow("does not match");
    expect(client.mutate).toHaveBeenCalledOnce();
  });

  it("retains its operation label until a persisted success receipt resumes", async () => {
    const client = {
      mutate: vi
        .fn<GoogleAdsClient["mutate"]>()
        .mockResolvedValueOnce({
          mutateOperationResponses: [],
          requestId: "validate-request",
        })
        .mockResolvedValueOnce({
          mutateOperationResponses: [
            {
              campaignResult: {
                resourceName: "customers/1234567890/campaigns/9",
              },
            },
            {
              labelResult: {
                resourceName: "customers/1234567890/labels/10",
              },
            },
          ],
          requestId: "execute-request",
        })
        .mockResolvedValueOnce({
          mutateOperationResponses: [],
          requestId: "cleanup-request",
        }),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };
    const executed = await runDeployCampaignLifecycle(
      client,
      { brief, customerId: "1234567890", status: "PAUSED" },
      { operationId: "deploy-1", targetStage: "executed" }
    );

    const resumed = await runDeployCampaignLifecycle(
      client,
      { brief, customerId: "1234567890", status: "PAUSED" },
      {
        operationId: "deploy-1",
        resumeReceipt: executed.receipt,
        targetStage: "executed",
      }
    );

    expect(executed.receipt.steps[3]).toMatchObject({
      attempted: false,
      key: "operation-label-cleanup",
      status: "pending",
    });
    expect(resumed.receipt.steps[3]).toMatchObject({
      attempted: true,
      key: "operation-label-cleanup",
      providerRequestId: "cleanup-request",
      status: "succeeded",
    });
    expect(client.mutate).toHaveBeenCalledTimes(3);
    expect(client.mutate).toHaveBeenLastCalledWith({
      customerId: "1234567890",
      operations: [
        {
          campaignLabelOperation: {
            remove: "customers/1234567890/campaignLabels/9~10",
          },
        },
        { labelOperation: { remove: "customers/1234567890/labels/10" } },
      ],
      partialFailure: false,
      validateOnly: false,
    });
  });

  it("does not clean up a succeeded receipt for a planned target", async () => {
    const executeClient = createLifecycleClient();
    vi.mocked(executeClient.mutate)
      .mockResolvedValueOnce({
        mutateOperationResponses: [],
        requestId: "validate-request",
      })
      .mockResolvedValueOnce({
        mutateOperationResponses: [
          {
            campaignResult: {
              resourceName: "customers/1234567890/campaigns/9",
            },
          },
          {
            labelResult: {
              resourceName: "customers/1234567890/labels/10",
            },
          },
        ],
        requestId: "execute-request",
      });
    const executed = await runDeployCampaignLifecycle(
      executeClient,
      { brief, customerId: "1234567890", status: "PAUSED" },
      { operationId: "planned-success", targetStage: "executed" }
    );
    const plannedClient = createLifecycleClient();

    const resumed = await runDeployCampaignLifecycle(
      plannedClient,
      { brief, customerId: "1234567890", status: "PAUSED" },
      {
        operationId: "planned-success",
        resumeReceipt: executed.receipt,
        targetStage: "planned",
      }
    );

    expect(resumed.receipt).toStrictEqual(executed.receipt);
    expect(plannedClient.mutate).not.toHaveBeenCalled();
    expect(plannedClient.search).not.toHaveBeenCalled();
  });

  it("does not claim provider validation without a request ID", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>().mockResolvedValue({
        mutateOperationResponses: [],
        requestId: null,
      }),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await expect(
      runDeployCampaignLifecycle(
        client,
        { brief, customerId: "1234567890", status: "PAUSED" },
        { operationId: "deploy-1", targetStage: "provider-validated" }
      )
    ).resolves.toMatchObject({
      receipt: {
        stage: "provider-validated",
        status: "failed",
        steps: [
          {},
          { attempted: true, key: "provider-validation", status: "failed" },
          {},
          {},
        ],
      },
    });
  });

  it("does not claim validation when the provider reports an error", async () => {
    const client = createLifecycleClient();
    vi.mocked(client.mutate).mockResolvedValue({
      mutateOperationResponses: [],
      partialFailureError: { message: "invalid operation" },
      requestId: "validation-request",
    });

    const result = await runDeployCampaignLifecycle(
      client,
      { brief, customerId: "1234567890", status: "PAUSED" },
      { operationId: "invalid-validation", targetStage: "provider-validated" }
    );

    expect(result.receipt.steps[1]).toMatchObject({
      providerRequestId: "validation-request",
      status: "failed",
    });
  });

  it("rejects a malformed caller-persisted completed receipt", async () => {
    const client = {
      mutate: vi.fn<GoogleAdsClient["mutate"]>(),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };
    const planned = await runDeployCampaignLifecycle(
      client,
      { brief, customerId: "1234567890", status: "PAUSED" },
      { operationId: "deploy-1", targetStage: "planned" }
    );

    await expect(
      runDeployCampaignLifecycle(
        client,
        { brief, customerId: "1234567890", status: "PAUSED" },
        {
          operationId: "deploy-1",
          resumeReceipt: {
            ...planned.receipt,
            stage: "executed",
            status: "succeeded",
            steps: planned.receipt.steps.map((step) => {
              if (step.key === "provider-validation") {
                return {
                  ...step,
                  attempted: true,
                  status: "failed" as const,
                };
              }
              if (step.key === "execution") {
                return {
                  ...step,
                  attempted: true,
                  providerRequestId: "execute-request",
                  providerResourceIds: ["customers/123/campaigns/9"],
                  status: "succeeded" as const,
                };
              }
              return step;
            }),
          },
          targetStage: "executed",
        }
      )
    ).rejects.toThrow("not conformant");
    expect(client.mutate).not.toHaveBeenCalled();
  });

  it("returns an ambiguous receipt when execution transport is uncertain", async () => {
    const client = {
      mutate: vi
        .fn<GoogleAdsClient["mutate"]>()
        .mockResolvedValueOnce({
          mutateOperationResponses: [],
          requestId: "validate-request",
        })
        .mockRejectedValueOnce(new TypeError("connection closed after send")),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await expect(
      runDeployCampaignLifecycle(
        client,
        { brief, customerId: "1234567890", status: "PAUSED" },
        { operationId: "deploy-1", targetStage: "executed" }
      )
    ).resolves.toMatchObject({
      receipt: {
        stage: "executed",
        status: "ambiguous",
        steps: [
          {},
          {},
          { attempted: true, key: "execution", status: "ambiguous" },
          {},
        ],
      },
    });
  });

  it("retries failed provider validation without executing twice", async () => {
    const firstClient = createLifecycleClient();
    vi.mocked(firstClient.mutate).mockRejectedValueOnce(
      new Error("validation rejected")
    );
    const failed = await runDeployCampaignLifecycle(
      firstClient,
      { brief, customerId: "1234567890", status: "PAUSED" },
      { operationId: "retry-validation", targetStage: "executed" }
    );
    const resumeClient = createLifecycleClient();
    vi.mocked(resumeClient.mutate)
      .mockResolvedValueOnce({
        mutateOperationResponses: [],
        requestId: "validation-retry",
      })
      .mockResolvedValueOnce({
        mutateOperationResponses: [
          { campaignResult: { resourceName: "customers/123/campaigns/9" } },
        ],
        requestId: "execution-retry",
      });

    const resumed = await runDeployCampaignLifecycle(
      resumeClient,
      { brief, customerId: "1234567890", status: "PAUSED" },
      {
        operationId: "retry-validation",
        resumeReceipt: failed.receipt,
        targetStage: "executed",
      }
    );

    expect(resumed.receipt.status).toBe("succeeded");
    expect(failed.receipt.steps[1]).toMatchObject({
      failureDetail: "validation rejected",
      status: "failed",
    });
    expect(resumeClient.mutate).toHaveBeenCalledTimes(2);
  });

  it("records provider partial failure as definitive failure evidence", async () => {
    const client = createLifecycleClient();
    vi.mocked(client.mutate)
      .mockResolvedValueOnce({
        mutateOperationResponses: [],
        requestId: "validation-request",
      })
      .mockResolvedValueOnce({
        mutateOperationResponses: [],
        partialFailureError: { message: "operation rejected" },
        requestId: "execution-request",
      });

    const result = await runDeployCampaignLifecycle(
      client,
      { brief, customerId: "1234567890", status: "PAUSED" },
      { operationId: "partial-failure", targetStage: "executed" }
    );

    expect(result.receipt).toMatchObject({
      status: "failed",
      steps: [
        {},
        {},
        {
          key: "execution",
          providerRequestId: "execution-request",
          status: "failed",
        },
        {},
      ],
    });
    expect(client.mutate).toHaveBeenLastCalledWith(
      expect.objectContaining({ partialFailure: false, validateOnly: false })
    );
  });

  it("retries a definitive execution failure without repeating validation", async () => {
    const firstClient = createLifecycleClient();
    vi.mocked(firstClient.mutate)
      .mockResolvedValueOnce({
        mutateOperationResponses: [],
        requestId: "validation-request",
      })
      .mockResolvedValueOnce({
        mutateOperationResponses: [],
        partialFailureError: { message: "operation rejected" },
        requestId: "failed-request",
      });
    const failed = await runDeployCampaignLifecycle(
      firstClient,
      { brief, customerId: "1234567890", status: "PAUSED" },
      { operationId: "retry-execution", targetStage: "executed" }
    );
    const resumeClient = createLifecycleClient();
    vi.mocked(resumeClient.mutate).mockResolvedValue({
      mutateOperationResponses: [
        { campaignResult: { resourceName: "customers/123/campaigns/9" } },
      ],
      requestId: "retry-request",
    });

    const resumed = await runDeployCampaignLifecycle(
      resumeClient,
      { brief, customerId: "1234567890", status: "PAUSED" },
      {
        operationId: "retry-execution",
        resumeReceipt: failed.receipt,
        targetStage: "executed",
      }
    );

    expect(resumed.receipt.status).toBe("succeeded");
    expect(resumeClient.mutate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ validateOnly: false })
    );
  });

  it("preserves request evidence for definitive execution errors", async () => {
    const client = createLifecycleClient();
    vi.mocked(client.mutate)
      .mockResolvedValueOnce({
        mutateOperationResponses: [],
        requestId: "validation-request",
      })
      .mockRejectedValueOnce(
        new GoogleAdsRequestError({
          message: "rejected",
          requestId: "failed-request",
          status: 400,
        })
      );

    const result = await runDeployCampaignLifecycle(
      client,
      { brief, customerId: "1234567890", status: "PAUSED" },
      { operationId: "failed-evidence", targetStage: "executed" }
    );

    expect(result.receipt.steps[2]).toMatchObject({
      failureDetail: "rejected",
      providerRequestId: "failed-request",
      status: "failed",
    });
  });

  it("truncates caught provider failure detail before persisting the receipt", async () => {
    const client = createLifecycleClient();
    vi.mocked(client.mutate).mockRejectedValueOnce(new Error("x".repeat(600)));

    const result = await runDeployCampaignLifecycle(
      client,
      { brief, customerId: "1234567890", status: "PAUSED" },
      { operationId: "truncated-validation", targetStage: "provider-validated" }
    );

    expect(result.receipt.steps[1]?.failureDetail).toHaveLength(500);
  });

  it("reconciles an ambiguous execution by its operation label after a crash", async () => {
    const firstClient = createLifecycleClient();
    vi.mocked(firstClient.mutate)
      .mockResolvedValueOnce({
        mutateOperationResponses: [],
        requestId: "validation-request",
      })
      .mockRejectedValueOnce(new TypeError("connection closed after send"));
    const ambiguous = await runDeployCampaignLifecycle(
      firstClient,
      { brief, customerId: "1234567890", status: "PAUSED" },
      { operationId: "reconcile-1", targetStage: "executed" }
    );
    const resumeClient = createLifecycleClient();
    vi.mocked(resumeClient.search).mockResolvedValue({
      requestId: "reconcile-request",
      rows: [
        {
          campaign: {
            resourceName: "customers/1234567890/campaigns/9",
          },
          label: {
            resourceName: "customers/1234567890/labels/10",
          },
        },
      ],
    });
    const reconciled = await runDeployCampaignLifecycle(
      resumeClient,
      { brief, customerId: "1234567890", status: "PAUSED" },
      {
        operationId: "reconcile-1",
        resumeReceipt: ambiguous.receipt,
        targetStage: "executed",
      }
    );

    expect(reconciled).toMatchObject({
      reconciliation: { status: "resolved" },
      receipt: {
        status: "succeeded",
        steps: [
          {},
          {},
          {
            providerRequestId: "reconcile-request",
            providerResourceIds: ["customers/1234567890/campaigns/9"],
          },
          {
            key: "operation-label-cleanup",
            providerResourceIds: ["customers/1234567890/labels/10"],
            status: "pending",
          },
        ],
      },
    });
    expect(resumeClient.mutate).not.toHaveBeenCalled();
    expect(resumeClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining("FROM campaign_label"),
      })
    );
    expect(resumeClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining("label.name = 'patronage:reconcile-1'"),
      })
    );
  });

  it("does not reconcile an ambiguous receipt for an earlier target stage", async () => {
    const firstClient = createLifecycleClient();
    vi.mocked(firstClient.mutate)
      .mockResolvedValueOnce({
        mutateOperationResponses: [],
        requestId: "validation-request",
      })
      .mockRejectedValueOnce(new TypeError("uncertain"));
    const ambiguous = await runDeployCampaignLifecycle(
      firstClient,
      { brief, customerId: "1234567890", status: "PAUSED" },
      { operationId: "no-reconcile", targetStage: "executed" }
    );
    const resumeClient = createLifecycleClient();

    const resumed = await runDeployCampaignLifecycle(
      resumeClient,
      { brief, customerId: "1234567890", status: "PAUSED" },
      {
        operationId: "no-reconcile",
        resumeReceipt: ambiguous.receipt,
        targetStage: "provider-validated",
      }
    );

    expect(resumed.receipt).toStrictEqual(ambiguous.receipt);
    expect(resumeClient.search).not.toHaveBeenCalled();
    expect(resumeClient.mutate).not.toHaveBeenCalled();
  });

  it.each([
    ["not found", []],
    [
      "duplicate",
      [
        {
          campaign: {
            resourceName: "customers/123/campaigns/9",
          },
        },
        {
          campaign: {
            resourceName: "customers/123/campaigns/10",
          },
        },
      ],
    ],
  ] as const)(
    "requires manual review when reconciliation is %s",
    async (_scenario, rows) => {
      const firstClient = createLifecycleClient();
      vi.mocked(firstClient.mutate)
        .mockResolvedValueOnce({
          mutateOperationResponses: [],
          requestId: "validation-request",
        })
        .mockRejectedValueOnce(new TypeError("uncertain"));
      const ambiguous = await runDeployCampaignLifecycle(
        firstClient,
        { brief, customerId: "1234567890", status: "PAUSED" },
        { operationId: "manual-review", targetStage: "executed" }
      );
      const resumeClient = createLifecycleClient();
      vi.mocked(resumeClient.search).mockResolvedValue({
        requestId: "reconcile-request",
        rows: [...rows],
      });

      const resumed = await runDeployCampaignLifecycle(
        resumeClient,
        { brief, customerId: "1234567890", status: "PAUSED" },
        {
          operationId: "manual-review",
          resumeReceipt: ambiguous.receipt,
          targetStage: "executed",
        }
      );

      expect(resumed.reconciliation?.status).toBe("manual-review-required");
      expect(resumed.receipt.status).toBe("ambiguous");
      expect(resumeClient.mutate).not.toHaveBeenCalled();
    }
  );

  it("passes the reusable provider lifecycle conformance harness", async () => {
    const client = {
      mutate: vi
        .fn<GoogleAdsClient["mutate"]>()
        .mockResolvedValueOnce({
          mutateOperationResponses: [],
          requestId: "validate-request",
        })
        .mockResolvedValueOnce({
          mutateOperationResponses: [
            { campaignResult: { resourceName: "customers/123/campaigns/9" } },
          ],
          requestId: "execute-request",
        }),
      search: vi.fn<GoogleAdsClient["search"]>(),
      searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
    };

    await expect(
      verifyMutationLifecycleImplementationConformance({
        async run(targetStage, resumeReceipt) {
          const result = await runDeployCampaignLifecycle(
            client,
            { brief, customerId: "1234567890", status: "PAUSED" },
            {
              operationId: "deploy-conformance",
              resumeReceipt,
              targetStage,
            }
          );
          return result.receipt;
        },
      })
    ).resolves.toMatchObject({ stage: "executed", status: "succeeded" });
  });

  it("rejects unresolved geographic target names at the package boundary", () => {
    expect(() =>
      buildDeployCampaignOperations({
        brief: {
          ...brief,
          frontmatter: {
            ...brief.frontmatter,
            geographic_targets: ["Local Programs"],
          },
        },
        customerId: "1234567890",
        status: "PAUSED",
      })
    ).toThrow("Unsupported geographic target");
  });

  it("parses JSON and markdown briefs into the same deployable shape", () => {
    expect(
      parseCampaignBrief(JSON.stringify(brief), { format: "json" })
    ).toMatchObject({
      frontmatter: { campaign_name: "Search Housing" },
    });

    expect(
      parseCampaignBrief(markdownBrief(), { format: "markdown" })
    ).toMatchObject({
      ad_groups: [
        expect.objectContaining({
          ads: [
            expect.objectContaining({
              final_url: "https://example.com/issues/housing",
            }),
          ],
          name: "Housing",
        }),
      ],
      frontmatter: {
        bidding: "manual-cpc",
        geographic_targets: ["2840"],
      },
    });
  });

  it("parses an optional max_cpc frontmatter field from JSON and markdown", () => {
    expect(
      parseCampaignBrief(
        JSON.stringify({
          ...brief,
          frontmatter: {
            ...brief.frontmatter,
            bidding: "maximize-clicks",
            max_cpc: 2,
          },
        }),
        { format: "json" }
      ).frontmatter.max_cpc
    ).toBe(2);

    expect(
      parseCampaignBrief(
        markdownBrief().replace(
          "budget_daily: 50",
          "budget_daily: 50\nbidding: maximize-clicks\nmax_cpc: 2"
        ),
        { format: "markdown" }
      ).frontmatter.max_cpc
    ).toBe(2);

    const withoutMaxCpc = parseCampaignBrief(JSON.stringify(brief), {
      format: "json",
    }).frontmatter;
    expect(withoutMaxCpc.max_cpc).toBeUndefined();
    // The key must be absent, not present-but-undefined: plan fingerprinting
    // (flue experimental-google-ads-operator) rejects explicit undefined values.
    expect("max_cpc" in withoutMaxCpc).toBeFalsy();
  });

  it("rejects a non-positive max_cpc", () => {
    expect(() =>
      parseCampaignBrief(
        JSON.stringify({
          ...brief,
          frontmatter: { ...brief.frontmatter, max_cpc: 0 },
        }),
        { format: "json" }
      )
    ).toThrow("frontmatter.max_cpc must be a positive number");
  });

  it("rejects non-number max_cpc values instead of coercing them", () => {
    for (const max_cpc of [true, "2", [2]]) {
      expect(() =>
        parseCampaignBrief(
          JSON.stringify({
            ...brief,
            frontmatter: {
              ...brief.frontmatter,
              bidding: "maximize-clicks",
              max_cpc,
            },
          }),
          { format: "json" }
        )
      ).toThrow("frontmatter.max_cpc must be a number");
    }
  });

  it("rejects max_cpc values that are out of range or not whole cents", () => {
    const parseWithMaxCpc = (max_cpc: number) =>
      parseCampaignBrief(
        JSON.stringify({
          ...brief,
          frontmatter: {
            ...brief.frontmatter,
            bidding: "maximize-clicks",
            max_cpc,
          },
        }),
        { format: "json" }
      );

    expect(() => parseWithMaxCpc(2.005)).toThrow(
      "frontmatter.max_cpc must be a whole number of cents"
    );
    expect(() => parseWithMaxCpc(1e15)).toThrow(
      "frontmatter.max_cpc must be between $0.01 and $1000"
    );
    expect(parseWithMaxCpc(0.5).frontmatter.max_cpc).toBe(0.5);
  });

  it("enforces max_cpc invariants at validateCampaignBrief for unparsed briefs", () => {
    const findingsFor = (max_cpc: unknown) =>
      validateCampaignBrief({
        ...brief,
        frontmatter: {
          ...brief.frontmatter,
          bidding: "maximize-clicks",
          max_cpc: max_cpc as number,
        },
      });

    expect(findingsFor(2.005)).toContainEqual({
      message: "max_cpc must be a whole number of cents",
      path: "frontmatter.max_cpc",
    });
    expect(findingsFor(1e15)).toContainEqual({
      message: "max_cpc must be between $0.01 and $1000",
      path: "frontmatter.max_cpc",
    });
    expect(findingsFor(1e-9)).toContainEqual({
      message: "max_cpc must be between $0.01 and $1000",
      path: "frontmatter.max_cpc",
    });
    expect(findingsFor(-2)).toContainEqual({
      message: "max_cpc must be a positive number",
      path: "frontmatter.max_cpc",
    });
    expect(findingsFor(Number.NaN)).toContainEqual({
      message: "max_cpc must be a finite number",
      path: "frontmatter.max_cpc",
    });
    expect(findingsFor("2")).toContainEqual({
      message: "max_cpc must be a finite number",
      path: "frontmatter.max_cpc",
    });
    expect(findingsFor(2)).not.toContainEqual(
      expect.objectContaining({ path: "frontmatter.max_cpc" })
    );
  });

  it("flags max_cpc as a finding under any bidding strategy except maximize-clicks", () => {
    const findingsFor = (bidding: "maximize-clicks" | "maximize-conversions") =>
      validateCampaignBrief({
        ...brief,
        frontmatter: { ...brief.frontmatter, bidding, max_cpc: 2 },
      });

    expect(findingsFor("maximize-conversions")).toContainEqual({
      message:
        'max_cpc only applies under maximize-clicks bidding; with bidding "maximize-conversions" the ceiling would be silently ignored',
      path: "frontmatter.max_cpc",
    });
    expect(findingsFor("maximize-clicks")).not.toContainEqual(
      expect.objectContaining({ path: "frontmatter.max_cpc" })
    );
  });

  it("uses the supplied default bidding unless frontmatter declares a strategy", () => {
    expect(
      parseCampaignBrief(markdownBrief(), {
        defaultBidding: "maximize-conversions",
        format: "markdown",
      }).frontmatter.bidding
    ).toBe("maximize-conversions");

    expect(
      parseCampaignBrief(
        markdownBrief().replace(
          "campaign_type: SEARCH",
          "campaign_type: SEARCH\nbidding: manual-cpc"
        ),
        { defaultBidding: "maximize-conversions", format: "markdown" }
      ).frontmatter.bidding
    ).toBe("manual-cpc");
  });

  it("parses markdown briefs with CRLF line endings", () => {
    expect(
      parseCampaignBrief(markdownBrief().replaceAll("\n", "\r\n"), {
        format: "markdown",
      })
    ).toMatchObject({
      ad_groups: [expect.objectContaining({ name: "Housing" })],
      frontmatter: { campaign_name: "Search Housing" },
    });
  });

  it("reports missing fields for empty markdown frontmatter", () => {
    expect(() =>
      parseCampaignBrief("---\n---\n\n## Objective\n", { format: "markdown" })
    ).toThrow("Missing frontmatter fields");
  });

  it("normalizes null optional JSON negative keyword arrays to empty lists", () => {
    const rawBrief = {
      ...brief,
      ad_groups: brief.ad_groups.map((adGroup) => ({
        ...adGroup,
        negative_keywords: null,
      })),
      campaign_negative_keywords: null,
    };

    expect(
      parseCampaignBrief(JSON.stringify(rawBrief), { format: "json" })
    ).toMatchObject({
      ad_groups: [expect.objectContaining({ negative_keywords: [] })],
      campaign_negative_keywords: [],
    });
  });

  it("rejects JSON ad path fields longer than Google Ads allows", () => {
    const rawBrief = {
      ...brief,
      ad_groups: brief.ad_groups.map((adGroup) => ({
        ...adGroup,
        ads: adGroup.ads.map((ad) => ({
          ...ad,
          path_1: "this-path-is-too-long",
        })),
      })),
    };

    expect(() =>
      parseCampaignBrief(JSON.stringify(rawBrief), { format: "json" })
    ).toThrow("ad_groups[0].ads[0].path_1 exceeds 15 characters");
  });

  it("rejects JSON sitelinks missing both path and final_url", () => {
    const rawBrief = {
      ...brief,
      extensions: {
        ...brief.extensions,
        sitelinks: [{ link_text: "Housing" }],
      },
    };

    expect(() =>
      parseCampaignBrief(JSON.stringify(rawBrief), { format: "json" })
    ).toThrow("extensions.sitelinks[0] must include either path or final_url");
  });

  it("joins relative sitelink paths against the landing page origin", () => {
    const operations = buildDeployCampaignOperations({
      brief: {
        ...brief,
        extensions: {
          ...brief.extensions,
          sitelinks: [{ link_text: "Housing", path: "issues/housing" }],
        },
      },
      customerId: "1234567890",
      status: "PAUSED",
    });

    expect(operations).toContainEqual(
      expect.objectContaining({
        assetOperation: {
          create: expect.objectContaining({
            finalUrls: ["https://example.com/issues/housing"],
            name: "Sitelink: Housing",
          }),
        },
      })
    );
  });

  it("rejects briefs with start dates after end dates", () => {
    expect(() =>
      planDeployCampaign({
        brief: {
          ...brief,
          frontmatter: {
            ...brief.frontmatter,
            end_date: "2026-06-30",
            start_date: "2026-07-01",
          },
        },
        customerId: "1234567890",
        status: "PAUSED",
      })
    ).toThrow("Start date must not be after end date");
  });

  it("rejects non-search markdown briefs", () => {
    expect(() =>
      parseCampaignBrief(
        markdownBrief().replace(
          "campaign_type: SEARCH",
          "campaign_type: VIDEO"
        ),
        { format: "markdown" }
      )
    ).toThrow("frontmatter.campaign_type must be SEARCH");
  });

  it("rejects non-numeric markdown budgets", () => {
    expect(() =>
      parseCampaignBrief(
        markdownBrief().replace("budget_daily: 50", "budget_daily: abc"),
        { format: "markdown" }
      )
    ).toThrow("frontmatter.budget_daily must be a number");
  });

  it("rejects empty markdown frontmatter strings", () => {
    expect(() =>
      parseCampaignBrief(
        markdownBrief().replace(
          "campaign_name: Search Housing",
          "campaign_name:"
        ),
        { format: "markdown" }
      )
    ).toThrow("frontmatter.campaign_name must be a non-empty string");
  });

  it("keeps malformed markdown ads separate so validation catches them", () => {
    expect(() =>
      parseCampaignBrief(
        markdownBrief().replace(
          "- Final URL: https://example.com/issues/housing\n- Path 1: housing",
          `- Headline 1: Second Ad
- Headline 2: Better Homes
- Headline 3: Local Programs
- Description 1: Second ad description one.
- Description 2: Second ad description two.
- Final URL: https://example.com/issues/housing
- Path 1: housing`
        ),
        { format: "markdown" }
      )
    ).toThrow('Ad Group "Housing" ad is missing Final URL');
  });

  it("rejects structured snippet headers that are not Google Ads predefined headers", () => {
    let captured: unknown;
    try {
      parseCampaignBrief(
        JSON.stringify({
          ...brief,
          extensions: {
            ...brief.extensions,
            structured_snippets: [
              { header: "Issues", values: ["Housing", "Climate"] },
            ],
          },
        }),
        { format: "json" }
      );
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(CampaignBriefParseError);
    expect(captured).toMatchObject({
      findings: [
        {
          message:
            'Structured snippet header "Issues" is not a Google Ads predefined header (valid: Amenities, Brands, Courses, Degree programs, Destinations, Featured hotels, Insurance coverage, Models, Neighborhoods, Service catalog, Shows, Styles, Types)',
          path: "extensions.structured_snippets[0].header",
        },
      ],
      format: "json",
    });
  });

  it("suggests predefined casing for miscased structured snippet headers", () => {
    expect(() =>
      parseCampaignBrief(
        markdownBrief().replace(
          "- Types: Housing, Climate",
          "- service catalog: Housing, Climate"
        ),
        { format: "markdown" }
      )
    ).toThrow(
      'Structured snippet header "service catalog" must use the predefined casing "Service catalog"'
    );
  });

  it("reports structured Campaign Brief findings", () => {
    let captured: unknown;
    try {
      parseCampaignBrief("{", { format: "json" });
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(CampaignBriefParseError);
    expect(captured).toMatchObject({
      findings: [{ path: "$" }],
      format: "json",
      name: "CampaignBriefParseError",
    });
    expect((captured as Error).cause).toBeInstanceOf(Error);
  });

  it("reports validation paths without an underlying parser cause", () => {
    let captured: unknown;
    try {
      parseCampaignBrief(
        JSON.stringify({
          ...brief,
          frontmatter: {
            ...brief.frontmatter,
            end_date: "2026-06-30",
            start_date: "2026-07-01",
          },
        }),
        { format: "json" }
      );
    } catch (error) {
      captured = error;
    }

    expect(captured).toMatchObject({
      findings: [
        {
          message: "Start date must not be after end date",
          path: "frontmatter.start_date",
        },
      ],
      format: "json",
    });
    expect((captured as Error).cause).toBeUndefined();
  });
});

function createLifecycleClient(): GoogleAdsClient {
  return {
    mutate: vi.fn<GoogleAdsClient["mutate"]>(),
    search: vi.fn<GoogleAdsClient["search"]>(),
    searchStream: vi.fn<GoogleAdsClient["searchStream"]>(),
  };
}

function markdownBrief(): string {
  return `---
client: example-nonprofit
campaign_name: Search Housing
campaign_type: SEARCH
budget_daily: 50
geographic_targets:
  - "2840"
language: English
start_date: 2026-06-01
end_date: 2026-06-30
---

## Objective

Promote local housing support.

### Ad Group: Housing
**Theme:** Housing support

**Keywords:**
- example community fund housing [phrase]

**Negative Keywords:**
- jobs [exact]

**Ads:**
- Headline 1: Example Community Fund
- Headline 2: Donation Match
- Headline 3: Local Programs
- Description 1: Support local families today.
- Description 2: Double your impact now.
- Final URL: https://example.com/issues/housing
- Path 1: housing

## Extensions

### Sitelinks
- Housing | /issues/housing

### Callouts
- Climate action

### Structured Snippets
- Types: Housing, Climate
`;
}
