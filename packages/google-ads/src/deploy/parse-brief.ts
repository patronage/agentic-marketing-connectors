import { parse as parseYaml } from "yaml";

import type {
  BriefAd,
  BriefAdGroup,
  BriefBiddingStrategy,
  BriefExtensions,
  BriefFrontmatter,
  BriefKeyword,
  BriefMatchType,
  BriefNegativeKeyword,
  BriefSitelink,
  CampaignBrief,
} from "./types.js";
import { validateCampaignBrief } from "./validate-brief.js";
import type { CampaignBriefFinding } from "./validate-brief.js";

export type CampaignBriefFormat = "json" | "markdown";
export type { CampaignBriefFinding } from "./validate-brief.js";
export { validateCampaignBrief } from "./validate-brief.js";

export interface CampaignBriefParseOptions {
  defaultBidding?: BriefBiddingStrategy;
  format: CampaignBriefFormat;
}

export class CampaignBriefParseError extends Error {
  readonly findings: CampaignBriefFinding[];
  readonly format: CampaignBriefFormat;

  constructor(input: {
    cause?: unknown;
    findings: CampaignBriefFinding[];
    format: CampaignBriefFormat;
  }) {
    super(
      `Invalid ${input.format} Campaign Brief:\n${input.findings
        .map(({ message, path }) => `${path}: ${message}`)
        .join("\n")}`,
      input.cause === undefined ? undefined : { cause: input.cause }
    );
    this.name = "CampaignBriefParseError";
    this.findings = input.findings;
    this.format = input.format;
  }
}

export function parseCampaignBrief(
  content: string,
  options: CampaignBriefParseOptions
): CampaignBrief {
  const defaultBidding = options.defaultBidding ?? "manual-cpc";
  let brief: CampaignBrief;
  try {
    brief =
      options.format === "json"
        ? parseJsonBriefContent(content, defaultBidding)
        : parseMarkdownBriefContent(content, defaultBidding);
  } catch (error) {
    throw new CampaignBriefParseError({
      cause: error,
      findings: [findingFromError(error)],
      format: options.format,
    });
  }

  const findings = validateCampaignBrief(brief);
  if (findings.length > 0) {
    throw new CampaignBriefParseError({ findings, format: options.format });
  }
  return brief;
}

function parseMarkdownBriefContent(
  content: string,
  defaultBidding: BriefBiddingStrategy
): CampaignBrief {
  const normalizedContent = normalizeMarkdownLineEndings(content);
  const frontmatter = parseFrontmatter(normalizedContent, defaultBidding);
  const body = extractBody(normalizedContent);

  return {
    ad_groups: parseAdGroups(body),
    campaign_negative_keywords: [],
    extensions: parseExtensions(body),
    frontmatter,
    objective: parseObjective(body),
  };
}

function parseJsonBriefContent(
  content: string,
  defaultBidding: BriefBiddingStrategy
): CampaignBrief {
  let raw: unknown;

  try {
    raw = JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Invalid JSON brief: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }

  return normalizeCampaignBrief(raw, defaultBidding);
}

