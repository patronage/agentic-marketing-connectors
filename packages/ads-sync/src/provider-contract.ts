/**
 * Package-owned provider contract for Ads Sync sources.
 *
 * Each provider module implements `AdsSyncProviderModule`. The interface is
 * shaped by the real providers (Google Ads, Meta Ads, and the specified
 * Google Search Console source); a field with only one non-default
 * implementation stays off the interface.
 */

export type AdsSyncProvider =
  | "google_ads"
  | "google_search_console"
  | "meta_ads";

export interface ProviderBackfillPolicy {
  maxWindowsPerRun: number;
  windowStepDays: number;
}

export interface ProviderRateLimitPolicy {
  cooldownSeconds?: number;
  stopOnCode?: number;
}

export interface ReportingFieldRequirement {
  allowedTypes: readonly string[];
  alternatives?: ReportingFieldRequirement[];
  field: string;
  topLevel?: boolean;
}

export interface ReportingStreamRequirement {
  fields: readonly ReportingFieldRequirement[];
  streamName: string;
}

export interface CatalogDriftIssue {
  field?: string;
  message: string;
  streamName: string;
  type: "missing_stream" | "missing_required_field" | "type_change";
}

export interface CampaignDailyRecord {
  account_id: string | null;
  account_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  campaign_status: string | null;
  clicks: number | null;
  conversions: number | null;
  conversions_value: number | null;
  currency_code: string | null;
  date_day: string | null;
  impressions: number | null;
  platform: string;
  raw_record_id: string | null;
  source_generation_id: string | null;
  source_table: string;
  spend: number | null;
}

export type SourceIdentity = Record<string, string | string[] | null>;

/**
 * Reporting window overrides for a sync run. The `meta`-prefixed pair
 * overrides only the Meta Ads insights window; other providers ignore it.
 */
export interface SourceReportingWindow {
  endDate?: string;
  metaEndDate?: string;
  metaStartDate?: string;
  startDate?: string;
}

export interface AdsSyncProviderModule {
  backfillPolicy: ProviderBackfillPolicy;
  defaultAirbyteSchema: string;
  defaultScheduleEveryMinutes: number;
  displayName: string;
  id: string;
  normalizeCampaignDailyRecord: (
    record: Record<string, unknown>
  ) => CampaignDailyRecord;
  rateLimitPolicy: ProviderRateLimitPolicy;
  reportingStreamRequirements: readonly ReportingStreamRequirement[];
  reportingViews: readonly string[];
  sourceAccountId: (sourceConfig: unknown) => string | null;
  sourceConfigForReporting: (
    sourceConfig: Record<string, unknown>,
    catalog: unknown,
    window: SourceReportingWindow
  ) => Record<string, unknown>;
  sourceConfigSecret: string;
  sourceIdentity: (sourceConfig: unknown) => SourceIdentity;
  sourceImage: string;
  stateSecret: string;
  streamName: string;
}

export function fieldRequirement(
  field: string,
  allowedTypes: readonly string[],
  options: Pick<ReportingFieldRequirement, "alternatives"> = {}
): ReportingFieldRequirement {
  return { allowedTypes, field, ...options };
}

export function topLevelFieldRequirement(
  field: string,
  allowedTypes: readonly string[]
): ReportingFieldRequirement {
  return { ...fieldRequirement(field, allowedTypes), topLevel: true };
}

export function catalogDriftIssues(
  requirements: readonly ReportingStreamRequirement[],
  catalog: unknown,
  options: { selectedStreams?: readonly string[] } = {}
): CatalogDriftIssue[] {
  const selectedStreams = options.selectedStreams
    ? new Set(options.selectedStreams)
    : null;
  return requirements.flatMap<CatalogDriftIssue>((streamRequirement) => {
    if (selectedStreams && !selectedStreams.has(streamRequirement.streamName)) {
      return [];
    }
    const stream = findConfiguredCatalogStream(
      catalog,
      streamRequirement.streamName
    );
    if (!stream) {
      return [
        {
          message: `Configured catalog is missing stream ${streamRequirement.streamName}`,
          streamName: streamRequirement.streamName,
          type: "missing_stream" as const,
        },
      ];
    }

    const properties = catalogStreamProperties(stream);
    if (Object.keys(properties).length === 0) {
      return [];
    }
    const topLevelProperties = catalogTopLevelProperties(stream);

    return streamRequirement.fields.flatMap<CatalogDriftIssue>(
      (requirement) => {
        const issue = catalogFieldIssue(
          requirement,
          properties,
          topLevelProperties,
          streamRequirement.streamName
        );
        if (!issue) {
          return [];
        }

        if (
          requirement.alternatives?.some(
            (alternative) =>
              !catalogFieldIssue(
                alternative,
                properties,
                topLevelProperties,
                streamRequirement.streamName
              )
          )
        ) {
          return [];
        }

        return [issue];
      }
    );
  });
}

