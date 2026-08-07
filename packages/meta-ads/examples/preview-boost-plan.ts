import { buildBoostPostPlan } from "../src/index.js";

/** Builds a paused local plan. It sends no provider request. */
export function runMetaBoostPlanTutorial() {
  return buildBoostPostPlan({
    budget: 50,
    days: 2,
    pageId: "123",
    postId: "123_456",
  });
}
