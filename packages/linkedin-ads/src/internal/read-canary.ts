import type {
  GetAnalyticsInput,
  LinkedInAdsClient,
} from "./linkedin-ads-client.js";

export const LINKEDIN_ADS_READ_VERIFICATION_MATRIX = [
  { endpoint: "/rest/adAccounts/{accountId}", operation: "checkToken" },
  { endpoint: "/rest/adAccounts/{accountId}", operation: "getAdAccount" },
  { endpoint: "/rest/adAnalytics", operation: "getAnalytics" },
  { endpoint: "/rest/adAnalytics", operation: "getAnalyticsStatistics" },
  { endpoint: "/rest/audienceCounts", operation: "getAudienceCounts" },
  {
    endpoint: "/rest/adAccounts/{accountId}/adCampaignGroups",
    operation: "listCampaignGroups",
  },
  {
    endpoint: "/rest/adAccounts/{accountId}/adCampaigns",
    operation: "listCampaigns",
  },
  { endpoint: "/rest/adAccountUsers", operation: "listAdAccountUsers" },
  {
    endpoint: "/rest/adAccountUsers",
    operation: "listAuthenticatedUserAdAccountAccess",
  },
  { endpoint: "/rest/adAccounts", operation: "searchAdAccounts" },
  {
    endpoint: "/rest/adTargetingFacets",
    operation: "listTargetingFacets",
  },
  {
    endpoint: "/rest/adTargetingEntities",
    operation: "listTargetingEntities",
    requires: "targeting facet",
  },
  {
    endpoint: "/rest/adTargetingEntities",
    operation: "searchTargetingEntities",
    requires: "targeting facet",
  },
  {
    endpoint: "/rest/adAccounts/{accountId}/creatives",
    operation: "listCreatives",
    requires: "campaign",
  },
  { endpoint: "/rest/leadForms", operation: "listLeadForms" },
  {
    endpoint: "/rest/adAccountUsers/(account={account},user={user})",
    operation: "getAdAccountUser",
    requires: "authenticated-user",
  },
  {
    endpoint: "/rest/adAccounts/{accountId}/adCampaigns/{campaignId}",
    operation: "getCampaign",
    requires: "campaign",
  },
  {
    endpoint: "/rest/adAccounts/{accountId}/adCampaignGroups/{campaignGroupId}",
    operation: "getCampaignGroup",
    requires: "campaign-group",
  },
  {
    endpoint: "/rest/creatives/{creativeUrn}",
    operation: "getCreative",
    requires: "creative",
  },
  {
    endpoint: "/rest/conversions/{conversionId}",
    operation: "getConversion",
    requires: "conversion",
  },
  {
    endpoint:
      "/rest/campaignConversions/(campaign:{campaign},conversion:{conversion})",
    operation: "getCampaignConversion",
    requires: "campaign and conversion",
  },
  {
    endpoint: "/rest/leadFormResponses",
    operation: "getLeadFormResponses",
    requires: "lead-form",
  },
  {
    endpoint: "/rest/posts",
    operation: "listOrganizationPosts",
    requires: "organization",
  },
] as const;

export type LinkedInAdsReadCanaryOperation =
  (typeof LINKEDIN_ADS_READ_VERIFICATION_MATRIX)[number]["operation"];

export interface LinkedInAdsReadCanaryInput {
  analytics: Pick<GetAnalyticsInput, "since" | "until">;
  audienceCounts?: Parameters<LinkedInAdsClient["getAudienceCounts"]>[0];
  conversionId?: string;
  organizationUrn: string;
}

export interface LinkedInAdsReadCanaryResult {
  error?: { message: string; name: string; status?: number };
  operation: LinkedInAdsReadCanaryOperation;
  reason?: string;
  status: "failed" | "passed" | "skipped";
}