function catalogFieldIssue(
  requirement: ReportingFieldRequirement,
  properties: Record<string, unknown>,
  topLevelProperties: Record<string, unknown>,
  streamName: string
): CatalogDriftIssue | null {
  const property = requirement.topLevel
    ? topLevelProperties[requirement.field]
    : properties[requirement.field];

  if (!isRecord(property)) {
    return {
      field: requirement.field,
      message: `Reporting field ${requirement.field} is missing from ${streamName}`,
      streamName,
      type: "missing_required_field",
    };
  }

  if (!catalogTypeAllows(property.type, requirement.allowedTypes)) {
    return {
      field: requirement.field,
      message: `Reporting field ${requirement.field} no longer allows ${requirement.allowedTypes.join(" or ")}`,
      streamName,
      type: "type_change",
    };
  }

  return null;
}

export function findConfiguredCatalogStream(
  catalog: unknown,
  streamName: string
) {
  if (!isRecord(catalog) || !Array.isArray(catalog.streams)) {
    return null;
  }

  for (const configuredStream of catalog.streams) {
    if (!isRecord(configuredStream)) {
      continue;
    }
    const { stream } = configuredStream;
    if (isRecord(stream) && stream.name === streamName) {
      return stream;
    }
  }

  return null;
}

function catalogStreamProperties(stream: Record<string, unknown>) {
  const properties = catalogTopLevelProperties(stream);
  if (Object.keys(properties).length === 0) {
    return {};
  }

  return flattenCatalogProperties(properties);
}

export function catalogTopLevelFieldNames(stream: Record<string, unknown>) {
  return Object.keys(catalogTopLevelProperties(stream)).filter(
    (field) => !field.startsWith("_airbyte")
  );
}

function catalogTopLevelProperties(stream: Record<string, unknown>) {
  const jsonSchema = stream.json_schema;
  if (!isRecord(jsonSchema) || !isRecord(jsonSchema.properties)) {
    return {};
  }

  return jsonSchema.properties;
}

function flattenCatalogProperties(
  properties: Record<string, unknown>,
  prefix = ""
) {
  const flattened: Record<string, unknown> = {};
  for (const [name, property] of Object.entries(properties)) {
    if (!isRecord(property)) {
      continue;
    }

    const path = prefix ? `${prefix}_${name}` : name;
    if ("type" in property) {
      flattened[name] ??= property;
      flattened[path] ??= property;
      flattened[normalizeCatalogFieldName(path)] ??= property;
    }

    if (isRecord(property.properties)) {
      Object.assign(
        flattened,
        flattenCatalogProperties(property.properties, path)
      );
    }
  }

  return flattened;
}

function normalizeCatalogFieldName(field: string) {
  return field
    .replaceAll(
      /(?<lowercase>[a-z0-9])(?<uppercase>[A-Z])/gu,
      "$<lowercase>_$<uppercase>"
    )
    .replaceAll(/[^a-zA-Z0-9]+/gu, "_")
    .replaceAll(/^_+|_+$/gu, "")
    .toLowerCase();
}

function catalogTypeAllows(value: unknown, allowedTypes: readonly string[]) {
  const types = Array.isArray(value) ? value.map(String) : [String(value)];
  return allowedTypes.some(
    (allowedType) =>
      types.includes(allowedType) ||
      (allowedType === "number" && types.includes("integer"))
  );
}

// Small value coercion helpers shared by core and provider modules.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function stringValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return String(value);
}

export function numberValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function integerValue(value: unknown) {
  const parsed = numberValue(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

const MICROS_PER_UNIT = 1_000_000;

export function microsToUnits(value: unknown) {
  const parsed = numberValue(value);
  return parsed === null ? null : parsed / MICROS_PER_UNIT;
}

export function actionSum(value: unknown, actionTypes: string[]) {
  if (!Array.isArray(value)) {
    return 0;
  }

  const actionTypeSet = new Set(actionTypes);
  let sum = 0;
  for (const action of value) {
    if (!isRecord(action)) {
      continue;
    }
    if (!actionTypeSet.has(String(action.action_type))) {
      continue;
    }
    const numeric = numberValue(action.value);
    if (numeric !== null) {
      sum += numeric;
    }
  }

  return sum;
}
