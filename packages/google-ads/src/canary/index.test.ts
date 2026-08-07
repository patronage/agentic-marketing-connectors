import { describe, expect, it, vi } from "vitest";

import type { GoogleAdsClient } from "../index.js";
import { runGoogleAdsReadCanary } from "../index.js";

describe(runGoogleAdsReadCanary, () => {
  it("runs a bounded read-only matrix and records failures safely", async () => {
    const search = vi
      .fn<GoogleAdsClient["search"]>()
      .mockResolvedValueOnce({ requestId: null, rows: [{}] })
      .mockResolvedValueOnce({ requestId: null, rows: [] })
      .mockRejectedValueOnce(new TypeError("provider drift"));

    await expect(
      runGoogleAdsReadCanary({ search } as never, { customerId: "123" })
    ).resolves.toStrictEqual([
      { operation: "campaigns", rowCount: 1, status: "passed" },
      { operation: "keywords", rowCount: 0, status: "passed" },
      {
        error: { message: "provider drift", name: "TypeError" },
        operation: "search-terms",
        status: "failed",
      },
    ]);
    expect(search).toHaveBeenCalledTimes(3);
  });
});
