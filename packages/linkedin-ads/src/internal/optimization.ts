import type { LinkedInAdsClient } from "./linkedin-ads-client.js";
import { LinkedInAllocationGuardrailError } from "./linkedin-allocation-guardrail-error.js";
import type { LinkedInAnalyticsElement, LinkedInCreative } from "./types.js";

export interface LinkedInOptimizationGuardrails {
  maxAllocation: number;
  minAllocation: number;
}

export interface LinkedInCreativeAllocation {
  creativeId: string;
  currentPct: number;
  hasSufficientEvidence: boolean;
  impressions: number;
  name: string;
  reason: string;
  recommendedPct: number;
  score: number;
}

export interface LinkedInAllocationRecommendation {
  allocations: LinkedInCreativeAllocation[];
  hasSufficientEvidence: boolean;
  hasSignificantDifference: boolean;
  summary: {
    averageScore: number;
    topPerformerScore: number;
    totalImpressions: number;
  };
  warnings: string[];
}

export interface LinkedInFatigueAnalysis {
  fatigued: boolean;
  recommendations: string[];
  signals: string[];
}

export interface LinkedInOptimizationAction {
  creativeId: string;
  status: "ACTIVE" | "PAUSED";
}

export function buildLinkedInOptimizationActions(
  recommendation: LinkedInAllocationRecommendation
): LinkedInOptimizationAction[] {
  if (!recommendation.hasSufficientEvidence) {
    return [];
  }
  return recommendation.allocations.flatMap<LinkedInOptimizationAction>(
    (allocation) => {
      const change = allocation.recommendedPct - allocation.currentPct;
      if (change < -0.15 && allocation.recommendedPct < 0.15) {
        return [
          { creativeId: allocation.creativeId, status: "PAUSED" as const },
        ];
      }
      if (allocation.currentPct === 0 && allocation.recommendedPct > 0.15) {
        return [
          { creativeId: allocation.creativeId, status: "ACTIVE" as const },
        ];
      }
      return [];
    }
  );
}

export async function applyLinkedInOptimizationActions(input: {
  actions: LinkedInOptimizationAction[];
  client: LinkedInAdsClient;
}): Promise<LinkedInOptimizationAction[]> {
  for (const action of input.actions) {
    // oxlint-disable-next-line no-await-in-loop, react-doctor/async-await-in-loop -- status mutations are serialized for deterministic run logs.
    await input.client.setCreativeStatus(action.creativeId, action.status);
  }
  return input.actions;
}

export const DEFAULT_LINKEDIN_OPTIMIZATION_GUARDRAILS: LinkedInOptimizationGuardrails =
  {
    maxAllocation: 0.6,
    minAllocation: 0.1,
  } satisfies LinkedInOptimizationGuardrails;

const MINIMUM_ALLOCATION_EVIDENCE_IMPRESSIONS = 500;

export function recommendLinkedInCreativeAllocation(input: {
  creatives: LinkedInCreative[];
  guardrails?: LinkedInOptimizationGuardrails;
  metrics: LinkedInAnalyticsElement[];
}): LinkedInAllocationRecommendation {
  const guardrails =
    input.guardrails ?? DEFAULT_LINKEDIN_OPTIMIZATION_GUARDRAILS;
  assertFeasibleGuardrails(input.creatives.length, guardrails);
  const activeCount = Math.max(
    1,
    input.creatives.filter((creative) => creative.status === "ACTIVE").length
  );
  const scored = input.creatives.map((creative) => {
    const metrics = findMetrics(input.metrics, creative.id);
    return {
      creative,
      impressions: metrics?.impressions ?? 0,
      score: scoreMetrics(metrics),
    };
  });
  const totalScore = scored.reduce(
    (sum, item) => sum + Math.max(item.score, 1),
    0
  );
  const raw = scored.map((item) => Math.max(item.score, 1) / totalScore);
  const bounded = allocateWithinGuardrails(raw, guardrails);
  const allocations = scored.map((item, index) => {
    const currentPct = item.creative.status === "ACTIVE" ? 1 / activeCount : 0;
    const recommendedPct = bounded[index] ?? currentPct;
    const hasSufficientEvidence =
      item.impressions >= MINIMUM_ALLOCATION_EVIDENCE_IMPRESSIONS;
    return {
      creativeId: item.creative.id,
      currentPct,
      hasSufficientEvidence,
      impressions: item.impressions,
      name: creativeName(item.creative),
      reason: hasSufficientEvidence
        ? scoreReason(item.score)
        : "Insufficient sample",
      recommendedPct,
      score: item.score,
    };
  });
  const scores = allocations.map((item) => item.score);
  return {
    allocations,
    hasSufficientEvidence: allocations.every(
      (allocation) => allocation.hasSufficientEvidence
    ),
    hasSignificantDifference: allocations.some(
      (item) => Math.abs(item.currentPct - item.recommendedPct) >= 0.05
    ),
    summary: {
      averageScore: scores.length
        ? scores.reduce((sum, value) => sum + value, 0) / scores.length
        : 0,
      topPerformerScore: scores.length ? Math.max(...scores) : 0,
      totalImpressions: allocations.reduce(
        (sum, item) => sum + item.impressions,
        0
      ),
    },
    warnings: allocations.flatMap((item) =>
      item.hasSufficientEvidence
        ? []
        : [
            `${item.name} has fewer than ${MINIMUM_ALLOCATION_EVIDENCE_IMPRESSIONS} impressions.`,
          ]
    ),
  };
}

