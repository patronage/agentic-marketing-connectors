import { normalizeCustomerId } from "../core/index.js";
import { validateBrief } from "../deploy/parse-brief.js";
import type {
  BriefSitelink,
  CampaignBrief,
  DeployCampaignInput,
} from "../deploy/types.js";
import type { GoogleAdsClient } from "../rest/index.js";

const BUDGET_TEMP_ID = "-1";
const CAMPAIGN_TEMP_ID = "-2";
const AD_GROUP_TEMP_ID_START = -10;
const ASSET_TEMP_ID_START = -100;

const LANGUAGE_MAP: Record<string, number> = {
  de: 1001,
  german: 1001,
  en: 1000,
  "en-us": 1000,
  english: 1000,
  es: 1003,
  spanish: 1003,
  fr: 1002,
  french: 1002,
  ja: 1005,
  japanese: 1005,
  ko: 1012,
  korean: 1012,
  pt: 1014,
  portuguese: 1014,
  zh: 1017,
  chinese: 1017,
};

export interface DeployCampaignPlan {
  operations: unknown[];
  summary: {
    adGroups: number;
    ads: number;
    campaignNegativeKeywords: number;
    callouts: number;
    keywords: number;
    negativeKeywords: number;
    sitelinks: number;
    structuredSnippets: number;
  };
}

export function buildDeployCampaignOperations(
  input: DeployCampaignInput
): unknown[] {
  return planDeployCampaign(input).operations;
}

export function planDeployCampaign(
  input: DeployCampaignInput
): DeployCampaignPlan {
  const customerId = normalizeCustomerId(input.customerId);
  assertNumericId(customerId, "customerId");
  assertStatus(input.status);

  const validationErrors = validateBrief(input.brief);
  if (validationErrors.length > 0) {
    throw new Error(`Invalid campaign brief:\n${validationErrors.join("\n")}`);
  }

  const budgetResourceName = `customers/${customerId}/campaignBudgets/${BUDGET_TEMP_ID}`;
  const campaignResourceName = `customers/${customerId}/campaigns/${CAMPAIGN_TEMP_ID}`;
  const adGroupResourceNames = input.brief.ad_groups.map(
    (_, index) =>
      `customers/${customerId}/adGroups/${AD_GROUP_TEMP_ID_START - index}`
  );
  const operations: unknown[] = [
    buildBudgetOperation(input.brief, budgetResourceName),
    buildCampaignOperation(
      input.brief,
      campaignResourceName,
      budgetResourceName,
      input.status
    ),
    ...buildCampaignNegativeKeywordOperations(
      input.brief,
      campaignResourceName
    ),
    ...buildGeoTargetOperations(input.brief, campaignResourceName),
    buildLanguageTargetOperation(input.brief, campaignResourceName),
    ...buildAdGroupOperations(
      input.brief,
      campaignResourceName,
      adGroupResourceNames
    ),
    ...buildKeywordOperations(input.brief, adGroupResourceNames),
    ...buildNegativeKeywordOperations(input.brief, adGroupResourceNames),
    ...buildAdOperations(input.brief, adGroupResourceNames),
    ...buildExtensionOperations(input.brief, customerId, campaignResourceName),
  ];

  return {
    operations,
    summary: summarizeBrief(input.brief),
  };
}

export async function deployCampaign(
  client: GoogleAdsClient,
  input: DeployCampaignInput
) {
  return client.mutate({
    customerId: normalizeCustomerId(input.customerId),
    operations: buildDeployCampaignOperations(input),
    validateOnly: input.mode !== "execute",
  });
}

function buildBudgetOperation(
  brief: CampaignBrief,
  resourceName: string
): unknown {
  return {
    campaignBudgetOperation: {
      create: {
        amountMicros: Math.round(brief.frontmatter.budget_daily * 1_000_000),
        deliveryMethod: "STANDARD",
        explicitlyShared: false,
        name: `${brief.frontmatter.campaign_name} Budget`,
        resourceName,
      },
    },
  };
}

function buildCampaignOperation(
  brief: CampaignBrief,
  resourceName: string,
  budgetResourceName: string,
  status: "ENABLED" | "PAUSED"
): unknown {
  return {
    campaignOperation: {
      create: {
        advertisingChannelType: "SEARCH",
        campaignBudget: budgetResourceName,
        containsEuPoliticalAdvertising:
          "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
        endDate: brief.frontmatter.end_date,
        geoTargetTypeSetting: {
          negativeGeoTargetType: "PRESENCE",
          positiveGeoTargetType: "PRESENCE",
        },
        manualCpc: { enhancedCpcEnabled: false },
        name: brief.frontmatter.campaign_name,
        networkSettings: {
          targetContentNetwork: false,
          targetGoogleSearch: true,
          targetSearchNetwork: false,
        },
        resourceName,
        startDate: brief.frontmatter.start_date,
        status,
      },
    },
  };
}

