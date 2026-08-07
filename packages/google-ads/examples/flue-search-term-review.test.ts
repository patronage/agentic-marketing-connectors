import { describe, expect, it, vi } from "vitest";

import {
  registerFlueSearchTermReview,
  runSyntheticFlueSearchTermReview,
} from "./flue-search-term-review.js";

describe("Flue search-term review tutorial", () => {
  it("drafts and provider-validates recommendations without executing", async () => {
    const review = await runSyntheticFlueSearchTermReview();

    expect(review.status).toBe("provider-validated");
    expect(review.recommendations).toHaveLength(1);
    expect(review.validation).toStrictEqual({
      operationCount: 1,
      requestId: "tutorial-validate-001",
      validateOnly: true,
    });
  });

  it("keeps Flue registration in the application composition layer", () => {
    const defineWorkflow =
      vi.fn<Parameters<typeof registerFlueSearchTermReview>[0]>();
    const client = {} as Parameters<typeof registerFlueSearchTermReview>[1];

    registerFlueSearchTermReview(defineWorkflow, client);

    expect(defineWorkflow).toHaveBeenCalledOnce();
  });
});
