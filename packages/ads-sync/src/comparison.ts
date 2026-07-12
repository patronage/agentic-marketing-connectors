import type { AdsSyncProvider } from "./core.js";

export type HistoricalComparisonMetric =
  | "clicks"
  | "conversions"
  | "conversionsValue"
  | "impressions"
  | "spend";

export type HistoricalComparisonEntity = "campaign";

export interface HistoricalComparisonWindow {
  endDate: string;
  stableAsOf?: string;
  startDate: string;
}

export interface HistoricalComparisonRow {
  accountId?: null | string;
  campaignId: string;
  campaignName?: null | string;
  date: string;
  metrics: Partial<Record<HistoricalComparisonMetric, null | number>>;
}

export interface HistoricalComparisonTolerance {
  absolute: number;
  relative: number;
}

export type HistoricalComparisonTolerances = Record<
  HistoricalComparisonMetric,
  HistoricalComparisonTolerance
>;

export interface HistoricalComparisonKnownDelta {
  accountId?: null | string;
  entityId: string;
  metric: HistoricalComparisonMetric;
  reason: string;
  windowDate: string;
}

export interface HistoricalComparisonInput {
  apiRows: HistoricalComparisonRow[];
  generatedAt?: string;
  knownDeltas?: HistoricalComparisonKnownDelta[];
  provider: AdsSyncProvider;
  tolerances?: Partial<HistoricalComparisonTolerances>;
  warehouseRows: HistoricalComparisonRow[];
  window: HistoricalComparisonWindow;
}

export interface HistoricalComparisonStabilityPolicy {
  minStableDays: number;
  name: string;
}

export interface HistoricalComparisonMetricResult {
  accountId: null | string;
  apiValue: number | null;
  delta: number | null;
  entityId: string;
  metric: HistoricalComparisonMetric;
  passed: boolean;
  reason?: string;
  relativeDelta: number | null;
  warehouseValue: number | null;
  windowDate: string;
}

export interface HistoricalComparisonMissingRow {
  accountId: null | string;
  entityId: string;
  source: "api" | "warehouse";
  windowDate: string;
}

export interface HistoricalComparisonDuplicateRow {
  accountId: null | string;
  entityId: string;
  source: "api" | "warehouse";
  windowDate: string;
}

export interface HistoricalComparisonWindowIssue {
  message: string;
  policy: string;
}

export interface SourceComparisonArtifact {
  criteria: {
    entity: HistoricalComparisonEntity;
    metrics: HistoricalComparisonMetric[];
    missingRowsFail: boolean;
    tolerances: HistoricalComparisonTolerances;
    windowStability: HistoricalComparisonStabilityPolicy;
  };
  duplicateRows: HistoricalComparisonDuplicateRow[];
  generatedAt: string;
  kind: "ads_sync.source_comparison";
  knownDeltas: HistoricalComparisonKnownDelta[];
  metricResults: HistoricalComparisonMetricResult[];
  missingRows: HistoricalComparisonMissingRow[];
  provider: AdsSyncProvider;
  readinessRecommendation: "ready" | "review";
  summary: {
    apiRows: number;
    duplicateRows: number;
    failedMetrics: number;
    knownDeltaMetrics: number;
    missingRows: number;
    passed: boolean;
    warehouseRows: number;
    windowIssues: number;
  };
  window: HistoricalComparisonWindow;
  windowIssues: HistoricalComparisonWindowIssue[];
}

export const defaultHistoricalComparisonTolerances: HistoricalComparisonTolerances =
  {
    clicks: { absolute: 0, relative: 0 },
    conversions: { absolute: 0.01, relative: 0.001 },
    conversionsValue: { absolute: 0.01, relative: 0.001 },
    impressions: { absolute: 0, relative: 0 },
    spend: { absolute: 0.01, relative: 0.001 },
  };

export const historicalComparisonMetrics: HistoricalComparisonMetric[] = [
  "impressions",
  "clicks",
  "spend",
  "conversions",
  "conversionsValue",
];

export const historicalComparisonStabilityPolicies = {
  google_ads: {
    minStableDays: 30,
    name: "google_ads_conversion_lag",
  },
  meta_ads: {
    minStableDays: 28,
    name: "meta_ads_attribution_restatement",
  },
} as const satisfies Record<
  AdsSyncProvider,
  HistoricalComparisonStabilityPolicy
>;

export const historicalProviderApiReadSpecs = {
  google_ads: {
    entity: "campaign",
    metrics: historicalComparisonMetrics,
    notes:
      "Read campaign/day metrics from Google Ads over stable historical windows matching ads_sync_reporting.ads_campaign_daily.",
    stableWindowGuidance:
      "Choose windows old enough for conversion lag to settle; document any accepted conversion restatement deltas.",
  },
  meta_ads: {
    entity: "campaign",
    metrics: historicalComparisonMetrics,
    notes:
      "Read campaign-level Insights by date_start over stable historical windows matching ads_sync_reporting.ads_campaign_daily.",
    stableWindowGuidance:
      "Choose windows outside Meta attribution restatement periods; document any accepted attribution-window deltas.",
  },
} as const satisfies Record<
  AdsSyncProvider,
  {
    entity: HistoricalComparisonEntity;
    metrics: readonly HistoricalComparisonMetric[];
    notes: string;
    stableWindowGuidance: string;
  }