function parseFrontmatter(
  content: string,
  defaultBidding: BriefBiddingStrategy
): BriefFrontmatter {
  const match = normalizeMarkdownLineEndings(content).match(
    /^---\n(?<capture1>[\s\S]*?)\n?---(?:\n|$)/u
  );
  if (!match) {
    throw new Error("No YAML frontmatter found (expected --- delimiters)");
  }

  const parsed = parseYaml(capture(match, 1));
  const raw = parsed === null ? {} : requireRecord(parsed, "frontmatter");
  const required = [
    "client",
    "campaign_name",
    "campaign_type",
    "budget_daily",
    "geographic_targets",
    "language",
    "start_date",
    "end_date",
  ];
  const missing = required.filter((key) => !(key in raw));
  if (missing.length > 0) {
    throw new Error(`Missing frontmatter fields: ${missing.join(", ")}`);
  }

  return {
    bidding: normalizeBidding(raw.bidding, defaultBidding),
    budget_daily: requireNumber(raw.budget_daily, "frontmatter.budget_daily"),
    campaign_name: requireString(
      raw.campaign_name,
      "frontmatter.campaign_name"
    ),
    campaign_type: normalizeCampaignType(raw.campaign_type),
    client: requireString(raw.client, "frontmatter.client"),
    end_date: requireString(raw.end_date, "frontmatter.end_date"),
    geographic_targets: Array.isArray(raw.geographic_targets)
      ? raw.geographic_targets.map((target, index) =>
          requireString(target, `frontmatter.geographic_targets[${index}]`)
        )
      : [
          requireString(
            raw.geographic_targets,
            "frontmatter.geographic_targets"
          ),
        ],
    language: requireString(raw.language, "frontmatter.language"),
    // Spread so an absent field stays absent: downstream plan fingerprinting
    // rejects objects carrying explicit undefined values.
    ...optionalMaxCpcEntry(raw.max_cpc),
    start_date: requireString(raw.start_date, "frontmatter.start_date"),
  };
}

function optionalMaxCpcEntry(value: unknown): { max_cpc?: number } {
  const maxCpc = optionalPositiveNumber(value, "frontmatter.max_cpc");
  return maxCpc === undefined ? {} : { max_cpc: maxCpc };
}

function optionalPositiveNumber(
  value: unknown,
  field: string
): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  // Stricter than requireNumber's coercion on purpose: `max_cpc: true` or a
  // quoted scalar must not silently become a bid ceiling.
  if (typeof value !== "number") {
    throw new TypeError(`${field} must be a number`);
  }
  const numericValue = requireNumber(value, field);
  if (numericValue <= 0) {
    throw new TypeError(`${field} must be a positive number`);
  }
  const cents = Math.round(numericValue * 100);
  if (Math.abs(numericValue * 100 - cents) > 1e-6) {
    throw new TypeError(`${field} must be a whole number of cents`);
  }
  if (cents < 1 || cents > 100_000) {
    throw new TypeError(`${field} must be between $0.01 and $1000`);
  }
  return numericValue;
}