function buildCampaignNegativeKeywordOperations(
  brief: CampaignBrief,
  campaignResourceName: string
): unknown[] {
  return brief.campaign_negative_keywords.map((keyword) => ({
    campaignCriterionOperation: {
      create: {
        campaign: campaignResourceName,
        keyword: {
          matchType: keyword.match_type,
          text: keyword.text,
        },
        negative: true,
      },
    },
  }));
}

function buildGeoTargetOperations(
  brief: CampaignBrief,
  campaignResourceName: string
): unknown[] {
  return brief.frontmatter.geographic_targets.map((target) => ({
    campaignCriterionOperation: {
      create: {
        campaign: campaignResourceName,
        location: {
          geoTargetConstant: normalizeGeoTargetConstant(target),
        },
        negative: false,
      },
    },
  }));
}

function buildLanguageTargetOperation(
  brief: CampaignBrief,
  campaignResourceName: string
): unknown {
  const languageId = resolveLanguageId(brief.frontmatter.language);

  return {
    campaignCriterionOperation: {
      create: {
        campaign: campaignResourceName,
        language: {
          languageConstant: `languageConstants/${languageId}`,
        },
      },
    },
  };
}

function buildAdGroupOperations(
  brief: CampaignBrief,
  campaignResourceName: string,
  adGroupResourceNames: string[]
): unknown[] {
  return brief.ad_groups.map((adGroup, index) => ({
    adGroupOperation: {
      create: {
        campaign: campaignResourceName,
        cpcBidMicros: 1_500_000,
        name: adGroup.name,
        resourceName: adGroupResourceNames[index],
        status: "ENABLED",
        type: "SEARCH_STANDARD",
      },
    },
  }));
}

function buildKeywordOperations(
  brief: CampaignBrief,
  adGroupResourceNames: string[]
): unknown[] {
  return brief.ad_groups.flatMap((adGroup, index) =>
    adGroup.keywords.map((keyword) => ({
      adGroupCriterionOperation: {
        create: {
          adGroup: adGroupResourceNames[index],
          keyword: {
            matchType: keyword.match_type,
            text: keyword.text,
          },
          status: "ENABLED",
        },
      },
    }))
  );
}

function buildNegativeKeywordOperations(
  brief: CampaignBrief,
  adGroupResourceNames: string[]
): unknown[] {
  return brief.ad_groups.flatMap((adGroup, index) =>
    adGroup.negative_keywords.map((keyword) => ({
      adGroupCriterionOperation: {
        create: {
          adGroup: adGroupResourceNames[index],
          keyword: {
            matchType: keyword.match_type,
            text: keyword.text,
          },
          negative: true,
        },
      },
    }))
  );
}

function buildAdOperations(
  brief: CampaignBrief,
  adGroupResourceNames: string[]
): unknown[] {
  return brief.ad_groups.flatMap((adGroup, index) =>
    adGroup.ads.map((ad) => ({
      adGroupAdOperation: {
        create: {
          ad: {
            finalUrls: [ad.final_url],
            responsiveSearchAd: {
              descriptions: ad.descriptions.map((text) => ({ text })),
              headlines: ad.headlines.map((text) => ({ text })),
              ...(ad.path_1 ? { path1: ad.path_1 } : {}),
              ...(ad.path_2 ? { path2: ad.path_2 } : {}),
            },
          },
          adGroup: adGroupResourceNames[index],
          status: "ENABLED",
        },
      },
    }))
  );
}