export function detectLinkedInCreativeFatigue(
  metrics: LinkedInAnalyticsElement[]
): LinkedInFatigueAnalysis {
  const totals: {
    clicks: number;
    impressions: number;
    reactions: number;
  } = { clicks: 0, impressions: 0, reactions: 0 };
  for (const row of metrics) {
    totals.clicks += row.clicks ?? 0;
    totals.impressions += row.impressions ?? 0;
    totals.reactions += row.reactions ?? 0;
  }
  const ctr = totals.impressions ? totals.clicks / totals.impressions : 0;
  const engagement = totals.impressions
    ? totals.reactions / totals.impressions
    : 0;
  const signals: string[] = [];
  if (totals.impressions >= 1000 && ctr < 0.003) {
    signals.push(`Low click-through rate (${(ctr * 100).toFixed(2)}%).`);
  }
  if (totals.impressions >= 1000 && engagement < 0.001) {
    signals.push("Low reaction rate after meaningful delivery.");
  }
  return {
    fatigued: signals.length > 0,
    recommendations: signals.length
      ? ["Refresh creative imagery or copy and review audience frequency."]
      : [],
    signals,
  };
}

function creativeName(creative: LinkedInCreative): string {
  const headline = creative.content?.headline;
  return typeof headline === "string" && headline ? headline : creative.id;
}

function findMetrics(
  rows: LinkedInAnalyticsElement[],
  creativeId: string
): LinkedInAnalyticsElement | undefined {
  const numeric = creativeId.split(":").pop();
  return rows.find((row) =>
    row.pivotValues?.some(
      (value) => value === creativeId || value.endsWith(`:${numeric}`)
    )
  );
}

function allocateWithinGuardrails(
  weights: number[],
  guardrails: LinkedInOptimizationGuardrails
): number[] {
  const allocations = Array.from(
    { length: weights.length },
    () => guardrails.minAllocation
  );
  const availableIndexes = new Set(weights.keys());
  let available = 1 - weights.length * guardrails.minAllocation;
  const capacity = guardrails.maxAllocation - guardrails.minAllocation;

  while (availableIndexes.size > 0 && available > 0) {
    const weightTotal = [...availableIndexes].reduce(
      (sum, index) => sum + (weights[index] ?? 0),
      0
    );
    // oxlint-disable-next-line no-loop-func -- shares intentionally capture this iteration's remaining capacity.
    const shares = [...availableIndexes].map((index) => ({
      index,
      value: weightTotal
        ? available * ((weights[index] ?? 0) / weightTotal)
        : available / availableIndexes.size,
    }));
    const saturated = shares.find(({ value }) => value > capacity);
    if (!saturated) {
      for (const { index, value } of shares) {
        allocations[index] = (allocations[index] ?? 0) + value;
      }
      break;
    }
    allocations[saturated.index] = guardrails.maxAllocation;
    available -= capacity;
    availableIndexes.delete(saturated.index);
  }
  return allocations;
}

function assertFeasibleGuardrails(
  creativeCount: number,
  guardrails: LinkedInOptimizationGuardrails
): void {
  const validRange =
    Number.isFinite(guardrails.minAllocation) &&
    Number.isFinite(guardrails.maxAllocation) &&
    guardrails.minAllocation >= 0 &&
    guardrails.maxAllocation <= 1 &&
    guardrails.minAllocation <= guardrails.maxAllocation;
  const feasibleTotal =
    creativeCount > 0 &&
    creativeCount * guardrails.minAllocation <= 1 &&
    creativeCount * guardrails.maxAllocation >= 1;
  if (!(validRange && feasibleTotal)) {
    throw new LinkedInAllocationGuardrailError({
      creativeCount,
      maxAllocation: guardrails.maxAllocation,
      minAllocation: guardrails.minAllocation,
    });
  }
}

function scoreMetrics(metrics: LinkedInAnalyticsElement | undefined): number {
  if (!metrics?.impressions) {
    return 50;
  }
  const ctr = (metrics.clicks ?? 0) / metrics.impressions;
  const leads = metrics.oneClickLeads ?? 0;
  const spend = Number(metrics.costInLocalCurrency ?? 0);
  const cplScore = leads
    ? Math.max(0, Math.min(1, 1 - (spend / leads - 5) / 45))
    : 0;
  const ctrScore = Math.max(0, Math.min(1, (ctr - 0.002) / 0.013));
  return Math.round((cplScore * 0.7 + ctrScore * 0.3) * 100);
}

function scoreReason(score: number): string {
  if (score >= 70) {
    return "Strong performance";
  }
  if (score <= 30) {
    return "Weak performance";
  }
  return "Performing near benchmark";
}
