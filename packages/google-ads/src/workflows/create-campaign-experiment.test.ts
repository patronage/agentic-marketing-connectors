import { describe, expect, it, vi } from "vitest";

import {
  buildCreateCampaignExperimentArmOperations,
  buildCreateCampaignExperimentOperations,
  createCampaignExperiment,
  createCampaignExperimentArms,
  endCampaignExperiment,
  extractTreatmentInDesignCampaignResourceName,
  scheduleCampaignExperiment,
} from "./create-campaign-experiment.js";

describe("create campaign experiment workflow", () => {
  it("builds a YouTube custom experiment resource in setup status", () => {
    expect(
      buildCreateCampaignExperimentOperations({
        controlTrafficSplit: 80,
        customerId: "123-456-7890",
        description: "One-day Week 1 shakedown",
        endDate: "2026-05-29",
        experimentName: "Week 1 shakedown",
        startDate: "2026-05-28",
        suffix: "[exp-394]",
        syncEnabled: true,
        treatmentTrafficSplit: 20,
      })
    ).toEqual([
      {
        create: {
          description: "One-day Week 1 shakedown",
          endDate: "2026-05-29",
          name: "Week 1 shakedown",
          startDate: "2026-05-28",
          status: "SETUP",
          suffix: "[exp-394]",
          syncEnabled: true,
          type: "YOUTUBE_CUSTOM",
        },
      },
    ]);
  });

  it("builds control and treatment arms in one transaction", () => {
    expect(
      buildCreateCampaignExperimentArmOperations({
        baseCampaignId: "111",
        controlTrafficSplit: 70,
        customerId: "123-456-7890",
        experimentResourceName: "customers/1234567890/experiments/222",
        treatmentTrafficSplit: 30,
      })
    ).toEqual([
      {
        create: {
          campaigns: ["customers/1234567890/campaigns/111"],
          control: true,
          experiment: "customers/1234567890/experiments/222",
          name: "control",
          trafficSplit: 70,
        },
      },
      {
        create: {
          control: false,
          experiment: "customers/1234567890/experiments/222",
          name: "treatment",
          trafficSplit: 30,
        },
      },
    ]);
  });

  it("rejects ambiguous experiment setup inputs before calling Google Ads", () => {
    expect(() =>
      buildCreateCampaignExperimentOperations({
        controlTrafficSplit: 80,
        customerId: "1234567890",
        experimentName: "Experiment",
        startDate: "2026-05-29",
        suffix: "[exp]",
        treatmentTrafficSplit: 10,
      })
    ).toThrow("add up to 100");

    expect(() =>
      buildCreateCampaignExperimentOperations({
        controlTrafficSplit: 80,
        customerId: "1234567890",
        endDate: "2026-05-28",
        experimentName: "Experiment",
        startDate: "2026-05-29",
        suffix: "[exp]",
        treatmentTrafficSplit: 20,
      })
    ).toThrow("endDate");

    expect(() =>
      buildCreateCampaignExperimentArmOperations({
        baseCampaignId: "abc",
        controlTrafficSplit: 80,
        customerId: "1234567890",
        experimentResourceName: "customers/1234567890/experiments/222",
        treatmentTrafficSplit: 20,
      })
    ).toThrow("baseCampaignId");

    expect(() =>
      buildCreateCampaignExperimentArmOperations({
        baseCampaignId: "111",
        controlTrafficSplit: 80,
        customerId: "1234567890",
        experimentResourceName: "customers/9999999999/experiments/222",
        treatmentTrafficSplit: 20,
      })
    ).toThrow("customer ID does not match");
  });

  it("defaults experiment service calls to validate-only and blocks execution", async () => {
    const client = {
      endExperiment: vi.fn().mockResolvedValue({
        experiment: { resourceName: "customers/1234567890/experiments/222" },
        requestId: "end-request",
      }),
      mutateExperimentArms: vi.fn().mockResolvedValue({
        requestId: "arms-request",
        results: [],
      }),
      mutateExperiments: vi.fn().mockResolvedValue({
        requestId: "experiment-request",
        results: [],
      }),
      scheduleExperiment: vi.fn().mockResolvedValue({
        name: "operations/schedule",
        requestId: "schedule-request",
      }),
    };

    await createCampaignExperiment(client, {
      controlTrafficSplit: 80,
      customerId: "1234567890",
      experimentName: "Experiment",
      suffix: "[exp]",
      treatmentTrafficSplit: 20,
    });
    await createCampaignExperimentArms(client, {
      baseCampaignId: "111",
      controlTrafficSplit: 80,
      customerId: "1234567890",
      experimentResourceName: "customers/1234567890/experiments/222",
      treatmentTrafficSplit: 20,
    });
    await scheduleCampaignExperiment(client, {
      customerId: "1234567890",
      experimentResourceName: "customers/1234567890/experiments/222",
    });
    await endCampaignExperiment(client, {
      customerId: "1234567890",
      experimentResourceName: "customers/1234567890/experiments/222",
    });

    expect(client.endExperiment).toHaveBeenCalledWith({
      experimentResourceName: "customers/1234567890/experiments/222",
      validateOnly: true,
    });
    expect(client.mutateExperiments).toHaveBeenCalledWith({
      customerId: "1234567890",
      operations: expect.any(Array),
      partialFailure: undefined,
      validateOnly: true,
    });
    expect(client.mutateExperimentArms).toHaveBeenCalledWith({
      customerId: "1234567890",
      operations: expect.any(Array),
      responseContentType: "MUTABLE_RESOURCE",
      validateOnly: true,
    });
    expect(client.scheduleExperiment).toHaveBeenCalledWith({
      resourceName: "customers/1234567890/experiments/222",
      validateOnly: true,
    });

    await expect(
      endCampaignExperiment(client, {
        customerId: "1234567890",
        experimentResourceName: "customers/1234567890/experiments/222",
        mode: "execute",
      })
    ).rejects.toThrow("requires Loop approval");

    await expect(
      scheduleCampaignExperiment(client, {
        customerId: "1234567890",
        experimentResourceName: "customers/9999999999/experiments/222",
      })
    ).rejects.toThrow("customer ID does not match");

    await expect(
      endCampaignExperiment(client, {
        customerId: "1234567890",
        experimentResourceName: "customers/9999999999/experiments/222",
      })
    ).rejects.toThrow("customer ID does not match");
  });

  it("extracts the treatment in-design campaign returned by experiment arms", () => {
    expect(
      extractTreatmentInDesignCampaignResourceName({
        results: [
          {
            experimentArm: {
              control: true,
              inDesignCampaigns: ["customers/1234567890/campaigns/999"],
              resourceName: "control",
            },
          },
          {
            experimentArm: {
              control: false,
              inDesignCampaigns: ["customers/1234567890/campaigns/333"],
              resourceName: "treatment",
            },
          },
        ],
      })
    ).toBe("customers/1234567890/campaigns/333");
  });
});