function buildExtensionOperations(
  brief: CampaignBrief,
  customerId: string,
  campaignResourceName: string
): unknown[] {
  const operations: unknown[] = [];
  let assetTempId = ASSET_TEMP_ID_START;
  const baseUrl = extractBaseUrl(brief);

  for (const sitelink of brief.extensions.sitelinks) {
    const assetResourceName = assetResource(customerId, assetTempId);
    assetTempId -= 1;
    operations.push(
      {
        assetOperation: {
          create: {
            finalUrls: [resolveSitelinkFinalUrl(sitelink, baseUrl)],
            name: `Sitelink: ${sitelink.link_text}`,
            resourceName: assetResourceName,
            sitelinkAsset: {
              ...(sitelink.description_1
                ? { description1: sitelink.description_1 }
                : {}),
              ...(sitelink.description_2
                ? { description2: sitelink.description_2 }
                : {}),
              linkText: sitelink.link_text,
            },
          },
        },
      },
      {
        campaignAssetOperation: {
          create: {
            asset: assetResourceName,
            campaign: campaignResourceName,
            fieldType: "SITELINK",
          },
        },
      }
    );
  }

  for (const callout of brief.extensions.callouts) {
    const assetResourceName = assetResource(customerId, assetTempId);
    assetTempId -= 1;
    operations.push(
      {
        assetOperation: {
          create: {
            calloutAsset: { calloutText: callout },
            name: `Callout: ${callout}`,
            resourceName: assetResourceName,
          },
        },
      },
      {
        campaignAssetOperation: {
          create: {
            asset: assetResourceName,
            campaign: campaignResourceName,
            fieldType: "CALLOUT",
          },
        },
      }
    );
  }

  for (const snippet of brief.extensions.structured_snippets) {
    const assetResourceName = assetResource(customerId, assetTempId);
    assetTempId -= 1;
    operations.push(
      {
        assetOperation: {
          create: {
            name: `Snippet: ${snippet.header}`,
            resourceName: assetResourceName,
            structuredSnippetAsset: {
              header: snippet.header,
              values: snippet.values,
            },
          },
        },
      },
      {
        campaignAssetOperation: {
          create: {
            asset: assetResourceName,
            campaign: campaignResourceName,
            fieldType: "STRUCTURED_SNIPPET",
          },
        },
      }
    );
  }

  return operations;
}

function resolveSitelinkFinalUrl(
  sitelink: BriefSitelink,
  baseUrl: string
): string {
  if (sitelink.final_url) {
    return sitelink.final_url;
  }

  const path = sitelink.path ?? "";
  if (!baseUrl) {
    return path;
  }

  try {
    return new URL(path, baseUrl).toString();
  } catch {
    const separator = path.startsWith("/") ? "" : "/";
    return `${baseUrl}${separator}${path}`;
  }
}

function summarizeBrief(brief: CampaignBrief): DeployCampaignPlan["summary"] {
  return {
    adGroups: brief.ad_groups.length,
    ads: brief.ad_groups.reduce((sum, adGroup) => sum + adGroup.ads.length, 0),
    campaignNegativeKeywords: brief.campaign_negative_keywords.length,
    callouts: brief.extensions.callouts.length,
    keywords: brief.ad_groups.reduce(
      (sum, adGroup) => sum + adGroup.keywords.length,
      0
    ),
    negativeKeywords: brief.ad_groups.reduce(
      (sum, adGroup) => sum + adGroup.negative_keywords.length,
      0
    ),
    sitelinks: brief.extensions.sitelinks.length,
    structuredSnippets: brief.extensions.structured_snippets.length,
  };
}

function normalizeGeoTargetConstant(target: string): string {
  const trimmed = target.trim();
  if (/^\d+$/.test(trimmed)) {
    return `geoTargetConstants/${trimmed}`;
  }

  if (/^geoTargetConstants\/\d+$/.test(trimmed)) {
    return trimmed;
  }

  const normalized = trimmed.toLowerCase();
  if (
    normalized === "us" ||
    normalized === "usa" ||
    normalized === "united states"
  ) {
    return "geoTargetConstants/2840";
  }

  throw new Error(
    `Unsupported geographic target "${target}". Use a numeric geo target ID, geoTargetConstants/<id>, or United States.`
  );
}

function resolveLanguageId(language: string): number {
  const id = LANGUAGE_MAP[language.trim().toLowerCase()];
  if (!id) {
    throw new Error(`Unknown language: ${language}`);
  }
  return id;
}

function extractBaseUrl(brief: CampaignBrief): string {
  for (const adGroup of brief.ad_groups) {
    for (const ad of adGroup.ads) {
      if (ad.final_url) {
        try {
          const url = new URL(ad.final_url);
          return `${url.protocol}//${url.host}`;
        } catch {
          return ad.final_url;
        }
      }
    }
  }
  return "";
}

function assetResource(customerId: string, tempId: number): string {
  return `customers/${customerId}/assets/${tempId}`;
}

function assertNumericId(value: string, fieldName: string): void {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${fieldName} must contain only digits.`);
  }
}

function assertStatus(value: string): asserts value is "ENABLED" | "PAUSED" {
  if (value !== "ENABLED" && value !== "PAUSED") {
    throw new Error("status must be ENABLED or PAUSED.");
  }
}
