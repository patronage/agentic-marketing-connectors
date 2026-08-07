import { describe, expect, it, vi } from "vitest";

import {
  applyLinkedInOptimizationActions,
  buildLinkedInOptimizationActions,
  detectLinkedInCreativeFatigue,
  recommendLinkedInCreativeAllocation,
} from "./index.js";

describe("LinkedIn optimization analysis", () => {
  it("recommends allocation from injected creative analytics", () => {
    const result = recommendLinkedInCreativeAllocation({
      creatives: [
        { id: "urn:li:sponsoredCreative:1", status: "ACTIVE" },
        { id: "urn:li:sponsoredCreative:2", status: "ACTIVE" },
      ],
      metrics: [
        {
          clicks: 30,
          costInLocalCurrency: "30",
          impressions: 1000,
          oneClickLeads: 3,
          pivotValues: ["urn:li:sponsoredCreative:1"],
        },
        {
          clicks: 2,
          costInLocalCurrency: "100",
          impressions: 1000,
          oneClickLeads: 1,
          pivotValues: ["urn:li:sponsoredCreative:2"],
        },
      ],
    });

    expect(result.allocations[0]?.recommendedPct).toBeGreaterThan(
      result.allocations[1]?.recommendedPct ?? 1
    );
    expect(result.hasSignificantDifference).toBeTruthy();
    expect(result.allocations[0]?.recommendedPct).toBeLessThanOrEqual(0.6);
  });

  it("preserves totals and feasible bounds across varied creative sets", () => {
    for (let creativeCount = 2; creativeCount <= 8; creativeCount += 1) {
      const boundary = 1 / creativeCount;
      const guardrailCases = [
        { maxAllocation: boundary, minAllocation: 0 },
        { maxAllocation: 1, minAllocation: boundary },
        {
          maxAllocation: Math.min(1, boundary + 0.2),
          minAllocation: Math.min(0.05, boundary),
        },
      ];
      for (const { maxAllocation, minAllocation } of guardrailCases) {
        const result = recommendLinkedInCreativeAllocation({
          creatives: Array.from({ length: creativeCount }, (_, index) => ({
            id: `creative-${index}`,
            status: "ACTIVE" as const,
          })),
          guardrails: { maxAllocation, minAllocation },
          metrics: Array.from({ length: creativeCount }, (_, index) => ({
            clicks: index === 0 ? 200 : index,
            costInLocalCurrency: index === 0 ? "5" : "500",
            impressions: 1000 + index,
            oneClickLeads: index === 0 ? 10 : 0,
            pivotValues: [`creative-${index}`],
          })),
        });
        const allocations = result.allocations.map(
          ({ recommendedPct }) => recommendedPct
        );
        expect(allocations.reduce((sum, value) => sum + value, 0)).toBeCloseTo(
          1
        );
        expect(Math.min(...allocations)).toBeGreaterThanOrEqual(minAllocation);
        expect(Math.max(...allocations)).toBeLessThanOrEqual(maxAllocation);
      }
    }
  });

  it("fails infeasible guardrails with actionable typed evidence", () => {
    expect(() =>
      recommendLinkedInCreativeAllocation({
        creatives: [
          { id: "creative-1", status: "ACTIVE" },
          { id: "creative-2", status: "ACTIVE" },
        ],
        guardrails: { maxAllocation: 0.4, minAllocation: 0.1 },
        metrics: [],
      })
    ).toThrow(
      expect.objectContaining({
        creativeCount: 2,
        name: "LinkedInAllocationGuardrailError",
      })
    );
  });

  it("detects low-response fatigue after meaningful delivery", () => {
    expect(
      detectLinkedInCreativeFatigue([
        { clicks: 1, impressions: 2000, reactions: 0 },
      ])
    ).toMatchObject({ fatigued: true });
  });

  it("plans creative status changes without applying them", () => {
    expect(
      buildLinkedInOptimizationActions({
        allocations: [
          {
            creativeId: "creative-1",
            currentPct: 0.5,
            hasSufficientEvidence: true,
            impressions: 1000,
            name: "Weak",
            reason: "Weak performance",
            recommendedPct: 0.1,
            score: 10,
          },
        ],
        hasSufficientEvidence: true,
        hasSignificantDifference: true,
        summary: {
          averageScore: 10,
          topPerformerScore: 10,
          totalImpressions: 1000,
        },
        warnings: [],
      })
    ).toStrictEqual([{ creativeId: "creative-1", status: "PAUSED" }]);
  });

  it("does not apply status changes for insufficient-evidence allocations", async () => {
    const setCreativeStatus =
      vi.fn<
        (creativeId: string, status: "ACTIVE" | "PAUSED") => Promise<void>
      >();
    const recommendation = recommendLinkedInCreativeAllocation({
      creatives: [
        { id: "creative-1", status: "ACTIVE" },
        { id: "creative-2", status: "PAUSED" },
      ],
      metrics: [],
    });
    const actions = buildLinkedInOptimizationActions(recommendation);

    await applyLinkedInOptimizationActions({
      actions,
      client: { setCreativeStatus } as never,
    });

    expect(actions).toStrictEqual([]);
    expect(setCreativeStatus).not.toHaveBeenCalled();
  });

  it("blocks every action when comparative evidence is mixed", () => {
    const recommendation = recommendLinkedInCreativeAllocation({
      creatives: [
        { id: "creative-1", status: "ACTIVE" },
        { id: "creative-2", status: "PAUSED" },
      ],
      metrics: [
        {
          clicks: 1,
          impressions: 2000,
          pivotValues: ["creative-1"],
        },
      ],
    });

    expect(recommendation.hasSufficientEvidence).toBeFalsy();
    expect(buildLinkedInOptimizationActions(recommendation)).toStrictEqual([]);
  });
});
