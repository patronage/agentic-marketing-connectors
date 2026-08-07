/* oxlint-disable vitest/require-mock-type-parameters -- structural provider clients keep fixtures focused on lifecycle behavior. */

import { describe, expect, it, vi } from "vitest";

import {
  deployLinkedInBoostResumable,
  deployLinkedInBriefResumable,
} from "./deployment.js";
import { LinkedInAdsApiError } from "./index.js";
import type {
  BoostLinkedInPostPlan,
  LinkedInAdsClient,
  LinkedInBriefDeploymentPlan,
} from "./index.js";

const briefPlan: LinkedInBriefDeploymentPlan = {
  campaign: { campaignGroup: "group-1", name: "Campaign" },
  concepts: [
    {
      body: "Body",
      cta: "Learn More",
      headline: "Concept One",
      id: "one",
      image: "one.png",
      name: "One",
    },
    {
      body: "Body 2",
      cta: "Sign Up",
      headline: "Concept Two",
      id: "two",
      image: "two.png",
      name: "Two",
    },
  ],
  leadForm: {
    description: "Description",
    headline: "Form headline",
    name: "Lead Form",
    privacyPolicyUrl: "https://example.com/privacy",
    questions: [],
    thankYouMessage: { message: "Thanks" },
  },
};

const boostPlan: BoostLinkedInPostPlan = {
  campaign: { campaignGroup: "group-1", name: "Boost" },
  creative: {
    campaign: "pending",
    content: { reference: "urn:li:share:123" },
  },
};