>;

export interface HistoricalComparisonProviderReadRequest {
  provider: AdsSyncProvider;
  spec: (typeof historicalProviderApiReadSpecs)[AdsSyncProvider];
  window: HistoricalComparisonWindow;
}

export interface HistoricalComparisonWarehouseReadRequest {
  parameters: unknown[];
  provider: AdsSyncProvider;
  sql: string;
  window: HistoricalComparisonWindow;
}

export interface HistoricalComparisonRunInput extends Omit<
  HistoricalComparisonInput,
  "apiRows" | "warehouseRows"
> {
  readProviderRows: (
    request: HistoricalComparisonProviderReadRequest
  ) => Promise<HistoricalComparisonRow[]>;
  readWarehouseRows: (
    request: HistoricalComparisonWarehouseReadRequest
  ) => Promise<Parameters<typeof normalizeWarehouseCampaignDailyRow>[0][]>;
}

export function warehouseCampaignDailyComparisonQuery(input: {
  provider: AdsSyncProvider;
  window: HistoricalComparisonWindow;
}) {
  return {
    parameters: [input.provider, input.window.startDate, input.window.endDate],
    sql: `
SELECT
  account_id,
  campaign_id,
  campaign_name,
  date_day,
  impressions,
  clicks,
  spend,
  conversions,
  conversions_value
FROM ads_sync_reporting.ads_campaign_daily
WHERE platform = $1
  AND date_day >= $2::date
  AND date_day < $3::date
ORDER BY date_day, account_id, campaign_id
`.trim(),
  };
}

export async function runHistoricalComparisonGate(
  input: HistoricalComparisonRunInput
) {
  const warehouseQuery = warehouseCampaignDailyComparisonQuery({
    provider: input.provider,
    window: input.window,
  });
  const [apiRows, warehouseRows] = await Promise.all([
    input.readProviderRows({
      provider: input.provider,
      spec: historicalProviderApiReadSpecs[input.provider],
      window: input.window,
    }),
    input.readWarehouseRows({
      ...warehouseQuery,
      provider: input.provider,
      window: input.window,
    }),
  ]);

  return buildHistoricalComparisonArtifact({
    ...input,
    apiRows,
    warehouseRows: warehouseRows.map(normalizeWarehouseCampaignDailyRow),
  });
}

export function buildHistoricalComparisonArtifact(
  input: HistoricalComparisonInput
): SourceComparisonArtifact {
  const tolerances = {
    ...defaultHistoricalComparisonTolerances,
    ...input.tolerances,
  };
  const knownDeltas = input.knownDeltas ?? [];
  const apiRows = indexedRows(input.apiRows, "api");
  const warehouseRows = indexedRows(input.warehouseRows, "warehouse");
  const keys = new Set([...apiRows.rows.keys(), ...warehouseRows.rows.keys()]);
  const metricResults: HistoricalComparisonMetricResult[] = [];
  const missingRows: HistoricalComparisonMissingRow[] = [];
  const duplicateRows = [...apiRows.duplicates, ...warehouseRows.duplicates];
  const windowIssues = validateHistoricalComparisonWindow({
    provider: input.provider,
    window: input.window,
  });

  for (const key of [...keys].toSorted()) {
    const apiRow = apiRows.rows.get(key);
    const warehouseRow = warehouseRows.rows.get(key);
    const { accountId, entityId, windowDate } = parseComparisonKey(key);

    if (!apiRow || !warehouseRow) {
      missingRows.push({
        accountId,
        entityId,
        source: apiRow ? "warehouse" : "api",
        windowDate,
      });
      continue;
    }

    for (const metric of historicalComparisonMetrics) {
      const apiValue = metricValue(apiRow, metric);
      const warehouseValue = metricValue(warehouseRow, metric);
      const knownDelta = knownDeltas.find(
        (delta) =>
          delta.entityId === entityId &&
          (delta.accountId ?? null) === accountId &&
          delta.windowDate === windowDate &&
          delta.metric === metric
      );
      const result = compareMetric({
        apiValue,
        knownDeltaReason: knownDelta?.reason,
        metric,
        tolerance: tolerances[metric],
        warehouseValue,
      });
      metricResults.push({
        ...result,
        accountId,
        entityId,
        metric,
        windowDate,
      });
    }
  }

  const failedMetrics = metricResults.filter((result) => !result.passed).length;
  const passed =
    missingRows.length === 0 &&
    duplicateRows.length === 0 &&
    failedMetrics === 0 &&
    windowIssues.length === 0;

  return {
    criteria: {
      entity: "campaign",
      metrics: historicalComparisonMetrics,
      missingRowsFail: true,
      tolerances,
      windowStability: historicalComparisonStabilityPolicies[input.provider],
    },
    duplicateRows,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    kind: "ads_sync.source_comparison",
    knownDeltas,
    metricResults,
    missingRows,
    provider: input.provider,
    readinessRecommendation: passed ? "ready" : "review",
    summary: {
      apiRows: input.apiRows.length,
      duplicateRows: duplicateRows.length,
      failedMetrics,
      knownDeltaMetrics: metricResults.filter(
        (result) => result.passed && result.reason
      ).length,
      missingRows: missingRows.length,
      passed,
      warehouseRows: input.warehouseRows.length,
      windowIssues: windowIssues.length,
    },
    window: input.window,
    windowIssues,
  };
}

