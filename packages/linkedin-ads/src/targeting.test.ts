import { describe, expect, it, vi } from "vitest";

import { createLinkedInTargetingClient } from "./targeting.js";

describe(createLinkedInTargetingClient, () => {
  it("lists targeting facets through the versioned REST endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        elements: [
          {
            adTargetingFacetUrn: "urn:li:adTargetingFacet:industries",
            availableEntityFinders: ["AD_TARGETING_FACET", "TYPEAHEAD"],
            entityTypes: ["INDUSTRY"],
            facetName: "industries",
          },
        ],
      })
    );
    const client = createLinkedInTargetingClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: fetchMock,
    });

    await expect(client.listTargetingFacets()).resolves.toHaveLength(1);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/rest/adTargetingFacets");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      "LinkedIn-Version": "202606",
      "X-Restli-Protocol-Version": "2.0.0",
    });
  });

  it("lists and searches targeting entities with URN response fields", async () => {
    const response = {
      elements: [
        {
          facetUrn: "urn:li:adTargetingFacet:jobFunctions",
          name: "Accounting",
          urn: "urn:li:function:1",
        },
      ],
      paging: { total: 1 },
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(response))
      .mockResolvedValueOnce(Response.json(response));
    const client = createLinkedInTargetingClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: fetchMock,
    });

    await expect(
      client.listTargetingEntities({ facet: "jobFunctions" })
    ).resolves.toStrictEqual({
      entities: [
        {
          facetUrn: "urn:li:adTargetingFacet:jobFunctions",
          name: "Accounting",
          urn: "urn:li:function:1",
        },
      ],
      total: 1,
    });
    await expect(
      client.searchTargetingEntities({
        entityType: "JOB_FUNCTION",
        facet: "urn:li:adTargetingFacet:jobFunctions",
        query: "account",
      })
    ).resolves.toStrictEqual({
      entities: [
        {
          facetUrn: "urn:li:adTargetingFacet:jobFunctions",
          name: "Accounting",
          urn: "urn:li:function:1",
        },
      ],
      total: 1,
    });

    const listUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(listUrl).toContain("q=adTargetingFacet");
    expect(listUrl).toContain(
      "facet=urn%3Ali%3AadTargetingFacet%3AjobFunctions"
    );
    expect(listUrl).toContain("queryVersion=QUERY_USES_URNS");
    expect(listUrl).toContain("locale=(language:en,country:US)");

    const searchUrl = String(fetchMock.mock.calls[1]?.[0]);
    expect(searchUrl).toContain("q=typeahead");
    expect(searchUrl).toContain(
      "facet=urn%3Ali%3AadTargetingFacet%3AjobFunctions"
    );
    expect(searchUrl).toContain("query=account");
    expect(searchUrl).toContain("entityType=JOB_FUNCTION");
  });

  it("rejects malformed targeting entities instead of casting them", async () => {
    const client = createLinkedInTargetingClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ elements: [{ name: "Owner" }] })),
    });

    await expect(
      client.listTargetingEntities({ facet: "seniorities" })
    ).rejects.toThrow("targeting entity at index 0.facetUrn");
  });

  it("forecasts audience counts with doc-exact Rest.li targeting criteria", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        elements: [{ active: 0, total: 25_312_600 }],
        paging: { count: 10, links: [], start: 0 },
      })
    );
    const client = createLinkedInTargetingClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: fetchMock,
    });

    await expect(
      client.getAudienceCounts({
        targetingCriteria: {
          exclude: {
            or: {
              "urn:li:adTargetingFacet:seniorities": ["urn:li:seniority:1"],
            },
          },
          include: {
            and: [
              {
                or: {
                  "urn:li:adTargetingFacet:locations": ["urn:li:geo:102221843"],
                },
              },
              {
                or: {
                  "urn:li:adTargetingFacet:skills": ["urn:li:skill:17"],
                },
              },
            ],
          },
        },
      })
    ).resolves.toStrictEqual([{ active: 0, total: 25_312_600 }]);

    const requestUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestUrl).toContain("/rest/audienceCounts?q=targetingCriteriaV2");
    expect(requestUrl).toContain("urn%3Ali%3AadTargetingFacet%3Alocations");
    expect(requestUrl).toContain("urn%3Ali%3Ageo%3A102221843");
    expect(requestUrl).not.toContain("urn%253Ali");
    expect(new URL(requestUrl).searchParams.get("targetingCriteria")).toBe(
      "(include:(and:List((or:(urn:li:adTargetingFacet:locations:List(urn:li:geo:102221843))),(or:(urn:li:adTargetingFacet:skills:List(urn:li:skill:17))))),exclude:(or:(urn:li:adTargetingFacet:seniorities:List(urn:li:seniority:1))))"
    );
  });

  it("validates audience criteria and count responses", async () => {
    const client = createLinkedInTargetingClient({
      accessToken: "token",
      adAccountId: "12345",
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          elements: [{ active: -1, total: 0 }],
          paging: { count: 10, links: [], start: 0 },
        })
      ),
    });

    await expect(
      client.getAudienceCounts({
        targetingCriteria: { include: { and: [] } },
      })
    ).rejects.toThrow("at least one and group");
    await expect(
      client.getAudienceCounts({
        targetingCriteria: {
          include: {
            and: [
              {
                or: {
                  "urn:li:adTargetingFacet:locations": ["urn:li:geo:102221843"],
                },
              },
            ],
          },
        },
      })
    ).rejects.toThrow("audience count at index 0.active");
  });
});
