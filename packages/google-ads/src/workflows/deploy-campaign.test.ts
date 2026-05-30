import { describe, expect, it, vi } from "vitest";

import {
  parseBriefContent,
  parseJsonBriefContent,
} from "../deploy/parse-brief.js";
import type { CampaignBrief } from "../deploy/types.js";
import {
  buildDeployCampaignOperations,
  deployCampaign,
  planDeployCampaign,
} from "./deploy-campaign.js";

const brief: CampaignBrief = {
  ad_groups: [
    {
      ads: [
        {
          descriptions: [
            "Support local families today.",
            "Double your impact now.",
          ],
          final_url: "https://example.com/issues/housing",
          headlines: [
            "Example Community Fund",
            "Donation Match",
            "Local Programs",
          ],
          path_1: "housing",
        },
      ],
      keywords: [
        { match_type: "PHRASE", text: "example community fund housing" },
      ],
      name: "Housing",
      negative_keywords: [{ match_type: "EXACT", text: "jobs" }],
      theme: "Housing support",
    },
  ],
  campaign_negative_keywords: [{ match_type: "PHRASE", text: "mayor" }],
  extensions: {
    callouts: ["Climate action"],
    sitelinks: [{ link_text: "Housing", path: "/issues/housing" }],
    structured_snippets: [{ header: "Issues", values: ["Housing", "Climate"] }],
  },
  frontmatter: {
    budget_daily: 50,
    campaign_name: "Search Housing",
    campaign_type: "SEARCH",
    client: "example-nonprofit",
    end_date: "2026-06-30",
    geographic_targets: ["2840"],
    language: "English",
    start_date: "2026-06-01",
  },
  objective: "Promote local housing support.",
};

