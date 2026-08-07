import { describe, expect, it, vi } from "vitest";

import type { GoogleAdsClient } from "../rest/index.js";
import { runComplianceChecks } from "./index.js";

function clientWith(rows: Record<string, unknown>[]): GoogleAdsClient {
  return {
    search: vi
      .fn<GoogleAdsClient["search"]>()
      .mockResolvedValue({ requestId: "req", rows }),
  } as unknown as GoogleAdsClient;
}

function captureClient(rows: Record<string, unknown>[]): {
  client: GoogleAdsClient;
  queries: () => string[];
} {
  const search = vi
    .fn<GoogleAdsClient["search"]>()
    .mockResolvedValue({ requestId: "req", rows });
  return {
    client: { search } as unknown as GoogleAdsClient,
    queries: () => search.mock.calls.map(([request]) => request.query),
  };
}

describe("Ad Grant compliance", () => {
  it("fails CPC when an enabled keyword exceeds $2", async () => {
    const [check] = await runComplianceChecks(
      clientWith([
        {
          campaign: { name: "Grant" },
          adGroupCriterion: {
            effectiveCpcBidMicros: "2500000",
            keyword: { text: "tax help" },
          },
        },
      ]),
      { checks: ["cpc"], customerId: "123" }
    );
    expect(check).toMatchObject({ passed: false, severity: "error" });
    expect(check?.details[0]).toContain("$2.50");
  });
  it("allows named and negative single-word exceptions while flagging targeted generic words", async () => {
    const rows = [
      {
        campaign: { name: "Grant" },
        adGroupCriterion: { keyword: { text: "eitc" } },
      },
      {
        campaign: { name: "Grant" },
        adGroupCriterion: { keyword: { text: "login" }, negative: true },
      },
      {
        campaign: { name: "Grant" },
        adGroupCriterion: { keyword: { text: "tax" } },
      },
    ];
    const { client, queries } = captureClient(rows);
    const [check] = await runComplianceChecks(client, {
      checks: ["single-word"],
      customerId: "123",
    });
    expect(check?.details).toHaveLength(1);
    expect(check?.details[0]).toContain("tax");
    expect(check?.details).not.toContainEqual(expect.stringContaining("login"));
    expect(queries()[0]).toContain("ad_group_criterion.negative = FALSE");
  });
  it("excludes removed campaigns and ad groups from keyword checks", async () => {
    // Removed campaigns are not serving, so their keywords are not live
    // violations. Paused ones stay in scope: pausing is one click from serving,
    // and silently dropping them would recreate the masking this check exists
    // to prevent.
    const checks = ["single-word", "cpc", "quality"] as const;
    const captured = checks.map((check) => {
      const { client, queries } = captureClient([]);
      return { check, client, queries };
    });

    await Promise.all(
      captured.map(({ check, client }) =>
        runComplianceChecks(client, { checks: [check], customerId: "123" })
      )
    );

    for (const { check, queries } of captured) {
      expect(
        queries()[0],
        `${check} query must exclude removed campaigns`
      ).toContain("campaign.status != 'REMOVED'");
      expect(
        queries()[0],
        `${check} query must exclude removed ad groups`
      ).toContain("ad_group.status != 'REMOVED'");
    }
  });
  it("excludes negative keywords from bid and quality checks", async () => {
    // keyword_view returns positive and negative criteria together; negatives
    // carry no bid or quality score, so including them is always wrong.
    const checks = ["cpc", "quality"] as const;
    const captured = checks.map((check) => {
      const { client, queries } = captureClient([]);
      return { check, client, queries };
    });

    await Promise.all(
      captured.map(({ check, client }) =>
        runComplianceChecks(client, { checks: [check], customerId: "123" })
      )
    );

    for (const { check, queries } of captured) {
      expect(queries()[0], `${check} query must exclude negatives`).toContain(
        "ad_group_criterion.negative = FALSE"
      );
    }
  });
  it("checks enabled conversion actions rather than recent conversions", async () => {
    const [check] = await runComplianceChecks(
      clientWith([
        {
          conversionAction: {
            name: "Signup",
            status: "ENABLED",
            type: "WEBPAGE",
          },
        },
      ]),
      { checks: ["conversion"], customerId: "123" }
    );
    expect(check?.passed).toBeTruthy();
  });
  it.each(["ad-groups", "sitelinks"] as const)(
    "requires two %s per active campaign",
    async (name) => {
      const [check] = await runComplianceChecks(
        clientWith([
          { campaign: { id: "1", name: "Grant" }, adGroup: { id: "1" } },
        ]),
        { checks: [name], customerId: "123" }
      );
      expect(check?.passed).toBeFalsy();
    }
  );
  it("computes CTR and quality offenders", async () => {
    const [ctr] = await runComplianceChecks(
      clientWith([{ metrics: { clicks: 4, impressions: 100 } }]),
      { checks: ["ctr"], customerId: "123" }
    );
    expect(ctr?.passed).toBeFalsy();
    const [quality] = await runComplianceChecks(
      clientWith([
        {
          campaign: { name: "Grant" },
          adGroupCriterion: {
            keyword: { text: "tax help" },
            qualityInfo: { qualityScore: 2 },
          },
        },
      ]),
      { checks: ["quality"], customerId: "123" }
    );
    expect(quality?.passed).toBeFalsy();
  });
});
