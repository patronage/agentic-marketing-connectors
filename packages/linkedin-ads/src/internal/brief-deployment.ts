import type {
  CreateLinkedInCampaignInput,
  CreateLinkedInLeadFormInput,
  LinkedInCampaignStatus,
  LinkedInTargetingCriteria,
} from "./types.js";

export interface LinkedInBriefConcept {
  body: string;
  cta: string;
  headline: string;
  id: string;
  image: string;
  name: string;
}

export interface LinkedInCampaignBrief {
  campaign: { budget: number; name: string; organization: string };
  concepts: LinkedInBriefConcept[];
  leadGenForm: {
    description: string;
    headline: string;
    thankYouCta: string;
    thankYouMessage: string;
    thankYouUrl: string;
  };
  targeting: { industries: string[]; location: string[] };
}

export interface LinkedInBriefDeploymentPlan {
  campaign: CreateLinkedInCampaignInput;
  concepts: LinkedInBriefConcept[];
  leadForm: CreateLinkedInLeadFormInput;
}

export function parseLinkedInCampaignBrief(
  html: string,
  basePath = ""
): LinkedInCampaignBrief {
  const cover = sectionByClass(html, "cover") ?? html;
  const name =
    textOfFirst(cover, "h1") ||
    textOfFirst(html, "title").split("|")[0]?.trim() ||
    "Untitled Campaign";
  const coverText = stripHtml(cover);
  const organization =
    /(?:for|by)\s+(?<organization>[\w &-]+)/iu
      .exec(coverText)
      ?.groups?.organization?.trim() ?? "Unknown Organization";
  const budget = Number(
    (/\$(?<budget>[\d,]+)/u.exec(html)?.groups?.budget ?? "0").replaceAll(
      ",",
      ""
    )
  );
  const concepts = [
    ...html.matchAll(
      /<[^>]*class=["'][^"']*image-card[^"']*["'][^>]*>(?<card>[\s\S]*?)<\/[^>]+>/giu
    ),
  ].map((match, index) => {
    const card = match.groups?.card ?? "";
    const image =
      /<img[^>]+src=["'](?<source>[^"']+)["']/iu.exec(card)?.groups?.source ??
      "";
    const conceptName = textOfFirst(card, "h4") || `Concept ${index + 1}`;
    return {
      body: stripHtml(card),
      cta: "Learn More",
      headline: conceptName,
      id: `concept-${index + 1}`,
      image: resolveBriefAsset(basePath, image),
      name: conceptName,
    };
  });
  const location = /california/iu.test(html)
    ? ["California"]
    : ["United States"];
  const industries = [
    ["Environmental Services", /environmental|sustainability/iu],
    ["Nonprofit Organization Management", /nonprofit/iu],
    ["Government Administration", /government/iu],
    ["Renewables & Environment", /clean energy|renewable/iu],
  ]
    .filter(([, pattern]) => (pattern as RegExp).test(html))
    .map(([label]) => label as string);
  const landing = sectionById(html, "landing") ?? "";
  return {
    campaign: { budget, name, organization },
    concepts,
    leadGenForm: {
      description:
        textOfClass(landing, "body-copy") || "Sign up to learn more.",
      headline: textOfClass(landing, "headline") || "Get Updates",
      thankYouCta: "Learn More",
      thankYouMessage: "Thanks for signing up!",
      thankYouUrl: /https?:\/\/[^\s"<]+/u.exec(landing)?.[0] ?? "",
    },
    targeting: { industries, location },
  };
}

export function buildLinkedInBriefDeploymentPlan(input: {
  brief: LinkedInCampaignBrief;
  campaignGroup: string;
  maxCreatives?: number;
  privacyPolicyUrl: string;
  status?: LinkedInCampaignStatus;
}): LinkedInBriefDeploymentPlan {
  const targetingCriteria = buildTargeting(input.brief.targeting);
  return {
    campaign: {
      campaignGroup: input.campaignGroup,
      dailyBudget: {
        amount: String(
          Math.max(50, Math.round(input.brief.campaign.budget / 30))
        ),
        currencyCode: "USD",
      },
      name: input.brief.campaign.name,
      objectiveType: "LEAD_GENERATION",
      status: input.status ?? "PAUSED",
      targetingCriteria,
      totalBudget: {
        amount: String(input.brief.campaign.budget),
        currencyCode: "USD",
      },
    },
    concepts: input.brief.concepts.slice(0, input.maxCreatives ?? 10),
    leadForm: {
      description: input.brief.leadGenForm.description,
      headline: input.brief.leadGenForm.headline,
      name: `${input.brief.campaign.name} - Lead Gen`,
      privacyPolicyUrl: input.privacyPolicyUrl,
      questions: [
        { predefinedField: "FIRST_NAME", required: true },
        { predefinedField: "LAST_NAME", required: true },
        { predefinedField: "EMAIL", required: true },
        { label: "ZIP Code", name: "zipCode", required: true },
      ],
      thankYouMessage: {
        landingPageCallToAction: input.brief.leadGenForm.thankYouCta,
        landingPageUrl: input.brief.leadGenForm.thankYouUrl,
        message: input.brief.leadGenForm.thankYouMessage,
      },
    },
  };
}

function buildTargeting(
  input: LinkedInCampaignBrief["targeting"]
): LinkedInTargetingCriteria {
  const locations: Record<string, string> = {
    california: "urn:li:geo:102095887",
    "united states": "urn:li:geo:103644278",
  };
  const industries: Record<string, string> = {
    "environmental services": "urn:li:industry:88",
    "government administration": "urn:li:industry:75",
    "nonprofit organization management": "urn:li:industry:94",
    "renewables & environment": "urn:li:industry:88",
  };
  return {
    includedTargetingFacets: {
      industries: input.industries
        .map((value) => industries[value.toLowerCase()])
        .filter((value): value is string => Boolean(value)),
      locations: input.location
        .map((value) => locations[value.toLowerCase()])
        .filter((value): value is string => Boolean(value)),
    },
  };
}

function resolveBriefAsset(basePath: string, value: string): string {
  if (!value || /^(?:https?:)?\/\//u.test(value) || !basePath) {
    return value;
  }
  return `${basePath.replace(/\/$/u, "")}/${value.replace(/^\.\//u, "")}`;
}

function sectionByClass(html: string, className: string): string | undefined {
  return new RegExp(
    `<[^>]*class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`,
    "iu"
  ).exec(html)?.[1];
}

function sectionById(html: string, id: string): string | undefined {
  return new RegExp(
    `<[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`,
    "iu"
  ).exec(html)?.[1];
}

function textOfClass(html: string, className: string): string {
  const content = new RegExp(
    `<[^>]*class=["'][^"']*${className}[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`,
    "iu"
  ).exec(html)?.[1];
  return stripHtml(content ?? "");
}

function textOfFirst(html: string, tag: string): string {
  return stripHtml(
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "iu").exec(html)?.[1] ??
      ""
  );
}

function stripHtml(value: string): string {
  return value
    .replaceAll(/<[^>]+>/gu, " ")
    .replaceAll("&amp;", "&")
    .replaceAll(/\s+/gu, " ")
    .trim();
}