type LinkedInAdsReadClient = Pick<
  LinkedInAdsClient,
  | "checkToken"
  | "getAdAccount"
  | "getAdAccountUser"
  | "getAnalytics"
  | "getAnalyticsStatistics"
  | "getAudienceCounts"
  | "getCampaign"
  | "getCampaignConversion"
  | "getCampaignGroup"
  | "getConversion"
  | "getCreative"
  | "getLeadFormResponses"
  | "listAdAccountUsers"
  | "listAuthenticatedUserAdAccountAccess"
  | "listCampaignGroups"
  | "listCampaigns"
  | "listCreatives"
  | "listLeadForms"
  | "listOrganizationPosts"
  | "listTargetingEntities"
  | "listTargetingFacets"
  | "searchAdAccounts"
  | "searchTargetingEntities"
>;

/**
 * Runs this package's exported read matrix without performing a provider
 * mutation. The matrix and its scope-dependent skips are package verification
 * policy; LinkedIn documents the individual API endpoints in their respective
 * client-method comments, not this policy.
 */
export async function runLinkedInAdsReadCanary(
  client: LinkedInAdsReadClient,
  input: LinkedInAdsReadCanaryInput
): Promise<LinkedInAdsReadCanaryResult[]> {
  let campaignId: string | undefined;
  let campaignDiscovery: "empty" | "resolved" | "unresolved" = "unresolved";
  let formId: string | undefined;
  let formDiscovery: "empty" | "resolved" | "unresolved" = "unresolved";
  let campaignGroupId: string | undefined;
  let creativeId: string | undefined;
  let entityListingFacet: string | undefined;
  let typeaheadFacet: string | undefined;
  let adAccountUserUrn: string | undefined;
  const handlers: Record<
    LinkedInAdsReadCanaryOperation,
    () => Promise<Omit<LinkedInAdsReadCanaryResult, "operation">>
  > = {
    checkToken: async () => {
      const token = await client.checkToken();
      if (!token.valid) {
        throw new Error("LinkedIn Ads token is invalid.");
      }
      return passed();
    },
    getAdAccount: async () => {
      await client.getAdAccount();
      return passed();
    },
    getAdAccountUser: async () => {
      if (!adAccountUserUrn) {
        return skipped("No ad account user exists for a scoped user read.");
      }
      await client.getAdAccountUser(adAccountUserUrn);
      return passed();
    },
    getAnalytics: async () => {
      await client.getAnalytics({
        ...input.analytics,
        pivot: "CAMPAIGN",
        timeGranularity: "ALL",
      });
      return passed();
    },
    getAnalyticsStatistics: async () => {
      await client.getAnalyticsStatistics({
        ...input.analytics,
        pivots: ["CAMPAIGN"],
      });
      return passed();
    },
    getAudienceCounts: async () => {
      if (!input.audienceCounts) {
        return skipped(
          "No audience-count targeting criteria was supplied for this account."
        );
      }
      await client.getAudienceCounts(input.audienceCounts);
      return passed();
    },
    getCampaign: async () => {
      if (!campaignId) {
        return skipped("No campaign exists for a scoped campaign read.");
      }
      await client.getCampaign(campaignId);
      return passed();
    },
    getCampaignConversion: async () => {
      if (!campaignId || !input.conversionId) {
        return skipped(
          "Campaign or conversion scope is unavailable for an association read."
        );
      }
      await client.getCampaignConversion({
        campaign: campaignId,
        conversion: input.conversionId,
      });
      return passed();
    },
    getCampaignGroup: async () => {
      if (!campaignGroupId) {
        return skipped("No campaign group exists for a scoped group read.");
      }
      await client.getCampaignGroup(campaignGroupId);
      return passed();
    },
    getConversion: async () => {
      if (!input.conversionId) {
        return skipped(
          "No conversion scope was supplied for a conversion read."
        );
      }
      await client.getConversion(input.conversionId);
      return passed();
    },
    getCreative: async () => {
      if (!creativeId) {
        return skipped("No creative exists for a scoped creative read.");
      }
      await client.getCreative(creativeId);
      return passed();
    },
    getLeadFormResponses: async () => {
      if (formDiscovery === "unresolved") {
        return {
          reason: "Lead-form discovery failed; response scope is unknown.",
          status: "skipped",
        };
      }
      if (!formId) {
        return {
          reason: "No lead form exists for a scoped response read.",
          status: "skipped",
        };
      }
      await client.getLeadFormResponses({ count: 1, formId });
      return passed();
    },
    listAdAccountUsers: async () => {
      const { users } = await client.listAdAccountUsers();
      adAccountUserUrn = users[0]?.user;
      return passed();
    },
    listAuthenticatedUserAdAccountAccess: async () => {
      await client.listAuthenticatedUserAdAccountAccess();
      return passed();
    },
    listCampaignGroups: async () => {
      const { campaignGroups } = await client.listCampaignGroups({ count: 1 });
      campaignGroupId = campaignGroups[0]?.id;
      return passed();
    },
    listCampaigns: async () => {
      const { campaigns } = await client.listCampaigns({ count: 1 });
      campaignId = campaigns[0]?.id;
      campaignDiscovery = campaignId ? "resolved" : "empty";
      return passed();
    },
    listCreatives: async () => {
      if (campaignDiscovery === "unresolved") {
        return {
          reason: "Campaign discovery failed; creative scope is unknown.",
          status: "skipped",
        };
      }
      if (!campaignId) {
        return {
          reason: "No campaign exists for a scoped creative read.",
          status: "skipped",
        };
      }
      const { creatives } = await client.listCreatives({
        campaignId,
        count: 1,
      });
      creativeId = creatives[0]?.id;
      return passed();
    },
    listLeadForms: async () => {
      const { forms } = await client.listLeadForms({ count: 1 });
      formId = forms[0]?.id;
      formDiscovery = formId ? "resolved" : "empty";
      return passed();
    },
    listOrganizationPosts: () =>
      Promise.resolve(
        skipped(
          "LinkedIn Community Management access is unavailable: this app is configured for the Advertising API product, and LinkedIn requires Community Management to be the app's sole product."
        )
      ),
    listTargetingEntities: async () => {
      if (!entityListingFacet) {
        return skipped(
          "No targeting facet supports the AD_TARGETING_FACET finder."
        );
      }
      await client.listTargetingEntities({
        facet: entityListingFacet,
        totals: true,
      });
      return passed();
    },
    listTargetingFacets: async () => {
      const facets = await client.listTargetingFacets();
      entityListingFacet = facets.find((facet) =>
        facet.availableEntityFinders.includes("AD_TARGETING_FACET")
      )?.adTargetingFacetUrn;
      typeaheadFacet = facets.find((facet) =>
        facet.availableEntityFinders.includes("TYPEAHEAD")
      )?.adTargetingFacetUrn;
      return passed();
    },
    searchAdAccounts: async () => {
      await client.searchAdAccounts();
      return passed();
    },
    searchTargetingEntities: async () => {
      if (!typeaheadFacet) {
        return skipped("No targeting facet supports the TYPEAHEAD finder.");
      }
      await client.searchTargetingEntities({
        facet: typeaheadFacet,
        query: "a",
        totals: true,
      });
      return passed();
    },
  };

  const results: LinkedInAdsReadCanaryResult[] = [];
  for (const { operation } of LINKEDIN_ADS_READ_VERIFICATION_MATRIX) {
    try {
      // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- the matrix is deliberately serialized to keep a live canary low-impact and preserve scoped dependencies.
      results.push({ operation, ...(await handlers[operation]()) });
    } catch (error) {
      results.push({
        error: toSafeCanaryError(error),
        operation,
        status: "failed",
      });
    }
  }
  return results;
}

function passed(): Omit<LinkedInAdsReadCanaryResult, "operation"> {
  return { status: "passed" };
}

function skipped(
  reason: string
): Omit<LinkedInAdsReadCanaryResult, "operation"> {
  return { reason, status: "skipped" };
}

function toSafeCanaryError(error: unknown): {
  message: string;
  name: string;
  status?: number;
} {
  if (!(error instanceof Error)) {
    return { message: String(error), name: "UnknownError" };
  }
  const status =
    "status" in error && typeof error.status === "number"
      ? error.status
      : undefined;
  return { message: error.message, name: error.name, status };
}
