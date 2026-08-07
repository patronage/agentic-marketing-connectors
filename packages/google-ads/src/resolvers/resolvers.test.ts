import { describe, expect, it, vi } from "vitest";

import type { GoogleAdsClient } from "../rest/index.js";
import { languageResource, resolveAdGroup, resolveGeoTarget } from "./index.js";

describe("Google Ads resource resolvers", () => {
  it("resolves country aliases through the canonical geo name", async () => {
    const search = vi.fn<GoogleAdsClient["search"]>().mockResolvedValue({
      requestId: "req",
      rows: [
        {
          geoTargetConstant: {
            id: "2840",
            name: "United States",
            resourceName: "geoTargetConstants/2840",
          },
        },
      ],
    });
    await expect(
      resolveGeoTarget({ search } as unknown as GoogleAdsClient, {
        customerId: "123",
        value: "usa",
      })
    ).resolves.toMatchObject({ id: "2840" });
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining("United States"),
      })
    );
  });
  it("supports the legacy language aliases", () => {
    expect(languageResource("german")).toBe("languageConstants/1001");
    expect(languageResource("zh")).toBe("languageConstants/1017");
  });
  it("normalizes numeric ad-group IDs", async () => {
    const search = vi.fn<GoogleAdsClient["search"]>().mockResolvedValue({
      requestId: "req",
      rows: [
        {
          adGroup: {
            id: "99",
            name: "Group",
            resourceName: "customers/123/adGroups/99",
          },
        },
      ],
    });
    await expect(
      resolveAdGroup({ search } as unknown as GoogleAdsClient, {
        customerId: "123",
        value: "99",
      })
    ).resolves.toMatchObject({ resourceName: "customers/123/adGroups/99" });
  });
});