describe("LinkedIn resumable deployment", () => {
  it("records every brief concept boundary in a JSON receipt", async () => {
    const client = createClient();

    const result = await deployLinkedInBriefResumable({
      client,
      options: { operationId: "brief-1" },
      plan: briefPlan,
      resolveImage,
    });

    expect(result.receipt).toMatchObject({
      operationKind: "brief.deploy",
      status: "succeeded",
      steps: [
        { key: "lead-form", providerResourceId: "form-1" },
        { key: "campaign", providerResourceId: "campaign-1" },
        { key: "concept:one:image", providerResourceId: "urn:li:image:1" },
        { key: "concept:one:creative", providerResourceId: "creative-1" },
        { key: "concept:two:image", providerResourceId: "urn:li:image:2" },
        { key: "concept:two:creative", providerResourceId: "creative-2" },
      ],
    });
    expect(result.plan.campaign.name).toContain("[patronage:brief-1]");
    // oxlint-disable-next-line unicorn/prefer-structured-clone, react-doctor/no-json-parse-stringify-clone -- persisted receipt JSON round-trip is the contract under test.
    expect(JSON.parse(JSON.stringify(result.receipt))).toStrictEqual(
      result.receipt
    );
  });

  it.each([
    ["campaign", "createCampaign", 0],
    ["creative", "createCreative", 1],
  ] as const)(
    "returns an accurate boost receipt when %s fails",
    async (stepKey, method, index) => {
      const client = createClient();
      vi.mocked(client[method])
        .mockReset()
        .mockRejectedValueOnce(
          new LinkedInAdsApiError(400, { message: "rejected" })
        );

      const result = await deployLinkedInBoostResumable({
        client,
        options: { operationId: `boost-failure-${stepKey}` },
        plan: boostPlan,
      });

      expect(result.receipt.status).toBe("failed");
      expect(result.receipt.steps[index]).toMatchObject({
        attempted: true,
        key: stepKey,
        status: "failed",
      });
    }
  );

  it.each([
    ["lead-form", "createLeadForm", 0, 0],
    ["campaign", "createCampaign", 1, 0],
    ["concept:one:image", "uploadImage", 2, 0],
    ["concept:one:creative", "createCreative", 3, 0],
    ["concept:two:image", "uploadImage", 4, 1],
    ["concept:two:creative", "createCreative", 5, 1],
  ] as const)(
    "returns an accurate partial receipt when %s fails",
    async (stepKey, method, index, priorMethodSuccesses) => {
      const client = createClient();
      const methodMock = vi.mocked(client[method]).mockReset();
      for (let call = 0; call < priorMethodSuccesses; call += 1) {
        if (method === "uploadImage") {
          methodMock.mockResolvedValueOnce(`urn:li:image:${call + 1}` as never);
        } else {
          methodMock.mockResolvedValueOnce({
            id: `creative-${call + 1}`,
          } as never);
        }
      }
      methodMock.mockRejectedValueOnce(
        new LinkedInAdsApiError(400, { message: "rejected" })
      );

      const result = await deployLinkedInBriefResumable({
        client,
        options: { operationId: `failure-${index}` },
        plan: briefPlan,
        resolveImage,
      });

      expect(result.receipt.status).toBe("failed");
      expect(result.receipt.steps[index]).toMatchObject({
        attempted: true,
        key: stepKey,
        status: "failed",
      });
      expect(
        result.receipt.steps
          .slice(index + 1)
          .every(({ attempted }) => !attempted)
      ).toBeTruthy();
    }
  );

  it("retries a failed concept without recreating verified predecessors", async () => {
    const firstClient = createClient();
    vi.mocked(firstClient.createCreative)
      .mockReset()
      .mockRejectedValueOnce(
        new LinkedInAdsApiError(400, { message: "rejected" })
      );
    const failed = await deployLinkedInBriefResumable({
      client: firstClient,
      options: { operationId: "resume-concept" },
      plan: briefPlan,
      resolveImage,
    });
    const resumeClient = createReconciliationClient(failed.receipt);

    const resumed = await deployLinkedInBriefResumable({
      client: resumeClient,
      options: {
        operationId: "resume-concept",
        resumeReceipt: failed.receipt,
      },
      plan: briefPlan,
      resolveImage,
    });

    expect(resumed.receipt.status).toBe("succeeded");
    expect(resumeClient.createLeadForm).not.toHaveBeenCalled();
    expect(resumeClient.createCampaign).not.toHaveBeenCalled();
    expect(resumeClient.uploadImage).toHaveBeenCalledOnce();
    expect(resumeClient.createCreative).toHaveBeenCalledTimes(2);
  });

  it("rejects a changed plan before resuming provider activity", async () => {
    const firstClient = createClient();
    vi.mocked(firstClient.createCampaign)
      .mockReset()
      .mockRejectedValueOnce(
        new LinkedInAdsApiError(400, { message: "rejected" })
      );
    const failed = await deployLinkedInBoostResumable({
      client: firstClient,
      options: { operationId: "fingerprint" },
      plan: boostPlan,
    });
    const resumeClient = createClient();

    await expect(
      deployLinkedInBoostResumable({
        client: resumeClient,
        options: {
          operationId: "fingerprint",
          resumeReceipt: failed.receipt,
        },
        plan: {
          ...boostPlan,
          campaign: { ...boostPlan.campaign, name: "Changed" },
        },
      })
    ).rejects.toThrow("does not match");
    expect(totalWrites(resumeClient)).toBe(0);
  });

  it("reconciles an ambiguous boost campaign without replaying the write", async () => {
    const firstClient = createClient();
    vi.mocked(firstClient.createCampaign).mockRejectedValueOnce(
      new TypeError("connection closed")
    );
    const ambiguous = await deployLinkedInBoostResumable({
      client: firstClient,
      options: { operationId: "boost-ambiguous" },
      plan: boostPlan,
    });
    const resumeClient = createClient();
    vi.mocked(resumeClient.listCampaigns).mockResolvedValue({
      campaigns: [
        {
          id: "campaign-reconciled",
          name: "Boost [patronage:boost-ambiguous]",
        },
      ],
      total: 1,
    });

    const resumed = await deployLinkedInBoostResumable({
      client: resumeClient,
      options: {
        operationId: "boost-ambiguous",
        resumeReceipt: ambiguous.receipt,
      },
      plan: boostPlan,
    });

    expect(resumed.receipt.status).toBe("succeeded");
    expect(resumeClient.createCampaign).not.toHaveBeenCalled();
    expect(resumeClient.createCreative).toHaveBeenCalledOnce();
  });

  it("requires manual review for missing ambiguous reconciliation", async () => {
    const firstClient = createClient();
    vi.mocked(firstClient.createCampaign).mockRejectedValueOnce(
      new TypeError("connection closed")
    );
    const ambiguous = await deployLinkedInBoostResumable({
      client: firstClient,
      options: { operationId: "boost-missing" },
      plan: boostPlan,
    });
    const resumeClient = createClient();

    const resumed = await deployLinkedInBoostResumable({
      client: resumeClient,
      options: {
        operationId: "boost-missing",
        resumeReceipt: ambiguous.receipt,
      },
      plan: boostPlan,
    });

    expect(resumed.receipt.status).toBe("manual-review");
    expect(totalWrites(resumeClient)).toBe(0);
  });

  it("rejects duplicate concept IDs before provider activity", async () => {
    const client = createClient();
    const [firstConcept] = briefPlan.concepts;
    if (!firstConcept) {
      throw new Error("Expected a concept fixture.");
    }

    await expect(
      deployLinkedInBriefResumable({
        client,
        options: { operationId: "duplicates" },
        plan: {
          ...briefPlan,
          concepts: [firstConcept, firstConcept],
        },
        resolveImage,
      })
    ).rejects.toThrow("nonempty and unique");
    expect(totalWrites(client)).toBe(0);
  });

  it("gives repeated concept headlines independent provider identities", async () => {
    const client = createClient();
    const [firstConcept, secondConcept] = briefPlan.concepts;
    if (!(firstConcept && secondConcept)) {
      throw new Error("Expected two concept fixtures.");
    }

    const result = await deployLinkedInBriefResumable({
      client,
      options: { operationId: "same-headline" },
      plan: {
        ...briefPlan,
        concepts: [
          firstConcept,
          { ...secondConcept, headline: firstConcept.headline },
        ],
      },
      resolveImage,
    });

    expect(result.plan.concepts.map(({ headline }) => headline)).toStrictEqual([
      "Concept One [patronage:same-headline:concept:one]",
      "Concept One [patronage:same-headline:concept:two]",
    ]);
  });

  it.each([
    ["malformed response", new SyntaxError("invalid JSON")],
    ["missing ID", { id: "" }],
  ] as const)(
    "stops on ambiguous %s without replay",
    async (_case, outcome) => {
      const client = createClient();
      vi.mocked(client.createCampaign).mockReset();
      if (outcome instanceof Error) {
        vi.mocked(client.createCampaign).mockRejectedValueOnce(outcome);
      } else {
        vi.mocked(client.createCampaign).mockResolvedValueOnce({
          ...outcome,
          name: "Boost",
        });
      }

      const result = await deployLinkedInBoostResumable({
        client,
        options: { operationId: "uncertain" },
        plan: boostPlan,
      });

      expect(result.receipt.status).toBe("ambiguous");
      expect(client.createCreative).not.toHaveBeenCalled();
    }
  );

  it("reconciles an ambiguous boost creative within the verified campaign", async () => {
    const firstClient = createClient();
    vi.mocked(firstClient.createCreative)
      .mockReset()
      .mockRejectedValueOnce(new TypeError("connection closed"));
    const ambiguous = await deployLinkedInBoostResumable({
      client: firstClient,
      options: { operationId: "creative-ambiguous" },
      plan: boostPlan,
    });
    const resumeClient = createClient();
    vi.mocked(resumeClient.listCampaigns).mockResolvedValue({
      campaigns: [
        {
          id: "campaign-1",
          name: "Boost [patronage:creative-ambiguous]",
        },
      ],
      total: 1,
    });
    vi.mocked(resumeClient.listCreatives).mockResolvedValue({
      creatives: [
        {
          content: { reference: "urn:li:share:123" },
          id: "creative-reconciled",
        },
      ],
      total: 1,
    });

    const resumed = await deployLinkedInBoostResumable({
      client: resumeClient,
      options: {
        operationId: "creative-ambiguous",
        resumeReceipt: ambiguous.receipt,
      },
      plan: boostPlan,
    });

    expect(resumed.creative?.id).toBe("creative-reconciled");
    expect(resumeClient.createCreative).not.toHaveBeenCalled();
  });

  it.each([
    ["lead-form", "createLeadForm", 0, 0, false],
    ["campaign", "createCampaign", 0, 1, false],
    ["concept:one:image", "uploadImage", 0, 2, true],
    ["concept:one:creative", "createCreative", 0, 3, false],
    ["concept:two:image", "uploadImage", 1, 4, true],
    ["concept:two:creative", "createCreative", 1, 5, false],
  ] as const)(
    "handles ambiguous brief boundary %s without replaying it",
    async (stepKey, method, priorMethodSuccesses, stepIndex, isImage) => {
      const firstClient = createClient();
      const methodMock = vi.mocked(firstClient[method]).mockReset();
      for (let call = 0; call < priorMethodSuccesses; call += 1) {
        if (method === "uploadImage") {
          methodMock.mockResolvedValueOnce(`urn:li:image:${call + 1}` as never);
        } else {
          methodMock.mockResolvedValueOnce({
            id: `creative-${call + 1}`,
          } as never);
        }
      }
      methodMock.mockRejectedValueOnce(new TypeError("connection closed"));
      const ambiguous = await deployLinkedInBriefResumable({
        client: firstClient,
        options: { operationId: `ambiguous-${stepIndex}` },
        plan: briefPlan,
        resolveImage,
      });
      const resumeClient = createReconciliationClient(ambiguous.receipt);

      const resumed = await deployLinkedInBriefResumable({
        client: resumeClient,
        options: {
          operationId: `ambiguous-${stepIndex}`,
          resumeReceipt: ambiguous.receipt,
        },
        plan: briefPlan,
        resolveImage,
      });

      expect(resumed.receipt.status).toBe(
        isImage ? "manual-review" : "succeeded"
      );
      expect(resumed.receipt.steps[stepIndex]).toMatchObject(
        isImage
          ? { key: stepKey, status: "manual-review" }
          : {
              key: stepKey,
              status: "succeeded",
            }
      );
      expect(
        isImage
          ? "reconciled"
          : resumed.receipt.steps[stepIndex]?.providerResourceId
      ).toContain("reconciled");
      expect(isImage ? totalWrites(resumeClient) : 0).toBe(0);
    }
  );
});

