import { describe, expect, it } from "vitest";

import { runLinkedInBoostPlanTutorial } from "./preview-boost-plan.js";

describe("LinkedIn boost-plan tutorial", () => {
  it("creates a paused local plan without a provider client", () => {
    const plan = runLinkedInBoostPlanTutorial();

    expect(plan.campaign.status).toBe("PAUSED");
    expect(plan.creative.reference).toBe("urn:li:share:789");
  });
});