describe("deploy campaign workflow", () => {
  it("builds one batched REST mutate using temp resource names", () => {
    const operations = buildDeployCampaignOperations({
      brief,
      customerId: "123-456-7890",
      status: "PAUSED",
    });

    expect(operations).toEqual([
      {
        campaignBudgetOperation: {
          create: expect.objectContaining({
            amountMicros: 50_000_000,
            resourceName: "customers/1234567890/campaignBudgets/-1",
          }),
        },
      },
      {
        campaignOperation: {
          create: expect.objectContaining({
            campaignBudget: "customers/1234567890/campaignBudgets/-1",
            endDate: "2026-06-30",
            resourceName: "customers/1234567890/campaigns/-2",
            startDate: "2026-06-01",
            status: "PAUSED",
          }),
        },
      },
      expect.objectContaining({
        campaignCriterionOperation: expect.any(Object),
      }),
      expect.objectContaining({
        campaignCriterionOperation: expect.any(Object),
      }),
      expect.objectContaining({
        campaignCriterionOperation: expect.any(Object),
      }),
      {
        adGroupOperation: {
          create: expect.objectContaining({
            campaign: "customers/1234567890/campaigns/-2",
            resourceName: "customers/1234567890/adGroups/-10",
          }),
        },
      },
      {
        adGroupCriterionOperation: {
          create: expect.objectContaining({
            adGroup: "customers/1234567890/adGroups/-10",
            keyword: {
              matchType: "PHRASE",
              text: "example community fund housing",
            },
          }),
        },
      },
      {
        adGroupCriterionOperation: {
          create: expect.objectContaining({
            adGroup: "customers/1234567890/adGroups/-10",
            negative: true,
          }),
        },
      },
      {
        adGroupAdOperation: {
          create: expect.objectContaining({
            adGroup: "customers/1234567890/adGroups/-10",
          }),
        },
      },
      expect.objectContaining({ assetOperation: expect.any(Object) }),
      expect.objectContaining({ campaignAssetOperation: expect.any(Object) }),
      expect.objectContaining({ assetOperation: expect.any(Object) }),
      expect.objectContaining({ campaignAssetOperation: expect.any(Object) }),
      expect.objectContaining({ assetOperation: expect.any(Object) }),
      expect.objectContaining({ campaignAssetOperation: expect.any(Object) }),
    ]);
  });

  it("returns a human summary for CLI plan output", () => {
    expect(
      planDeployCampaign({
        brief,
        customerId: "1234567890",
        status: "PAUSED",
      }).summary
    ).toEqual({
      adGroups: 1,
      ads: 1,
      campaignNegativeKeywords: 1,
      callouts: 1,
      keywords: 1,
      negativeKeywords: 1,
      sitelinks: 1,
      structuredSnippets: 1,
    });
  });

  it("defaults package deployment to validate mode", async () => {
    const client = {
      mutate: vi.fn().mockResolvedValue({
        mutateOperationResponses: [],
        requestId: "req",
      }),
      search: vi.fn(),
      searchStream: vi.fn(),
    };

    await deployCampaign(client, {
      brief,
      customerId: "1234567890",
      status: "PAUSED",
    });

    expect(client.mutate).toHaveBeenCalledWith({
      customerId: "1234567890",
      operations: expect.any(Array),
      validateOnly: true,
    });
  });

  it("rejects unresolved geographic target names at the package boundary", () => {
    expect(() =>
      buildDeployCampaignOperations({
        brief: {
          ...brief,
          frontmatter: {
            ...brief.frontmatter,
            geographic_targets: ["Local Programs"],
          },
        },
        customerId: "1234567890",
        status: "PAUSED",
      })
    ).toThrow("Unsupported geographic target");
  });

  it("parses JSON and markdown briefs into the same deployable shape", () => {
    expect(parseJsonBriefContent(JSON.stringify(brief))).toMatchObject({
      frontmatter: { campaign_name: "Search Housing" },
    });

    expect(parseBriefContent(markdownBrief())).toMatchObject({
      ad_groups: [
        expect.objectContaining({
          ads: [
            expect.objectContaining({
              final_url: "https://example.com/issues/housing",
            }),
          ],
          name: "Housing",
        }),
      ],
      frontmatter: { geographic_targets: ["2840"] },
    });
  });

  it("parses markdown briefs with CRLF line endings", () => {
    expect(
      parseBriefContent(markdownBrief().replaceAll("\n", "\r\n"))
    ).toMatchObject({
      ad_groups: [expect.objectContaining({ name: "Housing" })],
      frontmatter: { campaign_name: "Search Housing" },
    });
  });

  it("reports missing fields for empty markdown frontmatter", () => {
    expect(() => parseBriefContent("---\n---\n\n## Objective\n")).toThrow(
      "Missing frontmatter fields"
    );
  });

  it("normalizes null optional JSON negative keyword arrays to empty lists", () => {
    const rawBrief = {
      ...brief,
      ad_groups: brief.ad_groups.map((adGroup) => ({
        ...adGroup,
        negative_keywords: null,
      })),
      campaign_negative_keywords: null,
    };

    expect(parseJsonBriefContent(JSON.stringify(rawBrief))).toMatchObject({
      ad_groups: [expect.objectContaining({ negative_keywords: [] })],
      campaign_negative_keywords: [],
    });
  });

  it("rejects JSON ad path fields longer than Google Ads allows", () => {
    const rawBrief = {
      ...brief,
      ad_groups: brief.ad_groups.map((adGroup) => ({
        ...adGroup,
        ads: adGroup.ads.map((ad) => ({
          ...ad,
          path_1: "this-path-is-too-long",
        })),
      })),
    };

    expect(() => parseJsonBriefContent(JSON.stringify(rawBrief))).toThrow(
      "ad_groups[0].ads[0].path_1 exceeds 15 characters"
    );
  });

  it("rejects JSON sitelinks missing both path and final_url", () => {
    const rawBrief = {
      ...brief,
      extensions: {
        ...brief.extensions,
        sitelinks: [{ link_text: "Housing" }],
      },
    };

    expect(() => parseJsonBriefContent(JSON.stringify(rawBrief))).toThrow(
      "extensions.sitelinks[0] must include either path or final_url"
    );
  });

  it("joins relative sitelink paths against the landing page origin", () => {
    const operations = buildDeployCampaignOperations({
      brief: {
        ...brief,
        extensions: {
          ...brief.extensions,
          sitelinks: [{ link_text: "Housing", path: "issues/housing" }],
        },
      },
      customerId: "1234567890",
      status: "PAUSED",
    });

    expect(operations).toContainEqual(
      expect.objectContaining({
        assetOperation: {
          create: expect.objectContaining({
            finalUrls: ["https://example.com/issues/housing"],
            name: "Sitelink: Housing",
          }),
        },
      })
    );
  });

  it("rejects briefs with start dates after end dates", () => {
    expect(() =>
      planDeployCampaign({
        brief: {
          ...brief,
          frontmatter: {
            ...brief.frontmatter,
            end_date: "2026-06-30",
            start_date: "2026-07-01",
          },
        },
        customerId: "1234567890",
        status: "PAUSED",
      })
    ).toThrow("Start date must not be after end date");
  });

  it("rejects non-search markdown briefs", () => {
    expect(() =>
      parseBriefContent(
        markdownBrief().replace("campaign_type: SEARCH", "campaign_type: VIDEO")
      )
    ).toThrow("frontmatter.campaign_type must be SEARCH");
  });

  it("rejects non-numeric markdown budgets", () => {
    expect(() =>
      parseBriefContent(
        markdownBrief().replace("budget_daily: 50", "budget_daily: abc")
      )
    ).toThrow("frontmatter.budget_daily must be a number");
  });

  it("rejects empty markdown frontmatter strings", () => {
    expect(() =>
      parseBriefContent(
        markdownBrief().replace(
          "campaign_name: Search Housing",
          "campaign_name:"
        )
      )
    ).toThrow("frontmatter.campaign_name must be a non-empty string");
  });

  it("keeps malformed markdown ads separate so validation catches them", () => {
    const parsed = parseBriefContent(
      markdownBrief().replace(
        "- Final URL: https://example.com/issues/housing\n- Path 1: housing",
        `- Headline 1: Second Ad
- Headline 2: Better Homes
- Headline 3: Local Programs
- Description 1: Second ad description one.
- Description 2: Second ad description two.
- Final URL: https://example.com/issues/housing
- Path 1: housing`
      )
    );

    expect(parsed.ad_groups[0]?.ads).toHaveLength(2);
    expect(() =>
      planDeployCampaign({
        brief: parsed,
        customerId: "1234567890",
        status: "PAUSED",
      })
    ).toThrow('Ad Group "Housing": ad is missing Final URL');
  });
});

function markdownBrief(): string {
  return `---
client: example-nonprofit
campaign_name: Search Housing
campaign_type: SEARCH
budget_daily: 50
geographic_targets:
  - "2840"
language: English
start_date: 2026-06-01
end_date: 2026-06-30
---

## Objective

Promote local housing support.

### Ad Group: Housing
**Theme:** Housing support

**Keywords:**
- example community fund housing [phrase]

**Negative Keywords:**
- jobs [exact]

**Ads:**
- Headline 1: Example Community Fund
- Headline 2: Donation Match
- Headline 3: Local Programs
- Description 1: Support local families today.
- Description 2: Double your impact now.
- Final URL: https://example.com/issues/housing
- Path 1: housing

## Extensions

### Sitelinks
- Housing | /issues/housing

### Callouts
- Climate action

### Structured Snippets
- Issues: Housing, Climate
`;
}