function parseAdGroups(body: string): BriefAdGroup[] {
  const adGroups: BriefAdGroup[] = [];
  const sections = body.split(/### Ad Group:\s*/u);

  for (let i = 1; i < sections.length; i += 1) {
    const section = sections[i];
    if (!section) {
      continue;
    }
    const adGroup = parseAdGroupSection(section);
    if (adGroup) {
      adGroups.push(adGroup);
    }
  }

  return adGroups;
}

function parseKeywordLine(line: string): BriefKeyword | null {
  const match = line.match(
    /^[""]?(?<capture1>.+?)[""]?\s*\[(?<capture2>exact|phrase|broad)\]\s*$/iu
  );
  if (!match) {
    return null;
  }

  return {
    match_type: capture(match, 2).toUpperCase() as BriefMatchType,
    text: capture(match, 1)
      .trim()
      .replaceAll(/^[""]|[""]$/gu, ""),
  };
}

function parseNegativeKeywordLine(line: string): BriefNegativeKeyword | null {
  const parsed = parseKeywordLine(line);
  if (parsed) {
    return parsed;
  }

  const text = line.replaceAll(/^[""]|[""]$/gu, "").trim();
  return text ? { match_type: "BROAD", text } : null;
}

function parseAdLines(lines: string[]): BriefAd[] {
  const ads: BriefAd[] = [];
  let descriptions: string[] = [];
  let finalUrl = "";
  let headlines: string[] = [];
  let path1: string | undefined;
  let path2: string | undefined;

  const flushAd = () => {
    if (headlines.length === 0) {
      return;
    }

    const ad: BriefAd = {
      descriptions,
      final_url: finalUrl,
      headlines,
    };

    if (path1) {
      ad.path_1 = path1;
    }
    if (path2) {
      ad.path_2 = path2;
    }

    ads.push(ad);
    descriptions = [];
    finalUrl = "";
    headlines = [];
    path1 = undefined;
    path2 = undefined;
  };

  const hasAdContent = () =>
    descriptions.length > 0 ||
    finalUrl.length > 0 ||
    headlines.length > 0 ||
    path1 !== undefined ||
    path2 !== undefined;

  for (const raw of lines) {
    const line = raw.replace(/^-\s+/u, "");
    const headlineMatch = line.match(
      /^Headline\s+(?<capture1>\d+):\s*(?<capture2>.+)/iu
    );
    if (headlineMatch) {
      const headlineNumber = Math.trunc(Number(capture(headlineMatch, 1)));
      if (headlineNumber === 1 && hasAdContent()) {
        flushAd();
      }
      headlines.push(capture(headlineMatch, 2).trim());
      continue;
    }

    const descMatch = line.match(/^Description\s+\d+:\s*(?<capture1>.+)/iu);
    if (descMatch) {
      descriptions.push(capture(descMatch, 1).trim());
      continue;
    }

    const urlMatch = line.match(/^Final URL:\s*(?<capture1>.+)/iu);
    if (urlMatch) {
      finalUrl = capture(urlMatch, 1).trim();
      continue;
    }

    const path1Match = line.match(/^Path\s*1:\s*(?<capture1>.+)/iu);
    if (path1Match) {
      path1 = validatePath(capture(path1Match, 1).trim(), "Path 1");
      continue;
    }

    const path2Match = line.match(/^Path\s*2:\s*(?<capture1>.+)/iu);
    if (path2Match) {
      path2 = validatePath(capture(path2Match, 1).trim(), "Path 2");
    }
  }

  flushAd();
  return ads;
}

function parseExtensions(body: string): BriefExtensions {
  const section = body.match(
    /## Extensions\s*\n(?<capture1>[\s\S]*?)(?=\n## |$)/u
  );
  if (!section) {
    return { callouts: [], sitelinks: [], structured_snippets: [] };
  }

  const content = capture(section, 1);
  return {
    callouts: parseCallouts(content),
    sitelinks: parseSitelinks(content),
    structured_snippets: parseStructuredSnippets(content),
  };
}

function extractBody(content: string): string {
  const match = normalizeMarkdownLineEndings(content).match(
    /^---\n[\s\S]*?\n?---(?:\n|$)(?<capture1>[\s\S]*)$/u
  );
  return match?.[1] ?? content;
}

function normalizeMarkdownLineEndings(content: string): string {
  return content.replaceAll("\r\n", "\n");
}

function parseObjective(body: string): string {
  const match = body.match(
    /## Objective\s*\n\n(?<capture1>[\s\S]*?)(?=\n## |\n### |$)/u
  );
  return match?.[1]?.trim() ?? "";
}

function parseAdGroupSection(section: string): BriefAdGroup | null {
  const lines = section.split("\n");
  const name = lines[0]?.trim();
  if (!name) {
    return null;
  }

  return {
    ads: extractAds(section),
    keywords: extractKeywords(section),
    name,
    negative_keywords: extractNegativeKeywords(section),
    theme: extractField(section, "Theme"),
  };
}

function extractField(section: string, field: string): string {
  const match = section.match(new RegExp(`\\*\\*${field}:\\*\\*\\s*(.+)`, "u"));
  return match?.[1]?.trim() ?? "";
}

function extractKeywords(section: string): BriefKeyword[] {
  return extractListBlock(section, "Keywords")
    .map((line) => parseKeywordLine(line))
    .filter((keyword): keyword is BriefKeyword => keyword !== null);
}

function extractNegativeKeywords(section: string): BriefNegativeKeyword[] {
  return extractListBlock(section, "Negative Keywords")
    .map((line) => parseNegativeKeywordLine(line))
    .filter((keyword): keyword is BriefNegativeKeyword => keyword !== null);
}

function extractListBlock(section: string, label: string): string[] {
  const regex = new RegExp(
    `\\*\\*${label}:\\*\\*\\s*\\n([\\s\\S]*?)(?=\\n\\*\\*|\\n###|$)`,
    "u"
  );
  const match = section.match(regex);
  if (!match) {
    return [];
  }

  return normalizeListLines(capture(match, 1));
}

function extractAds(section: string): BriefAd[] {
  const adsBlock = section.match(
    /\*\*Ads:\*\*\s*\n(?<capture1>[\s\S]*?)(?=\n\*\*|(?:\n###(?! ))|$)/u
  );
  if (!adsBlock) {
    return [];
  }

  const lines = normalizeListLines(capture(adsBlock, 1), false);

  return parseAdLines(lines);
}

function validatePath(value: string, label: string): string {
  if (value.length > 15) {
    throw new Error(
      `${label} exceeds 15 characters (${value.length}): "${value}"`
    );
  }
  return value;
}

function parseSitelinks(content: string): BriefSitelink[] {
  const section = content.match(
    /### Sitelinks\s*\n(?<capture1>[\s\S]*?)(?=\n###|$)/u
  );
  if (!section) {
    return [];
  }

  return normalizeListLines(capture(section, 1)).flatMap(
    (line): BriefSitelink[] => {
      const match = line.match(/^(?<capture1>.+?)\s*\|\s*(?<capture2>.+)$/u);
      if (!match) {
        return [];
      }

      const linkText = capture(match, 1).trim();
      const destination = capture(match, 2).trim();
      if (!destination) {
        return [];
      }

      return [
        /^https?:\/\//iu.test(destination)
          ? { final_url: destination, link_text: linkText }
          : { link_text: linkText, path: destination },
      ];
    }
  );
}

function parseCallouts(content: string): string[] {
  const section = content.match(
    /### Callouts\s*\n(?<capture1>[\s\S]*?)(?=\n###|$)/u
  );
  if (!section) {
    return [];
  }

  return normalizeListLines(capture(section, 1));
}

function parseStructuredSnippets(
  content: string
): BriefExtensions["structured_snippets"] {
  const section = content.match(
    /### Structured Snippets\s*\n(?<capture1>[\s\S]*?)(?=\n###|$)/u
  );
  if (!section) {
    return [];
  }

  return normalizeListLines(capture(section, 1)).flatMap((line) => {
    const match = line.match(/^(?<capture1>.+?):\s*(?<capture2>.+)$/u);
    return match
      ? [
          {
            header: capture(match, 1).trim(),
            values: capture(match, 2)
              .split(",")
              .map((value) => value.trim()),
          },
        ]
      : [];
  });
}

function normalizeCampaignBrief(
  raw: unknown,
  defaultBidding: BriefBiddingStrategy
): CampaignBrief {
  const brief = requireRecord(raw, "brief");

  return {
    ad_groups: normalizeAdGroups(brief.ad_groups),
    campaign_negative_keywords: normalizeNegativeKeywords(
      brief.campaign_negative_keywords,
      "campaign_negative_keywords",
      true
    ),
    extensions: normalizeExtensions(brief.extensions),
    frontmatter: normalizeFrontmatter(brief.frontmatter, defaultBidding),
    objective: requireString(brief.objective, "objective"),
  };
}

function normalizeFrontmatter(
  raw: unknown,
  defaultBidding: BriefBiddingStrategy
): BriefFrontmatter {
  const frontmatter = requireRecord(raw, "frontmatter");

  return {
    bidding: normalizeBidding(frontmatter.bidding, defaultBidding),
    budget_daily: requireNumber(
      frontmatter.budget_daily,
      "frontmatter.budget_daily"
    ),
    campaign_name: requireString(
      frontmatter.campaign_name,
      "frontmatter.campaign_name"
    ),
    campaign_type: normalizeCampaignType(frontmatter.campaign_type),
    client: requireString(frontmatter.client, "frontmatter.client"),
    end_date: requireString(frontmatter.end_date, "frontmatter.end_date"),
    geographic_targets: requireStringArray(
      frontmatter.geographic_targets,
      "frontmatter.geographic_targets"
    ),
    language: requireString(frontmatter.language, "frontmatter.language"),
    ...optionalMaxCpcEntry(frontmatter.max_cpc),
    start_date: requireString(frontmatter.start_date, "frontmatter.start_date"),
  };
}

function normalizeBidding(
  value: unknown,
  defaultBidding: BriefBiddingStrategy
): BriefBiddingStrategy {
  if (value === undefined) {
    return defaultBidding;
  }
  return requireString(value, "frontmatter.bidding") as BriefBiddingStrategy;
}

function normalizeCampaignType(value: unknown): "SEARCH" {
  const campaignType = requireString(value, "frontmatter.campaign_type");
  if (campaignType.toUpperCase() !== "SEARCH") {
    throw new Error(
      `frontmatter.campaign_type must be SEARCH, received "${campaignType}"`
    );
  }
  return "SEARCH";
}

function normalizeAdGroups(raw: unknown): BriefAdGroup[] {
  if (!Array.isArray(raw)) {
    throw new TypeError("ad_groups must be an array");
  }

  return raw.map((entry, index) => {
    const adGroup = requireRecord(entry, `ad_groups[${index}]`);

    return {
      ads: normalizeAds(adGroup.ads, `ad_groups[${index}].ads`),
      keywords: normalizeKeywords(
        adGroup.keywords,
        `ad_groups[${index}].keywords`
      ),
      name: requireString(adGroup.name, `ad_groups[${index}].name`),
      negative_keywords: normalizeNegativeKeywords(
        adGroup.negative_keywords,
        `ad_groups[${index}].negative_keywords`,
        true
      ),
      theme: requireString(adGroup.theme, `ad_groups[${index}].theme`),
    };
  });
}

function normalizeKeywords(raw: unknown, field: string): BriefKeyword[] {
  if (!Array.isArray(raw)) {
    throw new TypeError(`${field} must be an array`);
  }

  return raw.map((entry, index) => {
    const keyword = requireRecord(entry, `${field}[${index}]`);
    return {
      match_type: normalizeMatchType(
        keyword.match_type,
        `${field}[${index}].match_type`
      ),
      text: requireString(keyword.text, `${field}[${index}].text`),
    };
  });
}

function normalizeNegativeKeywords(
  raw: unknown,
  field: string,
  optional = false
): BriefNegativeKeyword[] {
  if ((raw === undefined || raw === null) && optional) {
    return [];
  }
  return normalizeKeywords(raw, field);
}

function normalizeAds(raw: unknown, field: string): BriefAd[] {
  if (!Array.isArray(raw)) {
    throw new TypeError(`${field} must be an array`);
  }

  return raw.map((entry, index) => {
    const ad = requireRecord(entry, `${field}[${index}]`);
    return {
      descriptions: requireStringArray(
        ad.descriptions,
        `${field}[${index}].descriptions`
      ),
      final_url: requireString(ad.final_url, `${field}[${index}].final_url`),
      headlines: requireStringArray(
        ad.headlines,
        `${field}[${index}].headlines`
      ),
      ...(ad.path_1 === undefined
        ? {}
        : {
            path_1: validatePath(
              requireString(ad.path_1, `${field}[${index}].path_1`),
              `${field}[${index}].path_1`
            ),
          }),
      ...(ad.path_2 === undefined
        ? {}
        : {
            path_2: validatePath(
              requireString(ad.path_2, `${field}[${index}].path_2`),
              `${field}[${index}].path_2`
            ),
          }),
    };
  });
}

function normalizeExtensions(raw: unknown): BriefExtensions {
  if (raw === undefined) {
    return { callouts: [], sitelinks: [], structured_snippets: [] };
  }

  const extensions = requireRecord(raw, "extensions");
  return {
    callouts: extensions.callouts
      ? requireStringArray(extensions.callouts, "extensions.callouts")
      : [],
    sitelinks: extensions.sitelinks
      ? normalizeSitelinks(extensions.sitelinks)
      : [],
    structured_snippets: extensions.structured_snippets
      ? normalizeStructuredSnippets(extensions.structured_snippets)
      : [],
  };
}

function normalizeSitelinks(raw: unknown): BriefSitelink[] {
  if (!Array.isArray(raw)) {
    throw new TypeError("extensions.sitelinks must be an array");
  }

  return raw.map((entry, index) => {
    const sitelink = requireRecord(entry, `extensions.sitelinks[${index}]`);
    const finalUrl =
      sitelink.final_url === undefined
        ? undefined
        : requireString(
            sitelink.final_url,
            `extensions.sitelinks[${index}].final_url`
          );
    const path =
      sitelink.path === undefined
        ? undefined
        : requireString(sitelink.path, `extensions.sitelinks[${index}].path`);

    if (finalUrl === undefined && path === undefined) {
      throw new Error(
        `extensions.sitelinks[${index}] must include either path or final_url`
      );
    }

    return {
      ...(sitelink.description_1 === undefined
        ? {}
        : {
            description_1: requireString(
              sitelink.description_1,
              `extensions.sitelinks[${index}].description_1`
            ),
          }),
      ...(sitelink.description_2 === undefined
        ? {}
        : {
            description_2: requireString(
              sitelink.description_2,
              `extensions.sitelinks[${index}].description_2`
            ),
          }),
      ...(finalUrl === undefined ? {} : { final_url: finalUrl }),
      link_text: requireString(
        sitelink.link_text,
        `extensions.sitelinks[${index}].link_text`
      ),
      ...(path === undefined ? {} : { path }),
    };
  });
}

function normalizeStructuredSnippets(
  raw: unknown
): BriefExtensions["structured_snippets"] {
  if (!Array.isArray(raw)) {
    throw new TypeError("extensions.structured_snippets must be an array");
  }

  return raw.map((entry, index) => {
    const snippet = requireRecord(
      entry,
      `extensions.structured_snippets[${index}]`
    );
    return {
      header: requireString(
        snippet.header,
        `extensions.structured_snippets[${index}].header`
      ),
      values: requireStringArray(
        snippet.values,
        `extensions.structured_snippets[${index}].values`
      ),
    };
  });
}

function normalizeMatchType(value: unknown, field: string): BriefMatchType {
  const matchType = requireString(value, field).toUpperCase();
  if (
    matchType !== "BROAD" &&
    matchType !== "EXACT" &&
    matchType !== "PHRASE"
  ) {
    throw new Error(`${field} must be EXACT, PHRASE, or BROAD`);
  }
  return matchType;
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!(value && typeof value === "object") || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function requireNumber(value: unknown, field: string): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    throw new TypeError(`${field} must be a number`);
  }
  return numericValue;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${field} must be an array`);
  }
  return value.map((entry, index) =>
    requireString(entry, `${field}[${index}]`)
  );
}

function capture(match: RegExpMatchArray, index: number): string {
  const value = match[index];
  if (value === undefined) {
    throw new Error(`Expected regex capture group ${index}`);
  }
  return value;
}

function normalizeListLines(value: string, stripBullet = true): string[] {
  return value.split("\n").flatMap((line) => {
    const normalized = (stripBullet ? line.replace(/^-\s+/u, "") : line).trim();
    return normalized ? [normalized] : [];
  });
}

function findingFromError(error: unknown): CampaignBriefFinding {
  const message = error instanceof Error ? error.message : String(error);
  const path =
    /^(?<path>(?:ad_groups|campaign_negative_keywords|extensions|frontmatter|objective)[\w.[\]-]*)\s/iu.exec(
      message
    )?.groups?.path;
  return { message, path: path ?? "$" };
}