function createClient(): LinkedInAdsClient {
  return {
    createCampaign: vi.fn().mockResolvedValue({
      id: "campaign-1",
      name: "Campaign",
    }),
    createCreative: vi
      .fn()
      .mockResolvedValueOnce({ id: "creative-1" })
      .mockResolvedValueOnce({ id: "creative-2" }),
    createLeadForm: vi.fn().mockResolvedValue({
      id: "form-1",
      name: "Lead Form",
    }),
    listCampaigns: vi.fn().mockResolvedValue({ campaigns: [], total: 0 }),
    listCreatives: vi.fn().mockResolvedValue({ creatives: [], total: 0 }),
    listLeadForms: vi.fn().mockResolvedValue({ forms: [], total: 0 }),
    getImage: vi.fn().mockResolvedValue({}),
    uploadImage: vi
      .fn()
      .mockResolvedValueOnce("urn:li:image:1")
      .mockResolvedValueOnce("urn:li:image:2"),
  } as unknown as LinkedInAdsClient;
}

function createReconciliationClient(
  receipt: Awaited<ReturnType<typeof deployLinkedInBriefResumable>>["receipt"]
): LinkedInAdsClient {
  const client = createClient();
  const [leadFormStep, campaignStep] = receipt.steps;
  vi.mocked(client.listLeadForms).mockResolvedValue({
    forms: [
      {
        id: leadFormStep?.status === "ambiguous" ? "reconciled-form" : "form-1",
        name: leadFormStep?.stableIdentity ?? "",
      },
    ],
    total: 1,
  });
  vi.mocked(client.listCampaigns).mockResolvedValue({
    campaigns: [
      {
        id:
          campaignStep?.status === "ambiguous"
            ? "reconciled-campaign"
            : "campaign-1",
        name: campaignStep?.stableIdentity ?? "",
      },
    ],
    total: 1,
  });
  const creatives = receipt.steps.flatMap((step) => {
    if (!step.key.endsWith(":creative")) {
      return [];
    }
    if (!(step.status === "succeeded" || step.status === "ambiguous")) {
      return [];
    }
    return [
      {
        content: { headline: step.stableIdentity },
        id:
          step.providerResourceId ??
          `reconciled-${step.key.replaceAll(":", "-")}`,
      },
    ];
  });
  vi.mocked(client.listCreatives).mockResolvedValue({
    creatives,
    total: creatives.length,
  });
  return client;
}

async function resolveImage() {
  return {
    bytes: new Uint8Array([1]),
    contentType: "image/png" as const,
  };
}

function totalWrites(client: LinkedInAdsClient): number {
  return [
    client.createCampaign,
    client.createCreative,
    client.createLeadForm,
    client.uploadImage,
  ].reduce((total, method) => total + vi.mocked(method).mock.calls.length, 0);
}
