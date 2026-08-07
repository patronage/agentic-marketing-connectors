import { describe, expect, it } from "vitest";

import { runSyntheticRecentPostIntake } from "./recent-post-intake.js";

describe("recent X post intake tutorial", () => {
  it("uses the preferred X API path when its credential is supplied", async () => {
    const result = await runSyntheticRecentPostIntake();

    expect(result.provider).toBe("x-api");
    expect(result.posts).toHaveLength(1);
  });
});
