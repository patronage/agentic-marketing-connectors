import { describe, expect, it } from "vitest";

import { parseLiveSmokeArgs } from "./live-smoke-options.mjs";

describe(parseLiveSmokeArgs, () => {
  it("keeps mutation mode off unless the explicit flag is present", () => {
    expect(parseLiveSmokeArgs([])).toStrictEqual({ allowMutations: false });
    expect(parseLiveSmokeArgs(["--allow-mutations"])).toStrictEqual({
      allowMutations: true,
    });
  });
});
