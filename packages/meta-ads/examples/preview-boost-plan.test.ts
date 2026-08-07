import { describe, expect, it } from "vitest";

import { runMetaBoostPlanTutorial } from "./preview-boost-plan.js";

describe("Meta boost-plan tutorial", () => {
  it("creates a paused local plan without a provider client", () => {
    const plan = runMetaBoostPlanTutorial();

    expect(plan.campaign.status).toBe("PAUSED");
    expect(plan.adSet.lifetimeBudget).toBe(50);
  });
});
