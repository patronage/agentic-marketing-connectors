/* oxlint-disable vitest/require-mock-type-parameters, unicorn/no-useless-undefined -- Structural provider fixtures and explicit typed not-found results are narrowed at the executor boundary. */

import { describe, expect, it, vi } from "vitest";

import { deployMetaBoostPlan } from "./deployment.js";
import {
  buildBoostPostPlan,
  MetaAdsAmbiguousWriteError,
  MetaAdsApiError,
} from "./index.js";
import type { MetaAdsClient } from "./index.js";

const plan = buildBoostPostPlan({
  budget: 25,
  days: 2,
  pageId: "page-1",
  postId: "page-1_post-1",
});

describe(deployMetaBoostPlan, () => {
  it("records all resources and does not recreate them on resume", async () => {
    const client = createClient();
    const completed = await deployMetaBoostPlan(client, plan, {
      operationId: "boost-1",
    });
    const callsAfterCompletion = totalCreateCalls(client);

    const resumed = await deployMetaBoostPlan(client, plan, {
      operationId: "boost-1",
      resumeReceipt: completed.receipt,
    });

    expect(completed.receipt).toMatchObject({
      operationId: "boost-1",
      operationKind: "boost.deploy",
      provider: "meta",
      status: "succeeded",
      steps: [
        {
          key: "campaign",
          providerResourceId: "campaign-1",
          status: "succeeded",
        },
        { key: "ad-set", providerResourceId: "adset-1", status: "succeeded" },
        {
          key: "ad-creative",
          providerResourceId: "creative-1",
          status: "succeeded",
        },
        { key: "ad", providerResourceId: "ad-1", status: "succeeded" },
      ],
    });
    expect(resumed.result).toMatchObject({ campaignId: "campaign-1" });
    // oxlint-disable-next-line unicorn/prefer-structured-clone, react-doctor/no-json-parse-stringify-clone -- caller persistence uses JSON receipts.
    expect(JSON.parse(JSON.stringify(completed.receipt))).toStrictEqual(
      completed.receipt
    );
    expect(totalCreateCalls(client)).toBe(callsAfterCompletion);
  });

  it.each([
    ["campaign", "createCampaign"],
    ["ad-set", "createAdSet"],
    ["ad-creative", "createAdCreative"],
    ["ad", "createAd"],
  ] as const)(
    "returns the correct partial receipt when %s fails",
    async (stepKey, method) => {
      const client = createClient();
      vi.mocked(client[method]).mockRejectedValueOnce(new Error("injected"));

      const result = await deployMetaBoostPlan(client, plan, {
        operationId: `failure-${stepKey}`,
      });
      const failedIndex = result.receipt.steps.findIndex(
        ({ key }) => key === stepKey
      );

      expect(result.receipt.status).toBe("failed");
      expect(result.receipt.steps[failedIndex]).toMatchObject({
        attempted: true,
        status: "failed",
      });
      expect(
        result.receipt.steps
          .slice(0, failedIndex)
          .every(({ status }) => status === "succeeded")
      ).toBeTruthy();
      expect(
        result.receipt.steps
          .slice(failedIndex + 1)
          .every(({ attempted, status }) => !attempted && status === "pending")
      ).toBeTruthy();
    }
  );

  it("retries a failed step after verifying succeeded predecessors", async () => {
    const firstClient = createClient();
    vi.mocked(firstClient.createAdSet).mockRejectedValueOnce(
      new Error("injected")
    );
    const failed = await deployMetaBoostPlan(firstClient, plan, {
      operationId: "retry-adset",
    });
    const [campaignStep] = failed.receipt.steps;
    if (!campaignStep) {
      throw new Error("Expected campaign receipt step.");
    }
    const resumeClient = createClient();
    vi.mocked(resumeClient.findCampaignByName).mockResolvedValue({
      id: "campaign-1",
      name: campaignStep.stableIdentity,
    });

    const resumed = await deployMetaBoostPlan(resumeClient, plan, {
      operationId: "retry-adset",
      resumeReceipt: failed.receipt,
    });

    expect(resumed.receipt.status).toBe("succeeded");
    expect(resumeClient.createCampaign).not.toHaveBeenCalled();
    expect(resumeClient.createAdSet).toHaveBeenCalledOnce();
  });

  it("preserves provider request evidence on a definitive failure", async () => {
    const client = createClient();
    vi.mocked(client.createCampaign).mockRejectedValueOnce(
      new MetaAdsApiError({
        code: 400,
        fbtrace_id: "trace-failed",
        message: "rejected",
        type: "OAuthException",
      })
    );

    const failed = await deployMetaBoostPlan(client, plan, {
      operationId: "failed-evidence",
    });

    expect(failed.receipt.steps[0]).toMatchObject({
      providerRequestId: "trace-failed",
      status: "failed",
    });
  });

  it("blocks writes when a stored predecessor ID cannot be verified", async () => {
    const firstClient = createClient();
    vi.mocked(firstClient.createAdSet).mockRejectedValueOnce(
      new Error("injected")
    );
    const failed = await deployMetaBoostPlan(firstClient, plan, {
      operationId: "tampered-id",
    });
    const tampered = structuredClone(failed.receipt);
    const [campaignStep] = tampered.steps;
    if (!campaignStep) {
      throw new Error("Expected campaign receipt step.");
    }
    tampered.steps[0] = {
      ...campaignStep,
      providerResourceId: "unrelated-campaign",
    };
    const resumeClient = createClient();
    vi.mocked(resumeClient.findCampaignByName).mockResolvedValue({
      id: "campaign-1",
      name: tampered.steps[0]?.stableIdentity,
    });

    const resumed = await deployMetaBoostPlan(resumeClient, plan, {
      operationId: "tampered-id",
      resumeReceipt: tampered,
    });

    expect(resumed.receipt.status).toBe("manual-review");
    expect(totalCreateCalls(resumeClient)).toBe(0);
  });

  it("stops on ambiguity and resumes after Meta reconciliation finds the resource", async () => {
    const firstClient = createClient();
    vi.spyOn(firstClient, "createCampaign").mockRejectedValue(
      new MetaAdsAmbiguousWriteError({
        method: "POST",
        path: "/v25.0/act_123/campaigns",
        providerRequestId: "trace-1",
        status: 503,
      })
    );
    const ambiguous = await deployMetaBoostPlan(firstClient, plan, {
      operationId: "boost-ambiguous",
    });

    expect(ambiguous.receipt).toMatchObject({
      status: "ambiguous",
      steps: [
        {
          key: "campaign",
          providerRequestId: "trace-1",
          status: "ambiguous",
        },
        { attempted: false, key: "ad-set", status: "pending" },
        { attempted: false, key: "ad-creative", status: "pending" },
        { attempted: false, key: "ad", status: "pending" },
      ],
    });

    const resumeClient = createClient();
    vi.spyOn(resumeClient, "findCampaignByName").mockResolvedValue({
      id: "campaign-reconciled",
      name: plan.campaign.name,
    });
    const resumed = await deployMetaBoostPlan(resumeClient, plan, {
      operationId: "boost-ambiguous",
      resumeReceipt: ambiguous.receipt,
    });

    expect(resumed.receipt.status).toBe("succeeded");
    expect(resumed.result?.campaignId).toBe("campaign-reconciled");
    expect(resumeClient.createCampaign).not.toHaveBeenCalled();
    expect(resumeClient.findCampaignByName).toHaveBeenCalledOnce();
  });

  it("requires manual review when reconciliation does not find the resource", async () => {
    const firstClient = createClient();
    vi.spyOn(firstClient, "createCampaign").mockRejectedValue(
      new MetaAdsAmbiguousWriteError({
        method: "POST",
        path: "/campaigns",
      })
    );
    const ambiguous = await deployMetaBoostPlan(firstClient, plan, {
      operationId: "boost-not-found",
    });
    const resumeClient = createClient();
    vi.spyOn(resumeClient, "findCampaignByName").mockResolvedValue(undefined);

    const resumed = await deployMetaBoostPlan(resumeClient, plan, {
      operationId: "boost-not-found",
      resumeReceipt: ambiguous.receipt,
    });

    expect(resumed.receipt).toMatchObject({
      status: "manual-review",
      steps: expect.arrayContaining([
        expect.objectContaining({ key: "campaign", status: "manual-review" }),
      ]),
    });
    expect(totalCreateCalls(resumeClient)).toBe(0);
  });
});

function createClient(): MetaAdsClient {
  return {
    createAd: vi.fn().mockResolvedValue({ id: "ad-1" }),
    createAdCreative: vi.fn().mockResolvedValue({ id: "creative-1" }),
    createAdSet: vi.fn().mockResolvedValue({ id: "adset-1" }),
    createCampaign: vi.fn().mockResolvedValue({ id: "campaign-1" }),
    findAdByName: vi.fn().mockResolvedValue(undefined),
    findAdCreativeByName: vi.fn().mockResolvedValue(undefined),
    findAdSetByName: vi.fn().mockResolvedValue(undefined),
    findCampaignByName: vi.fn().mockResolvedValue(undefined),
  } as unknown as MetaAdsClient;
}

function totalCreateCalls(client: MetaAdsClient): number {
  const methods = [
    client.createCampaign,
    client.createAdSet,
    client.createAdCreative,
    client.createAd,
  ];
  return methods.reduce(
    (total, method) => total + vi.mocked(method).mock.calls.length,
    0
  );
}
