import { describe, expect, it } from "vitest";

import {
  adsSyncCanaryRequestSha256,
  canonicalAdsSyncCanaryRequest,
  parseAdsSyncCanaryRequest,
} from "./canary.js";

describe(parseAdsSyncCanaryRequest, () => {
  it("accepts one exact connection and a bounded 24-hour window", async () => {
    const request = parseAdsSyncCanaryRequest({
      connectionId: "google_ads_default",
      provider: "google_ads",
      windowEnd: "2026-07-14T00:00:00.000Z",
      windowStart: "2026-07-13T00:00:00.000Z",
    });
    expect(request).toStrictEqual({
      connectionId: "google_ads_default",
      provider: "google_ads",
      windowEnd: new Date("2026-07-14T00:00:00.000Z"),
      windowStart: new Date("2026-07-13T00:00:00.000Z"),
    });
    expect(canonicalAdsSyncCanaryRequest(request)).toStrictEqual({
      connectionId: "google_ads_default",
      provider: "google_ads",
      windowEnd: "2026-07-14T00:00:00.000Z",
      windowStart: "2026-07-13T00:00:00.000Z",
    });
    await expect(adsSyncCanaryRequestSha256(request)).resolves.toBe(
      "9a1460eef0e55c320d6af66e01ffa9109983f8eb33ffce2b264b132691a7ff55"
    );
  });

  it("rejects unbounded, reversed, multiple, or extra canary inputs", () => {
    for (const body of [
      {
        connectionId: "google_ads_default",
        provider: "google_ads",
        windowEnd: "2026-07-15T00:00:00.001Z",
        windowStart: "2026-07-13T00:00:00.000Z",
      },
      {
        connectionId: "google_ads_default",
        provider: "google_ads",
        windowEnd: "2026-07-13T00:00:00.000Z",
        windowStart: "2026-07-14T00:00:00.000Z",
      },
      {
        connectionIds: ["google_ads_default", "meta_ads_performance"],
        provider: "google_ads",
        windowEnd: "2026-07-14T00:00:00.000Z",
        windowStart: "2026-07-13T00:00:00.000Z",
      },
      {
        connectionId: "google_ads_default",
        provider: "all",
        windowEnd: "2026-07-14T00:00:00.000Z",
        windowStart: "2026-07-13T00:00:00.000Z",
      },
    ]) {
      expect(() => parseAdsSyncCanaryRequest(body)).toThrow(/canary/iu);
    }
  });
});
