import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { GoogleAdsClient } from "@patronage/google-ads";
import { describe, expect, it, vi } from "vitest";

import { parseAddAdGroupsInput } from "./google-extra.js";
import {
  createGoogleCommand,
  dateRangeFromOptions,
  googleDeploymentResumeKey,
  readBriefFile,
  readCurrentStateDiff,
  toCsv,
} from "./google.js";

describe("Google CLI option parsing", () => {
  it("uses the injected account-aware bidding default for deploy briefs", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "google-cli-brief-"));
    const briefPath = path.join(tempDir, "brief.json");
    await writeFile(
      briefPath,
      JSON.stringify({
        ad_groups: [
          {
            ads: [
              {
                descriptions: ["First description", "Second description"],
                final_url: "https://example.com",
                headlines: [
                  "First headline",
                  "Second headline",
                  "Third headline",
                ],
              },
            ],
            keywords: [{ match_type: "PHRASE", text: "example keyword" }],
            name: "Example",
            theme: "Example theme",
          },
        ],
        campaign_negative_keywords: [],
        extensions: {
          callouts: [],
          sitelinks: [],
          structured_snippets: [],
        },
        frontmatter: {
          budget_daily: 10,
          campaign_name: "Example",
          campaign_type: "SEARCH",
          client: "example",
          end_date: "2026-12-31",
          geographic_targets: ["2840"],
          language: "English",
          start_date: "2026-08-07",
        },
        objective: "Test the account-aware default.",
      })
    );
    const defaultBiddingForCustomerId = vi.fn<() => "maximize-conversions">(
      () => "maximize-conversions"
    );

    const brief = readBriefFile(
      briefPath,
      "1234567890",
      defaultBiddingForCustomerId
    );

    expect(brief.frontmatter.bidding).toBe("maximize-conversions");
    expect(defaultBiddingForCustomerId).toHaveBeenCalledWith("1234567890");
  });

  it("keys deployment resume to plan and provider context", () => {
    const base = {
      brief: { campaign: "A" },
      customerId: "123",
      status: "PAUSED",
    };
    const key = googleDeploymentResumeKey(base);

    expect(
      [
        { ...base, brief: { campaign: "B" } },
        { ...base, customerId: "456" },
        { ...base, status: "ENABLED" },
      ].map(googleDeploymentResumeKey)
    ).not.toContain(key);
  });

  it("uses a positive integer days range", () => {
    expect(
      dateRangeFromOptions({ customerId: "123", days: "30" })
    ).toStrictEqual({
      days: 30,
    });
  });

  it("rejects malformed days input instead of truncating it", () => {
    expect(() =>
      dateRangeFromOptions({ customerId: "123", days: "30days" })
    ).toThrow("--days must be a positive integer");
    expect(() =>
      dateRangeFromOptions({ customerId: "123", days: "1.5" })
    ).toThrow("--days must be a positive integer");
  });

  it("keeps explicit date ranges separate from days parsing", () => {
    expect(
      dateRangeFromOptions({
        customerId: "123",
        since: "2026-05-01",
        until: "2026-05-22",
      })
    ).toStrictEqual({ since: "2026-05-01", until: "2026-05-22" });
  });
});

describe("Google migrated command contracts", () => {
  it("renders formula-safe Google Ads search-term CSV", () => {
    expect(
      toCsv([
        {
          clicks: 7,
          cost: 12.5,
          searchTerm: '  +WEBSERVICE("https://example.test")',
        },
      ])
    ).toBe(
      'clicks,cost,searchTerm\n"7","12.5","\'  +WEBSERVICE(""https://example.test"")"'
    );
  });

  it("registers compliance flags and the add-ad-group command", () => {
    const command = createGoogleCommand();
    const compliance = command.commands.find(
      (child) => child.name() === "compliance"
    );
    expect(compliance?.options.map(({ long }) => long)).toStrictEqual(
      expect.arrayContaining(["--check", "--verbose", "--json"])
    );
    expect(
      command.commands.some((child) => child.name() === "ad-groups-add")
    ).toBeTruthy();
    const keywords = command.commands.find(
      (child) => child.name() === "keywords"
    );
    const remove = keywords?.commands.find(
      (child) => child.name() === "remove"
    );
    expect(remove?.options.map(({ long }) => long)).toStrictEqual(
      expect.arrayContaining([
        "--input",
        "--execute",
        "--json",
        "--run-log-dir",
      ])
    );
  });
  it("validates add-ad-group inputs including a positive CPC bid", () => {
    expect(() =>
      parseAddAdGroupsInput({
        adGroups: [{ ads: [], cpcBidMicros: -1, keywords: [], name: "Group" }],
        customerId: "123",
        parentCampaignResourceName: "customers/123/campaigns/1",
      })
    ).toThrow("Too small");
  });

  it("plans the set-max-cpc diff in dollars with current ceilings", async () => {
    const search = vi
      .fn<() => Promise<{ rows: unknown[] }>>()
      .mockResolvedValue({
        rows: [
          {
            campaign: {
              biddingStrategyType: "TARGET_SPEND",
              id: "111",
              name: "Brand",
              targetSpend: { cpcBidCeilingMicros: "1500000" },
            },
          },
          {
            campaign: {
              bidding_strategy_type: "TARGET_SPEND",
              id: "222",
              name: "Workforce",
              target_spend: { cpc_bid_ceiling_micros: "" },
            },
          },
        ],
      });
    const client = { search } as unknown as GoogleAdsClient;

    await expect(
      readCurrentStateDiff(client, "google campaigns set-max-cpc", {
        campaigns: [{ id: "111" }, { id: "222" }],
        customerId: "1234567890",
        maxCpc: 2,
      })
    ).resolves.toStrictEqual([
      {
        biddingStrategyType: "TARGET_SPEND",
        current: "$1.50",
        id: "111",
        name: "Brand",
        proposed: "$2.00",
      },
      {
        biddingStrategyType: "TARGET_SPEND",
        current: "(no ceiling)",
        id: "222",
        name: "Workforce",
        proposed: "$2.00",
      },
    ]);
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: "1234567890" })
    );
  });
});
