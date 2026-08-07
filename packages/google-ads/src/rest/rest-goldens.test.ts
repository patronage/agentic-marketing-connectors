import { describe, expect, it, vi } from "vitest";

import { createGoogleAdsClient } from "./index.js";

function jsonResponse(body: unknown, requestId = "req-123") {
  return Response.json(body, {
    headers: {
      "content-type": "application/json",
      "request-id": requestId,
    },
    status: 200,
  });
}

describe("Google Ads REST client", () => {
  it.each([
    "../../customers/999/experiments/1",
    "",
    " ",
    "customers/abc/experiments/1",
    "experiments/1",
  ])(
    "rejects hostile experiment resource names before fetch: %s",
    async (resourceName) => {
      const fetchMock = vi.fn<typeof fetch>();
      const client = createGoogleAdsClient({
        auth: { getAccessToken: async () => "token" },
        developerToken: "token",
        fetch: fetchMock,
      });
      await expect(
        client.endExperiment({
          experimentResourceName: resourceName,
          validateOnly: true,
        })
      ).rejects.toThrow("Experiment resource names");
      await expect(
        client.graduateExperiment({
          campaignBudgetMappings: [
            {
              campaignBudget: "customers/1/campaignBudgets/1",
              experimentCampaign: "customers/1/campaigns/1",
            },
          ],
          experiment: resourceName,
          validateOnly: true,
        })
      ).rejects.toThrow("Experiment resource names");
      await expect(
        client.promoteExperiment({ resourceName, validateOnly: true })
      ).rejects.toThrow("Experiment resource names");
      await expect(
        client.scheduleExperiment({ resourceName, validateOnly: true })
      ).rejects.toThrow("Experiment resource names");
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );
  it("preserves request evidence on provider errors", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("rejected", {
        headers: { "request-id": "failed-request" },
        status: 400,
      })
    );
    const client = createGoogleAdsClient({
      auth: { getAccessToken: async () => "access-token" },
      developerToken: "developer-token",
      fetch: fetchMock,
    });

    await expect(
      client.search({ customerId: "123", query: "SELECT campaign.id" })
    ).rejects.toMatchObject({
      requestId: "failed-request",
      status: 400,
    });
  });

  it.each([
    ["search", { results: { edges: [] } }],
    ["search", null],
    ["search", "unexpected"],
    ["search", [{ results: [{ campaign: { id: "1" } }] }]],
    ["searchStream", { results: [] }],
    ["searchStream", [{ results: { edges: [] } }]],
    ["searchStream", [null]],
  ])("rejects malformed successful %s envelopes", async (operation, body) => {
    const client = createGoogleAdsClient({
      auth: { getAccessToken: async () => "access-token" },
      developerToken: "developer-token",
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse(body, "drift-1")),
    });

    await expect(
      operation === "search"
        ? client.search({ customerId: "123", query: "SELECT campaign.id" })
        : client.searchStream({
            customerId: "123",
            query: "SELECT campaign.id",
          })
    ).rejects.toMatchObject({
      apiVersion: "v24",
      name: "GoogleAdsContractError",
      operation,
      requestId: "drift-1",
    });
  });

  it("reads a zero-row search response, which omits the results array entirely", async () => {
    const client = createGoogleAdsClient({
      auth: { getAccessToken: async () => "access-token" },
      developerToken: "developer-token",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse(
          {
            fieldMask:
              "segments.conversionActionName,segments.date,metrics.allConversions",
            requestId: "empty-1",
          },
          "empty-1"
        )
      ),
    });

    const result = await client.search({
      customerId: "1234567890",
      query:
        "SELECT segments.conversion_action_name, segments.date, metrics.all_conversions FROM customer WHERE segments.date DURING LAST_7_DAYS",
    });

    expect(result).toStrictEqual({
      nextPageToken: undefined,
      requestId: "empty-1",
      rows: [],
      summaryRow: undefined,
    });
  });

  it("reads a zero-row searchStream batch, which omits the results array", async () => {
    const client = createGoogleAdsClient({
      auth: { getAccessToken: async () => "access-token" },
      developerToken: "developer-token",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        jsonResponse(
          [
            {
              fieldMask:
                "segments.conversionActionName,segments.date,metrics.allConversions",
              queryResourceConsumption: "856",
              requestId: "RLreC28297fHqBw7SkqU1A",
            },
          ],
          "RLreC28297fHqBw7SkqU1A"
        )
      ),
    });

    await expect(
      client.searchStream({
        customerId: "1234567890",
        query:
          "SELECT segments.conversion_action_name, segments.date, metrics.all_conversions FROM customer WHERE segments.date DURING LAST_7_DAYS",
      })
    ).resolves.toStrictEqual({
      requestId: "RLreC28297fHqBw7SkqU1A",
      rows: [],
    });
  });

  it("defaults to the current Google Ads API version", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ results: [] }));
    const client = createGoogleAdsClient({
      auth: { getAccessToken: async () => "access-token" },
      developerToken: "developer-token",
      fetch: fetchMock,
    });

    await client.search({
      customerId: "1234567890",
      query: "SELECT campaign.id FROM campaign",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://googleads.googleapis.com/v24/customers/1234567890/googleAds:search",
      expect.any(Object)
    );
  });

  it("constructs a search request with normalized customer ID and Google Ads headers", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        nextPageToken: "next-token",
        results: [{ campaign: { id: "123", name: "Issue Search" } }],
        summaryRow: { metrics: { clicks: "10" } },
      })
    );
    const client = createGoogleAdsClient({
      apiVersion: "v99",
      auth: { getAccessToken: async () => "access-token" },
      developerToken: "developer-token",
      fetch: fetchMock,
      loginCustomerId: "999-888-7777",
    });

    const result = await client.search({
      customerId: "123-456-7890",
      query: "SELECT campaign.id, campaign.name FROM campaign",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://googleads.googleapis.com/v99/customers/1234567890/googleAds:search",
      {
        body: JSON.stringify({
          query: "SELECT campaign.id, campaign.name FROM campaign",
        }),
        headers: {
          authorization: "Bearer access-token",
          "content-type": "application/json",
          "developer-token": "developer-token",
          "login-customer-id": "9998887777",
        },
        method: "POST",
      }
    );
    expect(result).toStrictEqual({
      nextPageToken: "next-token",
      requestId: "req-123",
      rows: [{ campaign: { id: "123", name: "Issue Search" } }],
      summaryRow: { metrics: { clicks: "10" } },
    });
  });

  it("omits unsupported pageSize even if a JavaScript caller passes one", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ results: [] }));
    const client = createGoogleAdsClient({
      apiVersion: "v99",
      auth: { getAccessToken: async () => "access-token" },
      developerToken: "developer-token",
      fetch: fetchMock,
    });

    await client.search({
      customerId: "1234567890",
      pageSize: 1000,
      query: "SELECT campaign.id FROM campaign",
    } as Parameters<typeof client.search>[0] & { pageSize: number });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ query: "SELECT campaign.id FROM campaign" }),
      })
    );
  });

  it("forwards abort signals to search requests", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ results: [] }));
    const { signal } = new AbortController();
    const client = createGoogleAdsClient({
      apiVersion: "v99",
      auth: { getAccessToken: async () => "access-token" },
      developerToken: "developer-token",
      fetch: fetchMock,
    });

    await client.search({
      customerId: "1234567890",
      query: "SELECT campaign.id FROM campaign",
      signal,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal })
    );
  });

  it("flattens searchStream JSON batches returned by the REST API", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse([
          { results: [{ campaign: { id: "1" } }] },
          { results: [{ campaign: { id: "2" } }] },
        ])
      );
    const client = createGoogleAdsClient({
      apiVersion: "v99",
      auth: { getAccessToken: async () => "token" },
      developerToken: "developer-token",
      fetch: fetchMock,
    });

    const result = await client.searchStream({
      customerId: "1234567890",
      query: "SELECT campaign.id FROM campaign",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://googleads.googleapis.com/v99/customers/1234567890/googleAds:searchStream",
      expect.objectContaining({
        body: JSON.stringify({ query: "SELECT campaign.id FROM campaign" }),
      })
    );
    expect(result.rows).toStrictEqual([
      { campaign: { id: "1" } },
      { campaign: { id: "2" } },
    ]);
    expect(result.requestId).toBe("req-123");
  });

  it("requires validateOnly to be explicit for mutate requests and returns request metadata", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        mutateOperationResponses: [
          {
            campaignCriterionResult: {
              resourceName: "customers/123/campaignCriteria/111~222",
            },
          },
        ],
        partialFailureError: { message: "some operations failed" },
      })
    );
    const client = createGoogleAdsClient({
      apiVersion: "v99",
      auth: { getAccessToken: async () => "token" },
      developerToken: "developer-token",
      fetch: fetchMock,
    });

    await expect(
      client.mutate({
        customerId: "1234567890",
        operations: [],
        validateOnly: undefined as never,
      })
    ).rejects.toThrow("validateOnly");

    const result = await client.mutate({
      customerId: "123-456-7890",
      operations: [{ campaignCriterionOperation: { create: {} } }],
      partialFailure: true,
      validateOnly: true,
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://googleads.googleapis.com/v99/customers/1234567890/googleAds:mutate",
      {
        body: JSON.stringify({
          mutateOperations: [{ campaignCriterionOperation: { create: {} } }],
          partialFailure: true,
          validateOnly: true,
        }),
        headers: {
          authorization: "Bearer token",
          "content-type": "application/json",
          "developer-token": "developer-token",
        },
        method: "POST",
      }
    );
    expect(result).toStrictEqual({
      mutateOperationResponses: [
        {
          campaignCriterionResult: {
            resourceName: "customers/123/campaignCriteria/111~222",
          },
        },
      ],
      partialFailureError: { message: "some operations failed" },
      requestId: "req-123",
    });
  });

  it("calls experiment service REST endpoints with validate-only requests", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          results: [{ resourceName: "customers/1234567890/experiments/222" }],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            { resourceName: "customers/1234567890/experimentArms/333" },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          done: false,
          name: "customers/1234567890/operations/abc",
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          experiment: {
            resourceName: "customers/1234567890/experiments/222",
            status: "ENDED",
          },
        })
      );
    const client = createGoogleAdsClient({
      apiVersion: "v99",
      auth: { getAccessToken: async () => "token" },
      developerToken: "developer-token",
      fetch: fetchMock,
    });

    await expect(
      client.mutateExperiments({
        customerId: "1234567890",
        operations: [],
        validateOnly: undefined as never,
      })
    ).rejects.toThrow("validateOnly");

    const experimentResult = await client.mutateExperiments({
      customerId: "123-456-7890",
      operations: [{ create: { name: "Experiment" } }],
      validateOnly: true,
    });
    const armsResult = await client.mutateExperimentArms({
      customerId: "123-456-7890",
      operations: [{ create: { control: true } }],
      responseContentType: "MUTABLE_RESOURCE",
      validateOnly: true,
    });
    const scheduleResult = await client.scheduleExperiment({
      resourceName: "customers/1234567890/experiments/222",
      validateOnly: true,
    });
    const endResult = await client.endExperiment({
      experimentResourceName: "customers/1234567890/experiments/222",
      validateOnly: true,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://googleads.googleapis.com/v99/customers/1234567890/experiments:mutate",
      expect.objectContaining({
        body: JSON.stringify({
          operations: [{ create: { name: "Experiment" } }],
          validateOnly: true,
        }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://googleads.googleapis.com/v99/customers/1234567890/experimentArms:mutate",
      expect.objectContaining({
        body: JSON.stringify({
          operations: [{ create: { control: true } }],
          validateOnly: true,
          responseContentType: "MUTABLE_RESOURCE",
        }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://googleads.googleapis.com/v99/customers/1234567890/experiments/222:scheduleExperiment",
      expect.objectContaining({
        body: JSON.stringify({ validateOnly: true }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "https://googleads.googleapis.com/v99/customers/1234567890/experiments/222:endExperiment",
      expect.objectContaining({
        body: JSON.stringify({ validateOnly: true }),
      })
    );
    expect(experimentResult.results).toStrictEqual([
      { resourceName: "customers/1234567890/experiments/222" },
    ]);
    expect(armsResult.results).toStrictEqual([
      { resourceName: "customers/1234567890/experimentArms/333" },
    ]);
    expect(scheduleResult).toStrictEqual({
      done: false,
      error: undefined,
      metadata: undefined,
      name: "customers/1234567890/operations/abc",
      requestId: "req-123",
      response: undefined,
    });
    expect(endResult).toStrictEqual({
      experiment: {
        resourceName: "customers/1234567890/experiments/222",
        status: "ENDED",
      },
      requestId: "req-123",
    });
  });

  it("calls the experiment promotion REST action in validate mode", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        done: false,
        metadata: { action: "PROMOTE" },
        name: "customers/1234567890/operations/promote-abc",
      })
    );
    const client = createGoogleAdsClient({
      apiVersion: "v99",
      auth: { getAccessToken: async () => "token" },
      developerToken: "developer-token",
      fetch: fetchMock,
    });

    await expect(
      client.promoteExperiment({
        resourceName: "customers/1234567890/experiments/222",
        validateOnly: undefined as never,
      })
    ).rejects.toThrow("validateOnly");

    await expect(
      client.promoteExperiment({
        resourceName: "customers/1234567890/experiments/222",
        validateOnly: true,
      })
    ).resolves.toStrictEqual({
      done: false,
      error: undefined,
      metadata: { action: "PROMOTE" },
      name: "customers/1234567890/operations/promote-abc",
      requestId: "req-123",
      response: undefined,
    });

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "https://googleads.googleapis.com/v99/customers/1234567890/experiments/222:promoteExperiment",
      expect.objectContaining({
        body: JSON.stringify({ validateOnly: true }),
        method: "POST",
      })
    );
  });

  it("calls the experiment graduation REST action in validate mode", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({}));
    const client = createGoogleAdsClient({
      apiVersion: "v99",
      auth: { getAccessToken: async () => "token" },
      developerToken: "developer-token",
      fetch: fetchMock,
    });
    const campaignBudgetMappings = [
      {
        campaignBudget: "customers/1234567890/campaignBudgets/444",
        experimentCampaign: "customers/1234567890/campaigns/333",
      },
    ];

    await expect(
      client.graduateExperiment({
        campaignBudgetMappings,
        experiment: "customers/1234567890/experiments/222",
        validateOnly: undefined as never,
      })
    ).rejects.toThrow("validateOnly");
    await expect(
      client.graduateExperiment({
        campaignBudgetMappings: [],
        experiment: "customers/1234567890/experiments/222",
        validateOnly: true,
      })
    ).rejects.toThrow("exactly one campaign budget mapping");

    await expect(
      client.graduateExperiment({
        campaignBudgetMappings,
        experiment: "customers/1234567890/experiments/222",
        validateOnly: true,
      })
    ).resolves.toStrictEqual({ requestId: "req-123" });

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "https://googleads.googleapis.com/v99/customers/1234567890/experiments/222:graduateExperiment",
      expect.objectContaining({
        body: JSON.stringify({
          campaignBudgetMappings,
          validateOnly: true,
        }),
        method: "POST",
      })
    );
  });

  it("calls recommendation apply and dismiss REST endpoints", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            {
              resourceName: "customers/1234567890/recommendations/abc",
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          partialFailureError: { message: "dismiss warning" },
          results: [
            {
              resourceName: "customers/1234567890/recommendations/def",
            },
          ],
        })
      );
    const client = createGoogleAdsClient({
      apiVersion: "v99",
      auth: { getAccessToken: async () => "token" },
      developerToken: "developer-token",
      fetch: fetchMock,
    });

    const applyResult = await client.applyRecommendations({
      customerId: "123-456-7890",
      operations: [
        { resourceName: "customers/1234567890/recommendations/abc" },
      ],
      partialFailure: true,
    });
    const dismissResult = await client.dismissRecommendations({
      customerId: "123-456-7890",
      operations: [
        { resourceName: "customers/1234567890/recommendations/def" },
      ],
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://googleads.googleapis.com/v99/customers/1234567890/recommendations:apply",
      expect.objectContaining({
        body: JSON.stringify({
          operations: [
            { resourceName: "customers/1234567890/recommendations/abc" },
          ],
          partialFailure: true,
        }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://googleads.googleapis.com/v99/customers/1234567890/recommendations:dismiss",
      expect.objectContaining({
        body: JSON.stringify({
          operations: [
            { resourceName: "customers/1234567890/recommendations/def" },
          ],
        }),
      })
    );
    expect(applyResult).toStrictEqual({
      partialFailureError: undefined,
      requestId: "req-123",
      results: [{ resourceName: "customers/1234567890/recommendations/abc" }],
    });
    expect(dismissResult).toStrictEqual({
      partialFailureError: { message: "dismiss warning" },
      requestId: "req-123",
      results: [{ resourceName: "customers/1234567890/recommendations/def" }],
    });
  });
});