export function validateHistoricalComparisonWindow(input: {
  provider: AdsSyncProvider;
  window: HistoricalComparisonWindow;
}): HistoricalComparisonWindowIssue[] {
  const policy = historicalComparisonStabilityPolicies[input.provider];
  const issues: HistoricalComparisonWindowIssue[] = [];
  const startDate = dateOnly(input.window.startDate);
  const endDate = dateOnly(input.window.endDate);
  const stableAsOf = input.window.stableAsOf
    ? dateOnly(input.window.stableAsOf)
    : null;

  if (!startDate || !endDate || startDate >= endDate) {
    issues.push({
      message: "Comparison window requires startDate before endDate.",
      policy: policy.name,
    });
  }

  if (!stableAsOf) {
    issues.push({
      message: "Comparison window requires stableAsOf.",
      policy: policy.name,
    });
    return issues;
  }

  const stableCutoff = new Date(stableAsOf);
  stableCutoff.setUTCDate(stableCutoff.getUTCDate() - policy.minStableDays);
  const latestIncludedDate = endDate ? new Date(endDate) : null;
  latestIncludedDate?.setUTCDate(latestIncludedDate.getUTCDate() - 1);
  if (latestIncludedDate && latestIncludedDate > stableCutoff) {
    issues.push({
      message: `Comparison window endDate must be at least ${policy.minStableDays} days before stableAsOf for ${input.provider}.`,
      policy: policy.name,
    });
  }

  return issues;
}

export function normalizeWarehouseCampaignDailyRow(row: {
  account_id?: null | string;
  campaign_id?: null | string;
  campaign_name?: null | string;
  clicks?: null | number | string;
  conversions?: null | number | string;
  conversions_value?: null | number | string;
  date_day?: null | string;
  impressions?: null | number | string;
  spend?: null | number | string;
}): HistoricalComparisonRow {
  if (!row.campaign_id || !row.date_day) {
    throw new Error(
      "Warehouse comparison rows require campaign_id and date_day"
    );
  }
  return {
    accountId: row.account_id ?? null,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name ?? null,
    date: row.date_day,
    metrics: {
      clicks: numericMetric(row.clicks),
      conversions: numericMetric(row.conversions),
      conversionsValue: numericMetric(row.conversions_value),
      impressions: numericMetric(row.impressions),
      spend: numericMetric(row.spend),
    },
  };
}

function compareMetric(input: {
  apiValue: number | null;
  knownDeltaReason?: string;
  metric: HistoricalComparisonMetric;
  tolerance: HistoricalComparisonTolerance;
  warehouseValue: number | null;
}) {
  if (input.apiValue === null || input.warehouseValue === null) {
    return {
      apiValue: input.apiValue,
      delta: null,
      passed: false,
      reason: "Missing metric value cannot be waived by a known delta.",
      relativeDelta: null,
      warehouseValue: input.warehouseValue,
    };
  }

  const delta = input.warehouseValue - input.apiValue;
  const relativeDelta =
    input.apiValue === 0 ? Math.abs(delta) : Math.abs(delta / input.apiValue);
  const passedByTolerance =
    Math.abs(delta) <= input.tolerance.absolute ||
    relativeDelta <= input.tolerance.relative;

  return {
    apiValue: input.apiValue,
    delta,
    passed: passedByTolerance || Boolean(input.knownDeltaReason),
    reason: passedByTolerance ? undefined : input.knownDeltaReason,
    relativeDelta,
    warehouseValue: input.warehouseValue,
  };
}

function indexedRows(
  rows: HistoricalComparisonRow[],
  source: "api" | "warehouse"
) {
  const indexed = new Map<string, HistoricalComparisonRow>();
  const duplicates: HistoricalComparisonDuplicateRow[] = [];

  for (const row of rows) {
    const key = comparisonKey(row);
    if (indexed.has(key)) {
      const { accountId, entityId, windowDate } = parseComparisonKey(key);
      duplicates.push({
        accountId,
        entityId,
        source,
        windowDate,
      });
      continue;
    }
    indexed.set(key, row);
  }

  return { duplicates, rows: indexed };
}

function comparisonKey(row: HistoricalComparisonRow) {
  return `${row.date}::${row.accountId ?? ""}::${row.campaignId}`;
}

function parseComparisonKey(key: string) {
  const [windowDate, accountId, entityId] = key.split("::");
  if (!windowDate || !entityId) {
    throw new Error(`Invalid comparison key ${key}`);
  }
  return { accountId: accountId || null, entityId, windowDate };
}

function metricValue(
  row: HistoricalComparisonRow,
  metric: HistoricalComparisonMetric
) {
  return row.metrics[metric] ?? null;
}

function numericMetric(value: null | number | string | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function dateOnly(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
