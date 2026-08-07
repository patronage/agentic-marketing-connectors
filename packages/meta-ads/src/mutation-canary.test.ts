import { describe, expect, it } from "vitest";

import { runMetaAdsMutationCanary } from "./mutation-canary.js";

describe(runMetaAdsMutationCanary, () => {
  it("locally previews representative Meta campaign and boost mutations", async () => {
    const results = await runMetaAdsMutationCanary();

    expect(results).toStrictEqual([
      {
        operation: "campaign-deploy",
        plannedOperationCount: 3,
        providerRequestSent: false,
        status: "passed",
        validationMode: "local-preview",
      },
      {
        operation: "boost-create",
        plannedOperationCount: 4,
        providerRequestSent: false,
        status: "passed",
        validationMode: "local-preview",
      },
      {
        operation: "conversion-send",
        plannedOperationCount: 1,
        providerRequestSent: false,
        status: "passed",
        validationMode: "local-preview",
      },
      {
        operation: "audience-share",
        plannedOperationCount: 1,
        providerRequestSent: false,
        status: "passed",
        validationMode: "local-preview",
      },
      {
        operation: "audience-unshare",
        plannedOperationCount: 1,
        providerRequestSent: false,
        status: "passed",
        validationMode: "local-preview",
      },
    ]);
  });
});
