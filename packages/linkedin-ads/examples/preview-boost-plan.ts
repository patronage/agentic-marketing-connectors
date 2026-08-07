import { buildBoostPostPlan } from "../src/index.js";

/** Builds a paused local plan. It sends no provider request. */
export function runLinkedInBoostPlanTutorial() {
  return buildBoostPostPlan(
    {
      campaignGroup: "urn:li:sponsoredCampaignGroup:123",
      organizationUrn: "urn:li:organization:456",
      postUrn: "urn:li:share:789",
    },
    "urn:li:sponsoredAccount:123"
  );
}
