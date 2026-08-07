import { describe, expect, it } from "vitest";

import {
  buildTutorialConnections,
  tutorialConfig,
} from "./configure-connections.js";
import { prepareBoundedRun } from "./prepare-bounded-run.js";
import { runTutorialHistoricalComparison } from "./run-historical-comparison.js";

describe("Ads Sync source tutorials", () => {
  it("builds isolated desired-state connections without credential values", async () => {
    const connections = await buildTutorialConnections();

    expect(connections).toHaveLength(3);
    expect(
      new Set(connections.map(({ airbyteSchema }) => airbyteSchema)).size
    ).toBe(connections.length);
    expect(JSON.stringify(tutorialConfig)).not.toContain("access_token");
    expect(JSON.stringify(tutorialConfig)).not.toContain("password");
  });

  it("prepares one bounded canary and deterministic artifact locations", async () => {
    const prepared = await prepareBoundedRun();

    expect(prepared.canary.requestSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(prepared.artifactKeys.prefix).toBe(
      "meta_ads/customcampaign_daily_performance/tutorial-run"
    );
    expect(prepared.backfillPolicy).toStrictEqual({
      maxWindowsPerRun: 4,
      windowStepDays: 3,
    });
  });

  it("emits ready evidence for matching stable historical rows", async () => {
    const artifact = await runTutorialHistoricalComparison();

    expect(artifact.kind).toBe("ads_sync.source_comparison");
    expect(artifact.summary.passed).toBeTruthy();
    expect(artifact.readinessRecommendation).toBe("ready");
  });
});
