import { describe, expect, it } from "vitest";

import { runHelloWorldCampaignSnapshot } from "./hello-world-campaign-snapshot.js";

describe("hello world campaign snapshot tutorial", () => {
  it("runs through the public Worker-safe REST client", async () => {
    await expect(runHelloWorldCampaignSnapshot()).resolves.toStrictEqual({
      campaignName: "Spring donor drive",
      clicks: 128,
      customerId: "1234567890",
      requestId: "tutorial-request-001",
      spend: 245.5,
    });
  });
});
