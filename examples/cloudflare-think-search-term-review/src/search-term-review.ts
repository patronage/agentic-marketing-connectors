import { createGoogleAdsClient } from "@patronage/google-ads";
import {
  getSearchTerms,
  type SearchTermMetrics,
} from "@patronage/google-ads/reports";
import type { GoogleAdsClient } from "@patronage/google-ads/rest";
import {
  addCampaignNegativeKeywords,
  buildCampaignNegativeKeywordOperations,
} from "@patronage/google-ads/workflows/negative-keywords";
import { z } from "zod";

export const searchTermReviewInputSchema = z.object({
  campaignId: z.string().min(1).default("987654321"),
  customerId: z.string().min(1).default("123-456-7890"),
  days: z
    .union([z.literal(7), z.literal(14), z.literal(30), z.literal(90)])
    .default(30),
  maxRecommendations: z.coerce.number().int().min(1).max(10).default(3),
  minimumWastedSpend: z.coerce.number().min(1).default(75),
});

export type SearchTermReviewInput = z.output<
  typeof searchTermReviewInputSchema
>;

export interface NegativeKeywordRecommendation {
  evidence: {
    clicks: number;
    conversions: number;
    cost: number;
    searchTerm: string;
  };
  matchType: "EXACT" | "PHRASE";
  reason: string;
  text: string;
}

export interface NegativeKeywordValidation {
  mode: "validate";
  operationCount: number;
  requestId: string | null;
  validateOnly: true;
}

export type SearchTermReviewStatus = "approved" | "draft" | "reviewed";

export interface SearchTermReview {
  account: {
    customerId: string;
    provider: "google_ads";
  };
  campaign: {
    id: string;
    name: string;
  };
  dateRange: {
    days: 7 | 14 | 30 | 90;
    label: string;
  };
  findings: {
    reviewedSearchTerms: number;
    wastedSpend: number;
    zeroConversionSpend: number;
  };
  mode: "demo";
  nextSteps: string[];
  recommendations: NegativeKeywordRecommendation[];
  source: "synthetic_google_ads_search_terms";
  status: SearchTermReviewStatus;
}

export interface SearchTermReviewWithValidation extends SearchTermReview {
  status: "reviewed";
  validation: NegativeKeywordValidation;
}

export interface ApprovedSearchTermReview extends Omit<
  SearchTermReviewWithValidation,
  "status"
> {
  approvedAt: string;
  status: "approved";
}

const syntheticCampaignId = "987654321";
const syntheticCampaignName = "Nonprofit Growth Search";

const wasteSignals = ["free", "jobs", "salary", "template", "sample", "cheap"];

export async function buildSearchTermReview(
  client: GoogleAdsClient,
  rawInput: Partial<SearchTermReviewInput> = {}
): Promise<SearchTermReview> {
  const input = searchTermReviewInputSchema.parse(rawInput);
  const searchTerms = await getSearchTerms(client, {
    campaignId: input.campaignId,
    customerId: input.customerId,
    days: input.days,
  });
  const recommendations = recommendNegativeKeywords(searchTerms, input);
  const zeroConversionSpend = searchTerms
    .filter((term) => term.conversions === 0)
    .reduce((total, term) => total + term.cost, 0);

  return {
    account: {
      customerId: input.customerId.replaceAll("-", ""),
      provider: "google_ads",
    },
    campaign: {
      id: input.campaignId,
      name: searchTerms[0]?.campaignName ?? syntheticCampaignName,
    },
    dateRange: {
      days: input.days,
      label: `LAST_${input.days}_DAYS`,
    },
    findings: {
      reviewedSearchTerms: searchTerms.length,
      wastedSpend: roundCurrency(
        recommendations.reduce(
          (total, recommendation) => total + recommendation.evidence.cost,
          0
        )
      ),
      zeroConversionSpend: roundCurrency(zeroConversionSpend),
    },
    mode: "demo",
    nextSteps:
      recommendations.length === 0
        ? [
            "No negative keyword candidates cleared the demo threshold.",
            "Lower the minimum wasted spend threshold or review a longer date range.",
          ]
        : [
            "Review each recommendation and remove any term that may still indicate buyer intent.",
            "Run validate-only before execute mode.",
            "Require a human approval step before adding these negatives to a live account.",
          ],
    recommendations,
    source: "synthetic_google_ads_search_terms",
    status: "draft",
  };
}

export async function validateNegativeKeywordDraft(
  client: GoogleAdsClient,
  review: SearchTermReview
): Promise<SearchTermReviewWithValidation> {
  const keywords = review.recommendations.map((recommendation) => ({
    matchType: recommendation.matchType,
    text: recommendation.text,
  }));

  if (keywords.length === 0) {
    return {
      ...review,
      status: "reviewed",
      validation: {
        mode: "validate",
        operationCount: 0,
        requestId: null,
        validateOnly: true,
      },
    };
  }

  const operations = buildCampaignNegativeKeywordOperations({
    campaignId: review.campaign.id,
    customerId: review.account.customerId,
    keywords,
  });
  const result = await addCampaignNegativeKeywords(client, {
    campaignId: review.campaign.id,
    customerId: review.account.customerId,
    keywords,
    mode: "validate",
  });

  return {
    ...review,
    status: "reviewed",
    validation: {
      mode: "validate",
      operationCount: operations.length,
      requestId: result.requestId,
      validateOnly: true,
    },
  };
}

