/* oxlint-disable vitest/require-mock-type-parameters -- structural provider fixtures focus on deployment behavior. */

import { describe, expect, it, vi } from "vitest";

import {
  deployMetaCampaignPlan,
  previewMetaCampaignPlan,
} from "./deployment.js";
import type { MetaCampaignDeploymentPlan } from "./deployment.js";
import { MetaAdsAmbiguousWriteError } from "./index.js";
import type { MetaAdsClient } from "./index.js";

const plan: MetaCampaignDeploymentPlan = {
  ads: [
    {
      adsetId: "$adSetId",
      creativeId: "creative-1",
      name: "Ad One",
    },
    {
      adsetId: "$adSetId2",
      creativeId: "creative-2",
      name: "Ad Two",
    },
  ],
  adSets: [
    {
      billingEvent: "IMPRESSIONS",
      campaignId: "$campaignId",
      name: "Ad Set One",
      optimizationGoal: "REACH",
      targeting: { geo_locations: { countries: ["US"] } },
    },
    {
      billingEvent: "IMPRESSIONS",
      campaignId: "$campaignId",
      name: "Ad Set Two",
      optimizationGoal: "REACH",
      targeting: { geo_locations: { countries: ["US"] } },
    },
  ],
  campaign: { name: "Campaign", objective: "OUTCOME_TRAFFIC" },
};

describe(deployMetaCampaignPlan, () => {
  it("validates and fingerprints a campaign plan without provider activity", async () => {
    const preview = await previewMetaCampaignPlan(plan, {
      operationId: "smoke-preview",
    });

    expect(preview.receipt).toMatchObject({
      operationId: "smoke-preview",
      operationKind: "campaign.deploy",
      provider: "meta",
      status: "pending",
      steps: [
        { attempted: false, key: "campaign", status: "pending" },
        { attempted: false, key: "ad-set:1", status: "pending" },
        { attempted: false, key: "ad-set:2", status: "pending" },
        { attempted: false, key: "ad:1", status: "pending" },
        { attempted: false, key: "ad:2", status: "pending" },
      ],
    });
    expect(preview.receipt.planFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it("deploys indexed resources and substitutes receipt IDs", async () => {
    const client = createClient();

    const result = await deployMetaCampaignPlan(client, plan, {
      operationId: "campaign-1",
    });

    expect(result.receipt).toMatchObject({
      operationKind: "campaign.deploy",
      status: "succeeded",
      steps: [
        { key: "campaign", providerResourceId: "campaign-1" },
        { key: "ad-set:1", providerResourceId: "adset-1" },
        { key: "ad-set:2", providerResourceId: "adset-2" },
        { key: "ad:1", providerResourceId: "ad-1" },
        { key: "ad:2", providerResourceId: "ad-2" },
      ],
    });
    expect(client.createAd).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ adsetId: "adset-2" })
    );
    expect(result.plan.ads?.[0]?.name).toContain("[patronage:campaign-1:ad:1]");
  });

  it.each([
    ["campaign", "createCampaign", 0, 0],
    ["ad-set:1", "createAdSet", 1, 0],
    ["ad-set:2", "createAdSet", 2, 1],
    ["ad:1", "createAd", 3, 0],
    ["ad:2", "createAd", 4, 1],
  ] as const)(
    "returns a partial receipt when %s fails",
    async (key, method, index, priorCalls) => {
      const client = createClient();
      const methodMock = vi.mocked(client[method]).mockReset();
      for (let call = 0; call < priorCalls; call += 1) {
        methodMock.mockResolvedValueOnce({
          id: method === "createAd" ? `ad-${call + 1}` : `adset-${call + 1}`,
        } as never);
      }
      methodMock.mockRejectedValueOnce(new Error("rejected"));

      const result = await deployMetaCampaignPlan(client, plan, {
        operationId: `failure-${index}`,
      });

      expect(result.receipt.status).toBe("failed");
      expect(result.receipt.steps[index]).toMatchObject({
        attempted: true,
        key,
        status: "failed",
      });
      expect(
        result.receipt.steps
          .slice(index + 1)
          .every(({ attempted }) => !attempted)
      ).toBeTruthy();
    }
  );

  it("resumes a failed ad without recreating verified predecessors", async () => {
    const firstClient = createClient();
    vi.mocked(firstClient.createAd)
      .mockReset()
      .mockRejectedValueOnce(new Error("rejected"));
    const failed = await deployMetaCampaignPlan(firstClient, plan, {
      operationId: "resume-ad",
    });
    const resumeClient = createReconciliationClient(failed.receipt);

    const resumed = await deployMetaCampaignPlan(resumeClient, plan, {
      operationId: "resume-ad",
      resumeReceipt: failed.receipt,
    });

    expect(resumed.receipt.status).toBe("succeeded");
    expect(resumeClient.createCampaign).not.toHaveBeenCalled();
    expect(resumeClient.createAdSet).not.toHaveBeenCalled();
    expect(resumeClient.createAd).toHaveBeenCalledTimes(2);
  });

  it("reconciles an ambiguous ad and does not replay it", async () => {
    const firstClient = createClient();
    vi.mocked(firstClient.createAd)
      .mockReset()
      .mockRejectedValueOnce(
        new MetaAdsAmbiguousWriteError({ method: "POST", path: "/ads" })
      );
    const ambiguous = await deployMetaCampaignPlan(firstClient, plan, {
      operationId: "ambiguous-ad",
    });
    const resumeClient = createReconciliationClient(ambiguous.receipt, true);

    const resumed = await deployMetaCampaignPlan(resumeClient, plan, {
      operationId: "ambiguous-ad",
      resumeReceipt: ambiguous.receipt,
    });

    expect(resumed.receipt.status).toBe("succeeded");
    expect(resumed.receipt.steps[3]?.providerResourceId).toBe(
      "reconciled-ad-1"
    );
    expect(resumeClient.createAd).toHaveBeenCalledOnce();
  });

  it("requires manual review when ambiguous reconciliation is missing", async () => {
    const client = createClient();
    vi.mocked(client.createCampaign).mockRejectedValueOnce(
      new MetaAdsAmbiguousWriteError({ method: "POST", path: "/campaigns" })
    );
    const ambiguous = await deployMetaCampaignPlan(client, plan, {
      operationId: "missing",
    });
    const resumeClient = createClient();

    const resumed = await deployMetaCampaignPlan(resumeClient, plan, {
      operationId: "missing",
      resumeReceipt: ambiguous.receipt,
    });

    expect(resumed.receipt.status).toBe("manual-review");
    expect(totalWrites(resumeClient)).toBe(0);
  });

  it("rejects invalid placeholders before provider activity", async () => {
    const client = createClient();

    await expect(
      deployMetaCampaignPlan(
        client,
        {
          ads: [{ adsetId: "$adSetId3", creativeId: "1", name: "Ad" }],
          adSets: plan.adSets,
          campaign: plan.campaign,
        },
        { operationId: "invalid" }
      )
    ).rejects.toThrow("missing ad set 3");
    expect(totalWrites(client)).toBe(0);
  });

  it.each(["$adSetId0", "$adSetIdfoo", "$campaignId2"])(
    "rejects malformed reserved placeholder %s before writes",
    async (placeholder) => {
      const client = createClient();
      const [firstAdSet] = plan.adSets ?? [];
      const [firstAd] = plan.ads ?? [];
      if (!(firstAdSet && firstAd)) {
        throw new Error("Expected campaign deployment fixtures.");
      }
      const malformedPlan: MetaCampaignDeploymentPlan = placeholder.startsWith(
        "$campaign"
      )
        ? {
            ...plan,
            adSets: [{ ...firstAdSet, campaignId: placeholder }],
          }
        : {
            ...plan,
            ads: [{ ...firstAd, adsetId: placeholder }],
          };

      await expect(
        deployMetaCampaignPlan(client, malformedPlan, {
          operationId: "invalid-placeholder",
        })
      ).rejects.toThrow(/placeholder|missing ad set/u);
      expect(totalWrites(client)).toBe(0);
    }
  );
});

