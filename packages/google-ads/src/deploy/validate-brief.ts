import type {
  BriefExtensions,
  BriefFrontmatter,
  CampaignBrief,
} from "./types.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const BIDDING_STRATEGIES = [
  "maximize-conversions",
  "maximize-clicks",
  "manual-cpc",
] as const;

// Google Ads rejects structuredSnippetAsset.header values outside its
// predefined English list (INVALID_STRUCTURED_SNIPPET_HEADER); see
// https://support.google.com/google-ads/answer/6280012
const STRUCTURED_SNIPPET_HEADERS: readonly string[] = [
  "Amenities",
  "Brands",
  "Courses",
  "Degree programs",
  "Destinations",
  "Featured hotels",
  "Insurance coverage",
  "Models",
  "Neighborhoods",
  "Service catalog",
  "Shows",
  "Styles",
  "Types",
];

const CANONICAL_HEADER_BY_LOWERCASE = new Map(
  STRUCTURED_SNIPPET_HEADERS.map((header) => [header.toLowerCase(), header])
);

export interface CampaignBriefFinding {
  message: string;
  path: string;
}

export function validateCampaignBrief(
  brief: CampaignBrief
): CampaignBriefFinding[] {
  const findings: CampaignBriefFinding[] = [];

  if (brief.ad_groups.length === 0) {
    findings.push({
      message: "Brief must contain at least one ad group",
      path: "ad_groups",
    });
  }

  for (const [groupIndex, adGroup] of brief.ad_groups.entries()) {
    const groupPath = `ad_groups[${groupIndex}]`;
    if (adGroup.keywords.length === 0) {
      findings.push({
        message: `Ad Group "${adGroup.name}" must have at least one keyword`,
        path: `${groupPath}.keywords`,
      });
    }
    if (adGroup.ads.length === 0) {
      findings.push({
        message: `Ad Group "${adGroup.name}" must have at least one ad`,
        path: `${groupPath}.ads`,
      });
    }

    for (const [adIndex, ad] of adGroup.ads.entries()) {
      const adPath = `${groupPath}.ads[${adIndex}]`;
      if (ad.headlines.length < 3) {
        findings.push({
          message: `Responsive search ads require at least 3 headlines (found ${ad.headlines.length})`,
          path: `${adPath}.headlines`,
        });
      }
      if (ad.descriptions.length < 2) {
        findings.push({
          message: `Responsive search ads require at least 2 descriptions (found ${ad.descriptions.length})`,
          path: `${adPath}.descriptions`,
        });
      }
      for (const [headlineIndex, headline] of ad.headlines.entries()) {
        if (headline.length > 30) {
          findings.push({
            message: `Headline exceeds 30 characters (${headline.length})`,
            path: `${adPath}.headlines[${headlineIndex}]`,
          });
        }
      }
      for (const [descriptionIndex, description] of ad.descriptions.entries()) {
        if (description.length > 90) {
          findings.push({
            message: `Description exceeds 90 characters (${description.length})`,
            path: `${adPath}.descriptions[${descriptionIndex}]`,
          });
        }
      }
      if (!ad.final_url) {
        findings.push({
          message: `Ad Group "${adGroup.name}" ad is missing Final URL`,
          path: `${adPath}.final_url`,
        });
      }
    }
  }

  findings.push(
    ...validateStructuredSnippets(brief.extensions.structured_snippets),
    ...validateFrontmatter(brief.frontmatter)
  );
  return findings;
}

function validateStructuredSnippets(
  snippets: BriefExtensions["structured_snippets"]
): CampaignBriefFinding[] {
  const findings: CampaignBriefFinding[] = [];
  for (const [index, snippet] of snippets.entries()) {
    const canonical = CANONICAL_HEADER_BY_LOWERCASE.get(
      snippet.header.toLowerCase()
    );
    if (canonical === snippet.header) {
      continue;
    }
    findings.push({
      message: canonical
        ? `Structured snippet header "${snippet.header}" must use the predefined casing "${canonical}"`
        : `Structured snippet header "${snippet.header}" is not a Google Ads predefined header (valid: ${STRUCTURED_SNIPPET_HEADERS.join(", ")})`,
      path: `extensions.structured_snippets[${index}].header`,
    });
  }
  return findings;
}

// The full max_cpc invariant set lives here, not only in parse-brief: the
// public deploy entry points accept a CampaignBrief object directly and gate
// on validateCampaignBrief, so parse-time checks alone would not bind them.
function validateMaxCpc(frontmatter: BriefFrontmatter): CampaignBriefFinding[] {
  const maxCpc = frontmatter.max_cpc;
  if (maxCpc === undefined) {
    return [];
  }
  const findings: CampaignBriefFinding[] = [];
  const path = "frontmatter.max_cpc";
  if (!(typeof maxCpc === "number" && Number.isFinite(maxCpc))) {
    findings.push({ message: "max_cpc must be a finite number", path });
  } else if (maxCpc <= 0) {
    findings.push({ message: "max_cpc must be a positive number", path });
  } else if (Math.abs(maxCpc * 100 - Math.round(maxCpc * 100)) > 1e-6) {
    findings.push({ message: "max_cpc must be a whole number of cents", path });
  } else if (
    Math.round(maxCpc * 100) < 1 ||
    Math.round(maxCpc * 100) > 100_000
  ) {
    findings.push({ message: "max_cpc must be between $0.01 and $1000", path });
  }
  if (frontmatter.bidding !== "maximize-clicks") {
    findings.push({
      message: `max_cpc only applies under maximize-clicks bidding; with bidding "${frontmatter.bidding}" the ceiling would be silently ignored`,
      path,
    });
  }
  return findings;
}

function validateFrontmatter(
  frontmatter: BriefFrontmatter
): CampaignBriefFinding[] {
  const findings: CampaignBriefFinding[] = [];
  if (!BIDDING_STRATEGIES.includes(frontmatter.bidding)) {
    findings.push({
      message: `Bidding strategy must be one of: ${BIDDING_STRATEGIES.join(", ")}`,
      path: "frontmatter.bidding",
    });
  }
  if (!Number.isFinite(frontmatter.budget_daily)) {
    findings.push({
      message: "Daily budget must be a finite number",
      path: "frontmatter.budget_daily",
    });
  } else if (frontmatter.budget_daily <= 0) {
    findings.push({
      message: "Daily budget must be positive",
      path: "frontmatter.budget_daily",
    });
  }
  if (!frontmatter.campaign_name.trim()) {
    findings.push({
      message: "Campaign name must not be empty",
      path: "frontmatter.campaign_name",
    });
  }
  findings.push(...validateMaxCpc(frontmatter));

  const hasValidStartDate = DATE_PATTERN.test(frontmatter.start_date);
  const hasValidEndDate = DATE_PATTERN.test(frontmatter.end_date);
  if (!hasValidStartDate) {
    findings.push({
      message: "Start date must be in YYYY-MM-DD format",
      path: "frontmatter.start_date",
    });
  }
  if (!hasValidEndDate) {
    findings.push({
      message: "End date must be in YYYY-MM-DD format",
      path: "frontmatter.end_date",
    });
  }
  if (
    hasValidStartDate &&
    hasValidEndDate &&
    frontmatter.start_date > frontmatter.end_date
  ) {
    findings.push({
      message: "Start date must not be after end date",
      path: "frontmatter.start_date",
    });
  }
  if (frontmatter.geographic_targets.length === 0) {
    findings.push({
      message: "Must have at least one geographic target",
      path: "frontmatter.geographic_targets",
    });
  }
  return findings;
}
