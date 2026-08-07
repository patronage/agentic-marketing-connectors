/* oxlint-disable vitest/require-mock-type-parameters -- Canary collaborators are structurally inferred from their fixture results. */

import { describe, expect, it, vi } from "vitest";

import {
  LINKEDIN_ADS_READ_VERIFICATION_MATRIX,
  runLinkedInAdsReadCanary,
} from "./index.js";

describe(runLinkedInAdsReadCanary, () => {
  it("exercises the complete read matrix without a mutation method", async () => {
    const client = {
      checkToken: vi.fn().mockResolvedValue({ valid: true }),
      getAdAccount: vi.fn().mockResolvedValue({ id: "123" }),
      getAdAccountUser: vi.fn().mockResolvedValue({}),
      getAnalytics: vi.fn().mockResolvedValue([]),
      getAnalyticsStatistics: vi.fn().mockResolvedValue([]),
      getAudienceCounts: vi.fn().mockResolvedValue([]),
      getCampaign: vi.fn().mockResolvedValue({}),
      getCampaignConversion: vi.fn().mockResolvedValue({}),
      getCampaignGroup: vi.fn().mockResolvedValue({}),
      getConversion: vi.fn().mockResolvedValue({}),
      getCreative: vi.fn().mockResolvedValue({}),
      getLeadFormResponses: vi.fn().mockResolvedValue({ leads: [], total: 0 }),
      listAdAccountUsers: vi.fn().mockResolvedValue({
        total: 1,
        users: [{ user: "urn:li:person:7" }],
      }),
      listAuthenticatedUserAdAccountAccess: vi.fn().mockResolvedValue({
        total: 1,
        users: [{ user: "urn:li:person:5" }],
      }),
      listCampaignGroups: vi.fn().mockResolvedValue({
        campaignGroups: [{ id: "urn:li:sponsoredCampaignGroup:4" }],
        total: 1,
      }),
      listCampaigns: vi.fn().mockResolvedValue({
        campaigns: [{ id: "urn:li:sponsoredCampaign:1" }],
        total: 1,
      }),
      listCreatives: vi.fn().mockResolvedValue({
        creatives: [{ id: "urn:li:sponsoredCreative:6" }],
        total: 1,
      }),
      listLeadForms: vi.fn().mockResolvedValue({
        forms: [{ id: "urn:li:leadGenForm:2" }],
        total: 1,
      }),
      listOrganizationPosts: vi.fn().mockResolvedValue({ posts: [], total: 0 }),
      listTargetingEntities: vi
        .fn()
        .mockResolvedValue({ entities: [], total: 0 }),
      listTargetingFacets: vi.fn().mockResolvedValue([
        {
          adTargetingFacetUrn: "urn:li:adTargetingFacet:groups",
          availableEntityFinders: ["AD_TARGETING_FACET"],
          entityTypes: ["GROUP"],
          facetName: "groups",
        },
        {
          adTargetingFacetUrn: "urn:li:adTargetingFacet:jobFunctions",
          availableEntityFinders: ["TYPEAHEAD"],
          entityTypes: ["FUNCTION"],
          facetName: "jobFunctions",
        },
      ]),
      searchAdAccounts: vi.fn().mockResolvedValue({ accounts: [] }),
      searchTargetingEntities: vi
        .fn()
        .mockResolvedValue({ entities: [], total: 0 }),
    };

    const result = await runLinkedInAdsReadCanary(client, {
      analytics: {
        since: { day: 1, month: 7, year: 2026 },
        until: { day: 2, month: 7, year: 2026 },
      },
      audienceCounts: { targetingCriteria: { include: { and: [{ or: {} }] } } },
      conversionId: "urn:lla:llaPartnerConversion:7",
      organizationUrn: "urn:li:organization:3",
    });

    expect(result.map(({ operation }) => operation)).toStrictEqual(
      LINKEDIN_ADS_READ_VERIFICATION_MATRIX.map(({ operation }) => operation)
    );
    expect(result).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operation: "listOrganizationPosts",
          reason: expect.stringContaining("Community Management"),
          status: "skipped",
        }),
      ])
    );
    expect(
      result
        .filter(({ operation }) => operation !== "listOrganizationPosts")
        .every(({ status }) => status === "passed")
    ).toBeTruthy();
    expect(client.listCreatives).toHaveBeenCalledWith({
      campaignId: "urn:li:sponsoredCampaign:1",
      count: 1,
    });
    expect(client.getAdAccountUser).toHaveBeenCalledWith("urn:li:person:7");
    expect(client.getLeadFormResponses).toHaveBeenCalledWith({
      count: 1,
      formId: "urn:li:leadGenForm:2",
    });
    expect(client.listTargetingEntities).toHaveBeenCalledWith({
      facet: "urn:li:adTargetingFacet:groups",
      totals: true,
    });
    expect(client.searchTargetingEntities).toHaveBeenCalledWith({
      facet: "urn:li:adTargetingFacet:jobFunctions",
      query: "a",
      totals: true,
    });
  });

  it("reports data-dependent reads as skipped when scopes are empty", async () => {
    const client = {
      checkToken: vi.fn().mockResolvedValue({ valid: true }),
      getAdAccount: vi.fn().mockResolvedValue({}),
      getAdAccountUser: vi.fn().mockResolvedValue({}),
      getAnalytics: vi.fn().mockResolvedValue([]),
      getAnalyticsStatistics: vi.fn().mockResolvedValue([]),
      getAudienceCounts: vi.fn().mockResolvedValue([]),
      getCampaign: vi.fn().mockResolvedValue({}),
      getCampaignConversion: vi.fn().mockResolvedValue({}),
      getCampaignGroup: vi.fn().mockResolvedValue({}),
      getConversion: vi.fn().mockResolvedValue({}),
      getCreative: vi.fn().mockResolvedValue({}),
      getLeadFormResponses: vi.fn(),
      listAdAccountUsers: vi.fn().mockResolvedValue({ total: 0, users: [] }),
      listAuthenticatedUserAdAccountAccess: vi
        .fn()
        .mockResolvedValue({ total: 0, users: [] }),
      listCampaignGroups: vi
        .fn()
        .mockResolvedValue({ campaignGroups: [], total: 0 }),
      listCampaigns: vi.fn().mockResolvedValue({ campaigns: [], total: 0 }),
      listCreatives: vi.fn(),
      listLeadForms: vi.fn().mockResolvedValue({ forms: [], total: 0 }),
      listOrganizationPosts: vi.fn().mockResolvedValue({ posts: [], total: 0 }),
      listTargetingEntities: vi
        .fn()
        .mockResolvedValue({ entities: [], total: 0 }),
      listTargetingFacets: vi.fn().mockResolvedValue([]),
      searchAdAccounts: vi.fn().mockResolvedValue({ accounts: [] }),
      searchTargetingEntities: vi
        .fn()
        .mockResolvedValue({ entities: [], total: 0 }),
    };

    const result = await runLinkedInAdsReadCanary(client, {
      analytics: {
        since: { day: 1, month: 7, year: 2026 },
        until: { day: 2, month: 7, year: 2026 },
      },
      audienceCounts: { targetingCriteria: { include: { and: [{ or: {} }] } } },
      organizationUrn: "urn:li:organization:3",
    });

    expect(
      result
        .filter(({ status }) => status === "skipped")
        .map(({ operation }) => operation)
    ).toStrictEqual(
      expect.arrayContaining([
        "getAdAccountUser",
        "getCampaign",
        "getCampaignConversion",
        "getCampaignGroup",
        "getConversion",
        "getCreative",
        "getLeadFormResponses",
        "listCreatives",
        "listTargetingEntities",
        "searchTargetingEntities",
      ])
    );
    expect(client.listCreatives).not.toHaveBeenCalled();
    expect(client.getLeadFormResponses).not.toHaveBeenCalled();
  });

  it("continues after independent read failures and records safe evidence", async () => {
    const accountError = Object.assign(new Error("provider unavailable"), {
      status: 503,
    });
    const client = {
      checkToken: vi.fn().mockResolvedValue({ valid: true }),
      getAdAccount: vi.fn().mockRejectedValue(accountError),
      getAdAccountUser: vi.fn().mockResolvedValue({}),
      getAnalytics: vi.fn().mockResolvedValue([]),
      getAnalyticsStatistics: vi.fn().mockResolvedValue([]),
      getAudienceCounts: vi.fn().mockResolvedValue([]),
      getCampaign: vi.fn().mockResolvedValue({}),
      getCampaignConversion: vi.fn().mockResolvedValue({}),
      getCampaignGroup: vi.fn().mockResolvedValue({}),
      getConversion: vi.fn().mockResolvedValue({}),
      getCreative: vi.fn().mockResolvedValue({}),
      getLeadFormResponses: vi.fn(),
      listAdAccountUsers: vi.fn().mockResolvedValue({ total: 0, users: [] }),
      listAuthenticatedUserAdAccountAccess: vi
        .fn()
        .mockResolvedValue({ total: 0, users: [] }),
      listCampaignGroups: vi
        .fn()
        .mockResolvedValue({ campaignGroups: [], total: 0 }),
      listCampaigns: vi.fn().mockResolvedValue({ campaigns: [], total: 0 }),
      listCreatives: vi.fn(),
      listLeadForms: vi.fn().mockResolvedValue({ forms: [], total: 0 }),
      listOrganizationPosts: vi.fn().mockResolvedValue({ posts: [], total: 0 }),
      listTargetingEntities: vi
        .fn()
        .mockResolvedValue({ entities: [], total: 0 }),
      listTargetingFacets: vi.fn().mockResolvedValue([]),
      searchAdAccounts: vi.fn().mockResolvedValue({ accounts: [] }),
      searchTargetingEntities: vi
        .fn()
        .mockResolvedValue({ entities: [], total: 0 }),
    };

    const result = await runLinkedInAdsReadCanary(client, {
      analytics: {
        since: { day: 1, month: 7, year: 2026 },
        until: { day: 2, month: 7, year: 2026 },
      },
      audienceCounts: { targetingCriteria: { include: { and: [{ or: {} }] } } },
      organizationUrn: "urn:li:organization:3",
    });

    expect(result).toHaveLength(LINKEDIN_ADS_READ_VERIFICATION_MATRIX.length);
    expect(
      result.find(({ operation }) => operation === "getAdAccount")
    ).toMatchObject({
      error: { message: "provider unavailable", status: 503 },
      status: "failed",
    });
    expect(client.listOrganizationPosts).not.toHaveBeenCalled();
  });

  it("distinguishes failed discovery from a successfully empty scope", async () => {
    const client = {
      checkToken: vi.fn().mockResolvedValue({ valid: true }),
      getAdAccount: vi.fn().mockResolvedValue({}),
      getAdAccountUser: vi.fn().mockResolvedValue({}),
      getAnalytics: vi.fn().mockResolvedValue([]),
      getAnalyticsStatistics: vi.fn().mockResolvedValue([]),
      getAudienceCounts: vi.fn().mockResolvedValue([]),
      getCampaign: vi.fn().mockResolvedValue({}),
      getCampaignConversion: vi.fn().mockResolvedValue({}),
      getCampaignGroup: vi.fn().mockResolvedValue({}),
      getConversion: vi.fn().mockResolvedValue({}),
      getCreative: vi.fn().mockResolvedValue({}),
      getLeadFormResponses: vi.fn(),
      listAdAccountUsers: vi.fn().mockResolvedValue({ total: 0, users: [] }),
      listAuthenticatedUserAdAccountAccess: vi
        .fn()
        .mockResolvedValue({ total: 0, users: [] }),
      listCampaignGroups: vi
        .fn()
        .mockResolvedValue({ campaignGroups: [], total: 0 }),
      listCampaigns: vi.fn().mockRejectedValue(new Error("campaign drift")),
      listCreatives: vi.fn(),
      listLeadForms: vi.fn().mockRejectedValue(new Error("form drift")),
      listOrganizationPosts: vi.fn().mockResolvedValue({ posts: [], total: 0 }),
      listTargetingEntities: vi
        .fn()
        .mockResolvedValue({ entities: [], total: 0 }),
      listTargetingFacets: vi.fn().mockResolvedValue([]),
      searchAdAccounts: vi.fn().mockResolvedValue({ accounts: [] }),
      searchTargetingEntities: vi
        .fn()
        .mockResolvedValue({ entities: [], total: 0 }),
    };

    const result = await runLinkedInAdsReadCanary(client, {
      analytics: {
        since: { day: 1, month: 7, year: 2026 },
        until: { day: 2, month: 7, year: 2026 },
      },
      audienceCounts: { targetingCriteria: { include: { and: [{ or: {} }] } } },
      organizationUrn: "urn:li:organization:3",
    });

    expect(
      result.find(({ operation }) => operation === "listCreatives")
    ).toMatchObject({ reason: expect.stringContaining("discovery failed") });
    expect(
      result.find(({ operation }) => operation === "getLeadFormResponses")
    ).toMatchObject({ reason: expect.stringContaining("discovery failed") });
  });
});
