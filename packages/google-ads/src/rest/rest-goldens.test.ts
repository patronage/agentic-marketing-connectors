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
  it("defaults to the current Google Ads API version", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [] }));
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
    const fetchMock = vi.fn().mockResolvedValue(
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
    expect(result).toEqual({
      nextPageToken: "next-token",
      requestId: "req-123",
      rows: [{ campaign: { id: "123", name: "Issue Search" } }],
      summaryRow: { metrics: { clicks: "10" } },
    });
  });

  it("omits unsupported pageSize even if a JavaScript caller passes one", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [] }));
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
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ results: [] }));
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
      .fn()
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
    expect(result.rows).toEqual([
      { campaign: { id: "1" } },
      { campaign: { id: "2" } },
    ]);
    expect(result.requestId).toBe("req-123");
  });

  it("requires validateOnly to be explicit for mutate requests and returns request metadata", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
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
    expect(result).toEqual({
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
      .fn()
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
    expect(experimentResult.results).toEqual([
      { resourceName: "customers/1234567890/experiments/222" },
    ]);
    expect(armsResult.results).toEqual([
      { resourceName: "customers/1234567890/experimentArms/333" },
    ]);
    expect(scheduleResult).toEqual({
      done: false,
      error: undefined,
      metadata: undefined,
      name: "customers/1234567890/operations/abc",
      requestId: "req-123",
      response: undefined,
    });
    expect(endResult).toEqual({
      experiment: {
        resourceName: "customers/1234567890/experiments/222",
        status: "ENDED",
      },
      requestId: "req-123",
    });
  });
});
