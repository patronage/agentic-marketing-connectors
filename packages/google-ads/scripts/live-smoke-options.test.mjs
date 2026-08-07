import { describe, expect, it } from "vitest";

import {
  hasFailedSmokeResults,
  parseLiveSmokeArgs,
  summarizeMutationResults,
} from "./live-smoke-options.mjs";

describe(parseLiveSmokeArgs, () => {
  it("keeps mutation mode off unless the explicit flag is present", () => {
    expect(parseLiveSmokeArgs(["--customer-id", "123"])).toStrictEqual({
      allowMutations: false,
      customerId: "123",
    });
    expect(
      parseLiveSmokeArgs([
        "--allow-mutations",
        "--mutation-fixtures",
        "/tmp/fixtures.json",
      ])
    ).toStrictEqual({
      allowMutations: true,
      mutationFixtures: "/tmp/fixtures.json",
    });
  });
});

describe("mutation smoke result summaries", () => {
  it("reports skipped work without failing the smoke process", () => {
    const results = [
      { status: "passed" },
      { status: "skipped" },
      { status: "skipped" },
    ];

    expect(summarizeMutationResults(results)).toStrictEqual({
      failed: 0,
      passed: 1,
      skipped: 2,
    });
    expect(hasFailedSmokeResults(results)).toBe(false);
  });
});
