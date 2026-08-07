/* oxlint-disable vitest/require-mock-type-parameters -- Canary collaborators are structurally inferred from their fixture results. */

import { describe, expect, it, vi } from "vitest";

import {
  META_ADS_READ_VERIFICATION_MATRIX,
  runMetaAdsReadCanary,
} from "./index.js";

describe(runMetaAdsReadCanary, () => {
  it("runs representative reads and no mutation surface", async () => {
    const client = {
      getInsights: vi.fn().mockResolvedValue([]),
      listAdAccountActivities: vi.fn().mockResolvedValue([]),
      listAdLabels: vi.fn().mockResolvedValue([]),
      listAutomatedRules: vi.fn().mockResolvedValue([]),
      listCustomAudiences: vi.fn().mockResolvedValue([]),
    };

    const result = await runMetaAdsReadCanary(client, {
      since: "2026-07-01",
      until: "2026-07-02",
    });

    expect(result.map(({ operation }) => operation)).toStrictEqual(
      META_ADS_READ_VERIFICATION_MATRIX
    );
    expect(result.every(({ status }) => status === "passed")).toBeTruthy();
    expect(client.getInsights).toHaveBeenCalledWith({
      level: "campaign",
      since: "2026-07-01",
      until: "2026-07-02",
    });
  });

  it("continues after failures and returns safe error evidence", async () => {
    const client = {
      getInsights: vi.fn().mockRejectedValue(new Error("provider unavailable")),
      listAdAccountActivities: vi.fn().mockResolvedValue([]),
      listAdLabels: vi.fn().mockResolvedValue([]),
      listAutomatedRules: vi.fn().mockResolvedValue([]),
      listCustomAudiences: vi.fn().mockResolvedValue([]),
    };

    const result = await runMetaAdsReadCanary(client, {
      since: "2026-07-01",
      until: "2026-07-02",
    });

    expect(result[0]).toStrictEqual({
      error: { message: "provider unavailable", name: "Error" },
      operation: "getInsights",
      status: "failed",
    });
    expect(result).toHaveLength(META_ADS_READ_VERIFICATION_MATRIX.length);
    expect(client.listCustomAudiences).toHaveBeenCalledOnce();
  });
});