function createClient(): MetaAdsClient {
  return {
    createAd: vi
      .fn()
      .mockResolvedValueOnce({ id: "ad-1" })
      .mockResolvedValueOnce({ id: "ad-2" }),
    createAdSet: vi
      .fn()
      .mockResolvedValueOnce({ id: "adset-1" })
      .mockResolvedValueOnce({ id: "adset-2" }),
    createCampaign: vi.fn().mockResolvedValue({ id: "campaign-1" }),
    findAdByName: vi.fn().mockImplementation(async () => {}),
    findAdSetByName: vi.fn().mockImplementation(async () => {}),
    findCampaignByName: vi.fn().mockImplementation(async () => {}),
  } as unknown as MetaAdsClient;
}

function createReconciliationClient(
  receipt: Awaited<ReturnType<typeof deployMetaCampaignPlan>>["receipt"],
  reconcileAmbiguous = false
): MetaAdsClient {
  const client = createClient();
  vi.mocked(client.findCampaignByName).mockResolvedValue({
    id: "campaign-1",
    name: receipt.steps[0]?.stableIdentity ?? "",
  });
  vi.mocked(client.findAdSetByName).mockImplementation(async ({ name }) => {
    const index = receipt.steps.findIndex(
      (step) => step.key.startsWith("ad-set:") && step.stableIdentity === name
    );
    return index === -1 ? undefined : { id: `adset-${index}`, name };
  });
  vi.mocked(client.findAdByName).mockImplementation(async ({ name }) => {
    const step = receipt.steps.find(
      (candidate) =>
        candidate.key.startsWith("ad:") && candidate.stableIdentity === name
    );
    if (!step) {
      return;
    }
    if (step.status === "ambiguous" && reconcileAmbiguous) {
      return { id: `reconciled-${step.key.replace(":", "-")}`, name };
    }
    return step.providerResourceId
      ? { id: step.providerResourceId, name }
      : undefined;
  });
  return client;
}

function totalWrites(client: MetaAdsClient): number {
  return [client.createCampaign, client.createAdSet, client.createAd].reduce(
    (total, method) => total + vi.mocked(method).mock.calls.length,
    0
  );
}