export function createDemoGoogleAdsClient(): GoogleAdsClient {
  return createGoogleAdsClient({
    auth: {
      getAccessToken: async () => "example-access-token",
    },
    developerToken: "example-developer-token",
    fetch: fakeGoogleAdsFetch,
  });
}

async function fakeGoogleAdsFetch(
  url: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  const requestUrl =
    url instanceof Request ? new URL(url.url) : new URL(String(url));
  const body = JSON.parse(String(init?.body ?? "{}")) as {
    mutateOperations?: unknown[];
    query?: string;
    validateOnly?: boolean;
  };

  if (requestUrl.pathname.endsWith("googleAds:search")) {
    if (!body.query || !body.query.includes("search_term_view")) {
      return Response.json(
        { error: { message: "Unexpected demo search query." } },
        { status: 400 }
      );
    }

    return Response.json(
      { results: syntheticSearchTermRows },
      { headers: { "request-id": "example-search-request-id" } }
    );
  }

  if (requestUrl.pathname.endsWith("googleAds:mutate")) {
    if (body.validateOnly !== true) {
      return Response.json(
        {
          error: {
            message:
              "This example only supports validate-only mutations in demo mode.",
          },
        },
        { status: 400 }
      );
    }

    return Response.json(
      { mutateOperationResponses: [] },
      { headers: { "request-id": "example-validate-request-id" } }
    );
  }

  return Response.json(
    { error: { message: "Unexpected Google Ads demo endpoint." } },
    { status: 404 }
  );
}

function recommendNegativeKeywords(
  searchTerms: SearchTermMetrics[],
  input: SearchTermReviewInput
): NegativeKeywordRecommendation[] {
  const seenKeywords = new Set<string>();

  return searchTerms
    .filter(
      (term) =>
        term.conversions === 0 &&
        term.cost >= input.minimumWastedSpend &&
        wasteSignals.some((signal) =>
          term.searchTerm.toLocaleLowerCase().includes(signal)
        )
    )
    .map((term) => ({
      evidence: {
        clicks: term.clicks,
        conversions: term.conversions,
        cost: roundCurrency(term.cost),
        searchTerm: term.searchTerm,
      },
      matchType: "PHRASE" as const,
      reason:
        "The term spent meaningful budget, produced no conversions, and contains a low-intent qualifier.",
      text: negativeKeywordText(term.searchTerm),
    }))
    .filter((recommendation) => {
      const key = `${recommendation.matchType}:${recommendation.text}`;

      if (seenKeywords.has(key)) {
        return false;
      }

      seenKeywords.add(key);
      return true;
    })
    .slice(0, input.maxRecommendations);
}

function negativeKeywordText(searchTerm: string): string {
  const lower = searchTerm.toLocaleLowerCase();

  if (lower.includes("free")) {
    return "free";
  }

  if (lower.includes("jobs") || lower.includes("salary")) {
    return "jobs";
  }

  if (lower.includes("template") || lower.includes("sample")) {
    return "template";
  }

  if (lower.includes("cheap")) {
    return "cheap";
  }

  return searchTerm;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

const syntheticSearchTermRows = [
  {
    adGroup: {
      id: "112233",
      name: "Mission-driven marketing",
    },
    campaign: {
      id: syntheticCampaignId,
      name: syntheticCampaignName,
    },
    metrics: {
      averageCpc: "5750000",
      clicks: 32,
      conversions: 0,
      costMicros: "184000000",
      ctr: 0.031,
      impressions: 1030,
    },
    searchTermView: {
      searchTerm: "free nonprofit marketing plan template",
      status: "ADDED",
    },
  },
  {
    adGroup: {
      id: "112233",
      name: "Mission-driven marketing",
    },
    campaign: {
      id: syntheticCampaignId,
      name: syntheticCampaignName,
    },
    metrics: {
      averageCpc: "6170000",
      clicks: 21,
      conversions: 0,
      costMicros: "129570000",
      ctr: 0.027,
      impressions: 778,
    },
    searchTermView: {
      searchTerm: "nonprofit marketing coordinator jobs",
      status: "ADDED",
    },
  },
  {
    adGroup: {
      id: "112233",
      name: "Mission-driven marketing",
    },
    campaign: {
      id: syntheticCampaignId,
      name: syntheticCampaignName,
    },
    metrics: {
      averageCpc: "7050000",
      clicks: 59,
      conversions: 7,
      costMicros: "415950000",
      ctr: 0.044,
      impressions: 1342,
    },
    searchTermView: {
      searchTerm: "nonprofit google ads agency",
      status: "ADDED",
    },
  },
  {
    adGroup: {
      id: "112233",
      name: "Mission-driven marketing",
    },
    campaign: {
      id: syntheticCampaignId,
      name: syntheticCampaignName,
    },
    metrics: {
      averageCpc: "4400000",
      clicks: 19,
      conversions: 3,
      costMicros: "83600000",
      ctr: 0.025,
      impressions: 760,
    },
    searchTermView: {
      searchTerm: "grant marketing support for nonprofits",
      status: "ADDED",
    },
  },
  {
    adGroup: {
      id: "112233",
      name: "Mission-driven marketing",
    },
    campaign: {
      id: syntheticCampaignId,
      name: syntheticCampaignName,
    },
    metrics: {
      averageCpc: "3920000",
      clicks: 24,
      conversions: 0,
      costMicros: "94080000",
      ctr: 0.029,
      impressions: 828,
    },
    searchTermView: {
      searchTerm: "sample nonprofit ads report",
      status: "ADDED",
    },
  },
] as const;
