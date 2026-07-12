export type AdsSyncProvider = "google_ads" | "meta_ads";

export interface AirbyteMessageSummary {
  firstRecordEmittedAt: string | null;
  invalid: number;
  logs: number;
  lastRecordEmittedAt: string | null;
  records: number;
  recordsByStream: Record<string, number>;
  states: number;
  traces: number;
  total: number;
}

export interface ArtifactKeys {
  catalogKey: string;
  destinationInputKey: string;
  destinationStderrKey: string;
  destinationStdoutKey: string;
  prefix: string;
  sourceStderrKey: string;
  sourceStdoutKey: string;
  stateInputKey?: string;
  summaryKey: string;
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
  platform: AdsSyncProvider;
  raw_record_id: string | null;
  source_generation_id: string | null;
  source_table: string;
  spend: number | null;
}

export interface StateCommitInput {
  destinationStdout: string;
  sourceStdout: string;
  writeSucceeded: boolean;
}

export interface DestinationInput {
  droppedLines: number;
  messages: string;
  summary: AirbyteMessageSummary;
}

export interface ArtifactManifest {
  byteCount: number;
  firstRecordEmittedAt: string | null;
  kind: string;
  lastRecordEmittedAt: string | null;
  lineCount: number;
  logCount: number;
  recordCount: number;
  sha256: string;
  stateCount: number;
  traceCount: number;
}

export interface ArtifactLimitConfig {
  maxDestinationInputBytes: number;
  maxLines: number;
  maxSourceStdoutBytes: number;
}

export interface SyncConnectionDefinition {
  accountId: string | null;
  airbyteSchema: string;
  catalogConfigRef: string;
  catalogHash: string;
  connectionId: string;
  displayName: string;
  enabled: boolean;
  provider: AdsSyncProvider;
  reportingEnabled: boolean;
  scheduleCron: string | null;
  scheduleEveryMinutes: number | null;
  selectedStreams: string[];
  sourceConfigFingerprint: string;
  sourceConfigRef: string;
  sourceIdentity: Record<string, string | string[] | null>;
  stateConfigRef: string;
  streamGroup: string;
  streamName: string;
}

export type BackfillWindowDispatchAction = "ignore" | "start" | "wait";

export function backfillWindowDispatchAction(window: {
  runId?: null | string;
  status?: null | string;
}): BackfillWindowDispatchAction {
  if (window.status === "queued" || window.status === "running") {
    return window.runId ? "wait" : "start";
  }
  if (window.status === "failed" || window.status === "pending") {
    return "start";
  }
  return "ignore";
}

export interface CatalogDriftIssue {
  field?: string;
  message: string;
  streamName: string;
  type: "missing_stream" | "missing_required_field" | "type_change";
}

interface ReportingFieldRequirement {
  allowedTypes: readonly string[];
  alternatives?: ReportingFieldRequirement[];
  field: string;
  topLevel?: boolean;
}

export const providerDefinitions = {
  google_ads: {
    defaultAirbyteSchema: "airbyte_google_ads",
    displayName: "Google Ads",
    sourceConfigSecret: "GOOGLE_ADS_SOURCE_CONFIG_JSON",
    stateSecret: "GOOGLE_ADS_SOURCE_STATE_JSON",
    streamName: "campaign_daily_performance",
  },
  meta_ads: {
    defaultAirbyteSchema: "airbyte_meta_ads",
    displayName: "Meta Ads",
    sourceConfigSecret: "META_ADS_SOURCE_CONFIG_JSON",
    stateSecret: "META_ADS_SOURCE_STATE_JSON",
    streamName: "customcampaign_daily_performance",
  },
} as const satisfies Record<
  AdsSyncProvider,
  {
    defaultAirbyteSchema: string;
    displayName: string;
    sourceConfigSecret: string;
    stateSecret: string;
    streamName: string;
  }
>;

export const supportedProviders = Object.keys(
  providerDefinitions
) as AdsSyncProvider[];

export function isAdsSyncProvider(value: unknown): value is AdsSyncProvider {
  return typeof value === "string" && Object.hasOwn(providerDefinitions, value);
}

export function requestedProviders(value?: unknown): AdsSyncProvider[] {
  if (value === undefined || value === null || value === "all") {
    return [...supportedProviders];
  }

  if (isAdsSyncProvider(value)) {
    return [value];
  }

  if (Array.isArray(value)) {
    const providers = value.filter(isAdsSyncProvider);
    if (providers.length === value.length && providers.length > 0) {
      return [...new Set(providers)];
    }
  }

  throw new Error(
    `providers must be "all", one supported provider, or a provider array: ${supportedProviders.join(", ")}`
  );
}

export function createRunId(now = new Date()) {
  return `${now.toISOString().replaceAll(/[:.]/gu, "-")}-${crypto.randomUUID()}`;
}

export function artifactKeys(options: {
  provider: AdsSyncProvider;
  runId: string;
  streamName: string;
}): ArtifactKeys {
  const prefix = `${options.provider}/${options.streamName}/${options.runId}`;
  return {
    catalogKey: `${prefix}/configured-catalog.json`,
    destinationInputKey: `${prefix}/destination-input.jsonl`,
    destinationStderrKey: `${prefix}/destination-write.stderr.log`,
    destinationStdoutKey: `${prefix}/destination-write.stdout.jsonl`,
    prefix,
    sourceStderrKey: `${prefix}/source-read.stderr.log`,
    sourceStdoutKey: `${prefix}/source-read.stdout.jsonl`,
    stateInputKey: `${prefix}/state-input.json`,
    summaryKey: `${prefix}/summary.json`,
  };
}

export function summarizeAirbyteMessages(text: string): AirbyteMessageSummary {
  const summary: AirbyteMessageSummary = {
    firstRecordEmittedAt: null,
    invalid: 0,
    logs: 0,
    lastRecordEmittedAt: null,
    records: 0,
    recordsByStream: {},
    states: 0,
    traces: 0,
    total: 0,
  };

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    summary.total += 1;

    try {
      const message = JSON.parse(trimmed) as {
        record?: { emitted_at?: unknown; stream?: unknown };
        type?: unknown;
      };

      if (message.type === "RECORD") {
        summary.records += 1;
        const stream =
          typeof message.record?.stream === "string"
            ? message.record.stream
            : "unknown";
        summary.recordsByStream[stream] =
          (summary.recordsByStream[stream] ?? 0) + 1;
        const emittedAt =
          typeof message.record?.emitted_at === "number"
            ? new Date(message.record.emitted_at).toISOString()
            : null;
        summary.firstRecordEmittedAt ??= emittedAt;
        summary.lastRecordEmittedAt = emittedAt ?? summary.lastRecordEmittedAt;
      } else if (message.type === "STATE") {
        summary.states += 1;
      } else if (message.type === "LOG") {
        summary.logs += 1;
      } else if (message.type === "TRACE") {
        summary.traces += 1;
      }
    } catch {
      summary.invalid += 1;
    }
  }

  return summary;
}

export function extractLastStateInput(text: string): unknown[] | null {
  const statesByDescriptor = new Map<string, unknown>();

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const parsed = JSON.parse(trimmed) as { state?: unknown; type?: string };
      if (parsed.type === "STATE" && parsed.state !== undefined) {
        statesByDescriptor.set(stateDescriptorKey(parsed.state), parsed.state);
      }
    } catch {
      // Connector logs may emit non-JSON lines; continue parsing later lines.
    }
  }

  const states = [...statesByDescriptor.values()];
  return states.length === 0 ? null : states;
}

function stateDescriptorKey(state: unknown) {
  if (!isRecord(state)) {
    return "legacy";
  }

  if (state.type === "GLOBAL") {
    return "global";
  }

  if (state.type === "STREAM" && isRecord(state.stream)) {
    const descriptor = isRecord(state.stream.stream_descriptor)
      ? state.stream.stream_descriptor
      : {};
    return `stream:${JSON.stringify({
      name: descriptor.name ?? null,
      namespace: descriptor.namespace ?? null,
    })}`;
  }

  return "legacy";
}

export function committedStateAfterSuccessfulDestinationWrite(
  destinationStdout: string,
  _sourceStdout: string
) {
  return extractLastStateInput(destinationStdout);
}

export function committedStateAfterDestinationResult(input: StateCommitInput) {
  if (!input.writeSucceeded) {
    return null;
  }

  return committedStateAfterSuccessfulDestinationWrite(
    input.destinationStdout,
    input.sourceStdout
  );
}

export function progressEventPayload(
  event: unknown,
  emittedAt = new Date().toISOString()
) {
  return {
    ...(isRecord(event) ? event : {}),
    emittedAt,
  };
}

export function compileDestinationInput(
  text: string,
  limits?: Pick<ArtifactLimitConfig, "maxDestinationInputBytes" | "maxLines">
): DestinationInput {
  const messages: string[] = [];
  let droppedLines = 0;

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const message = JSON.parse(trimmed) as {
        trace?: { type?: unknown };
        type?: unknown;
      };
      if (isDestinationInputMessage(message)) {
        messages.push(JSON.stringify(message));
      } else {
        droppedLines += 1;
      }
    } catch {
      droppedLines += 1;
    }
  }

  const compiled = messages.length > 0 ? `${messages.join("\n")}\n` : "";
  const byteCount = utf8ByteLength(compiled);
  const lineCount = countNonEmptyLines(compiled);
  if (limits && byteCount > limits.maxDestinationInputBytes) {
    throw new Error(
      `Destination input is ${byteCount} bytes, above limit ${limits.maxDestinationInputBytes}`
    );
  }
  if (limits && lineCount > limits.maxLines) {
    throw new Error(
      `Destination input has ${lineCount} lines, above limit ${limits.maxLines}`
    );
  }
  return {
    droppedLines,
    messages: compiled,
    summary: summarizeAirbyteMessages(compiled),
  };
}

function isDestinationInputMessage(message: {
  trace?: { type?: unknown };
  type?: unknown;
}) {
  return (
    message.type === "RECORD" ||
    message.type === "STATE" ||
    (message.type === "TRACE" && message.trace?.type === "STREAM_STATUS")
  );
}

export async function artifactManifestForText(
  kind: string,
  text: string
): Promise<ArtifactManifest> {
  const summary = summarizeAirbyteMessages(text);
  return {
    byteCount: utf8ByteLength(text),
    firstRecordEmittedAt: summary.firstRecordEmittedAt,
    kind,
    lastRecordEmittedAt: summary.lastRecordEmittedAt,
    lineCount: countNonEmptyLines(text),
    logCount: summary.logs,
    recordCount: summary.records,
    sha256: await sha256Text(text),
    stateCount: summary.states,
    traceCount: summary.traces,
  };
}

export function enforceTextArtifactLimits(
  label: string,
  text: string,
  limits: Pick<ArtifactLimitConfig, "maxLines" | "maxSourceStdoutBytes">
) {
  const byteCount = utf8ByteLength(text);
  const lineCount = countNonEmptyLines(text);
  if (byteCount > limits.maxSourceStdoutBytes) {
    throw new Error(
      `${label} is ${byteCount} bytes, above limit ${limits.maxSourceStdoutBytes}`
    );
  }
  if (lineCount > limits.maxLines) {
    throw new Error(
      `${label} has ${lineCount} lines, above limit ${limits.maxLines}`
    );
  }
}

export function stampConfiguredCatalog(
  catalog: unknown,
  generationId = Date.now()
) {
  const stamped = structuredClone(catalog);
  if (!isRecord(stamped) || !Array.isArray(stamped.streams)) {
    return stamped;
  }

  for (const stream of stamped.streams) {
    if (!isRecord(stream)) {
      continue;
    }

    stream.sync_id = generationId;
    stream.generation_id = generationId;
    stream.minimum_generation_id =
      stream.destination_sync_mode === "overwrite" ? generationId : 0;
  }

  return stamped;
}

export function firstConfiguredStreamGeneration(
  catalog: unknown,
  fallbackGenerationId: number
) {
  if (!isRecord(catalog) || !Array.isArray(catalog.streams)) {
    return {
      generationId: fallbackGenerationId,
      minimumGenerationId: fallbackGenerationId,
      syncId: fallbackGenerationId,
    };
  }

  const [stream] = catalog.streams;
  if (!isRecord(stream)) {
    return {
      generationId: fallbackGenerationId,
      minimumGenerationId: fallbackGenerationId,
      syncId: fallbackGenerationId,
    };
  }

  const stampedGenerationId =
    integerValue(stream.generation_id) ?? fallbackGenerationId;
  return {
    generationId: stampedGenerationId,
    minimumGenerationId:
      integerValue(stream.minimum_generation_id) ?? stampedGenerationId,
    syncId: integerValue(stream.sync_id) ?? stampedGenerationId,
  };
}

export function destinationConfigForProvider(
  config: unknown,
  provider: AdsSyncProvider,
  schema: string = providerDefinitions[provider].defaultAirbyteSchema
) {
  const cloned = structuredClone(config);
  if (!isRecord(cloned)) {
    return cloned;
  }

  cloned.schema = schema;
  return cloned;
}

export function sourceConfigStateKeyInput(config: unknown) {
  return redactSensitiveConfigValues(config);
}

export function sourceConfigForReporting(
  provider: AdsSyncProvider,
  sourceConfig: unknown,
  catalog: unknown,
  options: {
    endDate?: string;
    metaEndDate?: string;
    metaStartDate?: string;
    startDate?: string;
  } = {}
) {
  if (!isRecord(sourceConfig)) {
    return sourceConfig;
  }

  const cloned = structuredClone(sourceConfig);
  if (!isRecord(cloned)) {
    return sourceConfig;
  }

  if (provider === "google_ads") {
    return googleAdsSourceConfigForReporting(cloned, options);
  }

  if (provider !== "meta_ads") {
    return sourceConfig;
  }

  return metaAdsSourceConfigForReporting(cloned, catalog, options);
}

function googleAdsSourceConfigForReporting(
  sourceConfig: Record<string, unknown>,
  options: {
    endDate?: string;
    startDate?: string;
  }
) {
  const startDate =
    dateOnly(options.startDate) ??
    dateOnly(stringValue(sourceConfig.start_date)) ??
    undefined;
  const endDate =
    inclusiveEndDate(options.endDate) ??
    dateOnly(stringValue(sourceConfig.end_date)) ??
    undefined;
  const windowedCustomQueries =
    startDate && endDate && Array.isArray(sourceConfig.custom_queries_array)
      ? rewriteGoogleCustomQueriesForWindow(sourceConfig.custom_queries_array, {
          endDate,
          startDate,
        })
      : undefined;
  return {
    ...sourceConfig,
    ...(endDate ? { end_date: endDate } : {}),
    ...(startDate ? { start_date: startDate } : {}),
    ...(windowedCustomQueries
      ? { custom_queries_array: windowedCustomQueries }
      : {}),
  };
}

function metaAdsSourceConfigForReporting(
  sourceConfig: Record<string, unknown>,
  catalog: unknown,
  options: {
    endDate?: string;
    metaEndDate?: string;
    metaStartDate?: string;
    startDate?: string;
  }
) {
  const startDate =
    dateOnly(options.metaStartDate) ??
    dateOnly(options.startDate) ??
    dateOnly(stringValue(sourceConfig.start_date)) ??
    undefined;
  const endDate =
    dateOnly(options.metaEndDate) ?? inclusiveEndDate(options.endDate);
  const existingInsights = Array.isArray(sourceConfig.custom_insights)
    ? sourceConfig.custom_insights.filter(isRecord)
    : [];
  const reportingInsightKeys = new Set<string>(
    metaReportingInsightStreams.map(({ name }) => name)
  );
  const reportingInsights = metaReportingInsightStreams.flatMap((insight) => {
    const existing =
      existingInsights.find((candidate) => candidate.name === insight.name) ??
      existingInsights.find((candidate) => candidate.level === insight.level) ??
      {};
    const stream = findConfiguredCatalogStream(catalog, insight.streamName);
    if (!stream) {
      return [];
    }
    const fields = catalogTopLevelFieldNames(stream);

    const derivedInsight: Record<string, unknown> = {
      ...existing,
      action_breakdowns: [],
      action_report_time: "mixed",
      breakdowns: [],
      fields,
      level: insight.level,
      name: insight.name,
      time_increment: 1,
      ...(endDate ? { end_date: endDate } : {}),
      ...(startDate ? { start_date: startDate } : {}),
    };
    if (
      typeof derivedInsight.end_date === "string" &&
      derivedInsight.end_date.trim() === ""
    ) {
      delete derivedInsight.end_date;
    }
    return [derivedInsight];
  });
  const unrelatedInsights = existingInsights.filter(
    (insight) =>
      typeof insight.name !== "string" ||
      !reportingInsightKeys.has(insight.name)
  );

  return {
    ...sourceConfig,
    ...(startDate ? { start_date: startDate } : {}),
    custom_insights: [...unrelatedInsights, ...reportingInsights],
  };
}

function dateOnly(value: null | string | undefined) {
  if (!value) {
    return;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return;
  }
  return date.toISOString().slice(0, 10);
}

function inclusiveEndDate(exclusiveEndDate: string | undefined) {
  if (!exclusiveEndDate) {
    return;
  }
  const date = new Date(exclusiveEndDate);
  if (Number.isNaN(date.getTime())) {
    return;
  }
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function rewriteGoogleCustomQueriesForWindow(
  customQueries: unknown,
  window: { endDate: string; startDate: string }
) {
  if (!Array.isArray(customQueries)) {
    return customQueries;
  }

  return customQueries.map((customQuery) => {
    if (!isRecord(customQuery) || typeof customQuery.query !== "string") {
      return customQuery;
    }
    return {
      ...customQuery,
      query: rewriteGoogleDatePredicate(customQuery.query, window),
    };
  });
}

function rewriteGoogleDatePredicate(
  query: string,
  window: { endDate: string; startDate: string }
) {
  const replacement = `segments.date BETWEEN '${window.startDate}' AND '${window.endDate}'`;
  const betweenPattern =
    /segments\.date\s+BETWEEN\s+['"]?\d{4}-\d{2}-\d{2}['"]?\s+AND\s+['"]?\d{4}-\d{2}-\d{2}['"]?/iu;
  if (betweenPattern.test(query)) {
    return query.replace(betweenPattern, replacement);
  }

  const duringPattern = /segments\.date\s+DURING\s+[A-Z0-9_]+/iu;
  if (duringPattern.test(query)) {
    return query.replace(duringPattern, replacement);
  }

  return query;
}

export function defaultConnectionId(provider: AdsSyncProvider) {
  return `${provider}_default`;
}

export async function defaultSyncConnectionDefinition(options: {
  catalog: unknown;
  provider: AdsSyncProvider;
  sourceConfig: unknown;
}): Promise<SyncConnectionDefinition> {
  const definition = providerDefinitions[options.provider];
  return {
    accountId: sourceAccountId(options.provider, options.sourceConfig),
    airbyteSchema: definition.defaultAirbyteSchema,
    catalogConfigRef: `ads-sync.config.ts#${defaultConnectionId(options.provider)}.catalog`,
    catalogHash: await sha256Json(options.catalog),
    connectionId: defaultConnectionId(options.provider),
    displayName: `${definition.displayName} default`,
    enabled: true,
    provider: options.provider,
    reportingEnabled: true,
    scheduleCron: null,
    scheduleEveryMinutes: 6 * 60,
    selectedStreams: configuredCatalogStreamNames(
      options.catalog,
      definition.streamName
    ),
    sourceConfigFingerprint: await sha256Json(
      sourceConfigStateKeyInput(options.sourceConfig)
    ),
    sourceConfigRef: definition.sourceConfigSecret,
    sourceIdentity: sourceIdentity(options.provider, options.sourceConfig),
    stateConfigRef: definition.stateSecret,
    streamGroup: definition.streamName,
    streamName: definition.streamName,
  };
}

function configuredCatalogStreamNames(
  catalog: unknown,
  fallbackStreamName: string
) {
  if (!isRecord(catalog) || !Array.isArray(catalog.streams)) {
    return [fallbackStreamName];
  }

  const streamNames = catalog.streams.flatMap((configuredStream) => {
    if (!isRecord(configuredStream) || !isRecord(configuredStream.stream)) {
      return [];
    }
    return typeof configuredStream.stream.name === "string"
      ? [configuredStream.stream.name]
      : [];
  });

  return streamNames.length > 0
    ? [...new Set(streamNames)]
    : [fallbackStreamName];
}

export function configuredCatalogForSelectedStreams(
  catalog: unknown,
  selectedStreams?: readonly string[]
) {
  if (!selectedStreams || selectedStreams.length === 0) {
    return catalog;
  }

  const selected = new Set(selectedStreams);
  const cloned = structuredClone(catalog);
  if (!isRecord(cloned) || !Array.isArray(cloned.streams)) {
    return cloned;
  }

  const found = new Set<string>();
  cloned.streams = cloned.streams.filter((configuredStream) => {
    if (!isRecord(configuredStream) || !isRecord(configuredStream.stream)) {
      return false;
    }
    if (typeof configuredStream.stream.name !== "string") {
      return false;
    }
    if (selected.has(configuredStream.stream.name)) {
      found.add(configuredStream.stream.name);
      return true;
    }
    return false;
  });
  const missing = selectedStreams.filter(
    (streamName) => !found.has(streamName)
  );
  if (missing.length > 0) {
    throw new Error(
      `Configured catalog is missing selected streams: ${missing.join(", ")}`
    );
  }
  return cloned;
}

export function validateDestinationSchemaIsolation(
  connections: SyncConnectionDefinition[]
) {
  const schemaOwners = new Map<string, string>();
  for (const connection of connections) {
    if (!connection.enabled) {
      continue;
    }
    const existing = schemaOwners.get(connection.airbyteSchema);
    if (existing && existing !== connection.connectionId) {
      throw new Error(
        `Enabled connections ${existing} and ${connection.connectionId} share Airbyte schema ${connection.airbyteSchema}`
      );
    }
    schemaOwners.set(connection.airbyteSchema, connection.connectionId);
  }
}

export function validateCatalogForReporting(
  provider: AdsSyncProvider,
  catalog: unknown,
  options: { selectedStreams?: readonly string[] } = {}
): CatalogDriftIssue[] {
  const selectedStreams = options.selectedStreams
    ? new Set(options.selectedStreams)
    : null;
  return reportingStreamRequirements[provider].flatMap<CatalogDriftIssue>(
    (streamRequirement) => {
      if (
        selectedStreams &&
        !selectedStreams.has(streamRequirement.streamName)
      ) {
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
    }
  );
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

function sourceIdentity(
  provider: AdsSyncProvider,
  config: unknown
): Record<string, string | string[] | null> {
  if (!isRecord(config)) {
    return {};
  }

  if (provider === "google_ads") {
    return {
      customer_id: stringValue(config.customer_id),
      login_customer_id: stringValue(config.login_customer_id),
    };
  }

  return {
    account_ids: Array.isArray(config.account_ids)
      ? config.account_ids.map(String)
      : [],
  };
}

function sourceAccountId(provider: AdsSyncProvider, config: unknown) {
  const identity = sourceIdentity(provider, config);
  if (!isRecord(identity)) {
    return null;
  }
  if (provider === "google_ads") {
    return stringValue(identity.customer_id);
  }
  const accountIds = identity.account_ids;
  return Array.isArray(accountIds) ? stringValue(accountIds[0]) : null;
}

const metaPerformanceFields = [
  fieldRequirement("account_id", ["string"]),
  fieldRequirement("account_name", ["string"]),
  fieldRequirement("account_currency", ["string"]),
  fieldRequirement("date_start", ["string"]),
  fieldRequirement("campaign_id", ["string"]),
  fieldRequirement("campaign_name", ["string"]),
  fieldRequirement("impressions", ["string", "number"]),
  fieldRequirement("reach", ["string", "number"]),
  fieldRequirement("frequency", ["string", "number"]),
  fieldRequirement("clicks", ["string", "number"]),
  fieldRequirement("ctr", ["string", "number"]),
  fieldRequirement("cpc", ["string", "number"]),
  fieldRequirement("cpm", ["string", "number"]),
  fieldRequirement("spend", ["string", "number"]),
  fieldRequirement("actions", ["array"]),
  fieldRequirement("action_values", ["array"]),
  fieldRequirement("cost_per_action_type", ["array"]),
  fieldRequirement("unique_actions", ["array"]),
  fieldRequirement("cost_per_unique_action_type", ["array"]),
  fieldRequirement("inline_link_clicks", ["string", "number"]),
  fieldRequirement("inline_link_click_ctr", ["string", "number"]),
  fieldRequirement("outbound_clicks", ["array"]),
  fieldRequirement("outbound_clicks_ctr", ["array"]),
  fieldRequirement("cost_per_inline_link_click", ["string", "number"]),
  fieldRequirement("cost_per_outbound_click", ["array"]),
  fieldRequirement("inline_post_engagement", ["string", "number"]),
  fieldRequirement("video_thruplay_watched_actions", ["array"]),
  fieldRequirement("cost_per_thruplay", ["array"]),
  fieldRequirement("video_play_actions", ["array"]),
  fieldRequirement("video_continuous_2_sec_watched_actions", ["array"]),
  fieldRequirement("video_avg_time_watched_actions", ["array"]),
  fieldRequirement("video_p25_watched_actions", ["array"]),
  fieldRequirement("video_p50_watched_actions", ["array"]),
  fieldRequirement("video_p75_watched_actions", ["array"]),
  fieldRequirement("video_p95_watched_actions", ["array"]),
  fieldRequirement("video_p100_watched_actions", ["array"]),
  fieldRequirement("website_purchase_roas", ["array"]),
];

const metaReportingInsightStreams = [
  {
    level: "campaign",
    name: "campaign_daily_performance",
    streamName: "customcampaign_daily_performance",
  },
  {
    level: "adset",
    name: "adset_daily_performance",
    streamName: "customadset_daily_performance",
  },
  {
    level: "ad",
    name: "ad_daily_performance",
    streamName: "customad_daily_performance",
  },
] as const;

const reportingStreamRequirements = {
  google_ads: [
    {
      fields: [
        fieldRequirement("customer_id", ["string", "number"]),
        fieldRequirement("segments_date", ["string"]),
        fieldRequirement("campaign_id", ["string", "number"]),
        fieldRequirement("campaign_name", ["string"]),
        fieldRequirement("campaign_status", ["string"]),
        fieldRequirement("metrics_impressions", ["string", "number"]),
        fieldRequirement("metrics_clicks", ["string", "number"]),
        fieldRequirement("metrics_cost_micros", ["string", "number"]),
        fieldRequirement("metrics_conversions", ["string", "number"]),
        fieldRequirement("metrics_conversions_value", ["string", "number"]),
      ],
      streamName: "campaign_daily_performance",
    },
  ],
  meta_ads: [
    {
      fields: [
        ...metaPerformanceFields,
        fieldRequirement("objective", ["string"]),
      ],
      streamName: "customcampaign_daily_performance",
    },
    {
      fields: [
        ...metaPerformanceFields,
        fieldRequirement("adset_id", ["string"]),
        fieldRequirement("adset_name", ["string"]),
        fieldRequirement("optimization_goal", ["string"]),
      ],
      streamName: "customadset_daily_performance",
    },
    {
      fields: [
        ...metaPerformanceFields,
        fieldRequirement("adset_id", ["string"]),
        fieldRequirement("adset_name", ["string"]),
        fieldRequirement("ad_id", ["string"]),
        fieldRequirement("ad_name", ["string"]),
        fieldRequirement("quality_ranking", ["string"]),
        fieldRequirement("engagement_rate_ranking", ["string"]),
        fieldRequirement("conversion_rate_ranking", ["string"]),
      ],
      streamName: "customad_daily_performance",
    },
    {
      fields: [
        topLevelFieldRequirement("id", ["string"]),
        fieldRequirement("account_id", ["string"]),
        fieldRequirement("name", ["string"]),
        fieldRequirement("creative", ["object"], {
          alternatives: [
            topLevelFieldRequirement("creative_id", ["string"]),
            topLevelFieldRequirement("ad_creative_id", ["string"]),
          ],
        }),
      ],
      streamName: "ads",
    },
    {
      fields: [
        topLevelFieldRequirement("id", ["string"]),
        fieldRequirement("name", ["string"]),
        fieldRequirement("object_story_id", ["string"]),
        fieldRequirement("effective_object_story_id", ["string"]),
        fieldRequirement("object_story_spec", ["object"]),
        fieldRequirement("asset_feed_spec", ["object"]),
        fieldRequirement("thumbnail_url", ["string"]),
      ],
      streamName: "ad_creatives",
    },
    {
      fields: [topLevelFieldRequirement("hash", ["string"])],
      streamName: "images",
    },
    {
      fields: [topLevelFieldRequirement("id", ["string"])],
      streamName: "videos",
    },
  ],
} as const satisfies Record<
  AdsSyncProvider,
  {
    fields: ReportingFieldRequirement[];
    streamName: string;
  }[]
>;

function fieldRequirement(
  field: string,
  allowedTypes: readonly string[],
  options: Pick<ReportingFieldRequirement, "alternatives"> = {}
): ReportingFieldRequirement {
  return { allowedTypes, field, ...options };
}

function topLevelFieldRequirement(
  field: string,
  allowedTypes: readonly string[]
): ReportingFieldRequirement {
  return { ...fieldRequirement(field, allowedTypes), topLevel: true };
}

function findConfiguredCatalogStream(catalog: unknown, streamName: string) {
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

function catalogTopLevelFieldNames(stream: Record<string, unknown>) {
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

function utf8ByteLength(text: string) {
  return new TextEncoder().encode(text).byteLength;
}

function countNonEmptyLines(text: string) {
  return text.split("\n").filter((line) => line.trim()).length;
}

async function sha256Text(text: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Json(value: unknown) {
  return sha256Text(stableStringify(value));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const sortedKeys: string[] = [];
  for (const key of Object.keys(record)) {
    const index = sortedKeys.findIndex((current) => current > key);
    if (index === -1) {
      sortedKeys.push(key);
    } else {
      sortedKeys.splice(index, 0, key);
    }
  }

  return `{${sortedKeys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

export function normalizeCampaignDailyRecord(
  provider: AdsSyncProvider,
  record: Record<string, unknown>
): CampaignDailyRecord {
  if (provider === "google_ads") {
    return {
      account_id: stringValue(record.customer_id),
      account_name: stringValue(record.customer_descriptive_name),
      campaign_id: stringValue(record.campaign_id),
      campaign_name: stringValue(record.campaign_name),
      campaign_status: stringValue(record.campaign_status),
      clicks: numberValue(record.metrics_clicks),
      conversions: numberValue(record.metrics_conversions),
      conversions_value: numberValue(record.metrics_conversions_value),
      currency_code: stringValue(record.customer_currency_code),
      date_day: stringValue(record.segments_date),
      impressions: numberValue(record.metrics_impressions),
      platform: provider,
      raw_record_id: stringValue(record._airbyte_raw_id),
      source_generation_id: stringValue(record._airbyte_generation_id),
      source_table: "airbyte_google_ads.campaign_daily_performance",
      spend: microsToUnits(record.metrics_cost_micros),
    };
  }

  return {
    account_id: stringValue(record.account_id),
    account_name: stringValue(record.account_name),
    campaign_id: stringValue(record.campaign_id),
    campaign_name: stringValue(record.campaign_name),
    campaign_status: stringValue(record.campaign_status),
    clicks: numberValue(record.clicks),
    conversions: actionSum(record.actions, [
      "lead",
      "onsite_conversion.lead_grouped",
      "offsite_conversion.fb_pixel_lead",
      "purchase",
      "offsite_conversion.fb_pixel_purchase",
    ]),
    conversions_value: actionSum(record.action_values, [
      "lead",
      "onsite_conversion.lead_grouped",
      "offsite_conversion.fb_pixel_lead",
      "purchase",
      "offsite_conversion.fb_pixel_purchase",
    ]),
    currency_code: stringValue(record.account_currency),
    date_day: stringValue(record.date_start),
    impressions: numberValue(record.impressions),
    platform: provider,
    raw_record_id: stringValue(record._airbyte_raw_id),
    source_generation_id: stringValue(record._airbyte_generation_id),
    source_table: "airbyte_meta_ads.customcampaign_daily_performance",
    spend: numberValue(record.spend),
  };
}

export const controlSchemaSql = `
CREATE SCHEMA IF NOT EXISTS ads_sync;
CREATE SCHEMA IF NOT EXISTS ads_sync_reporting;

CREATE TABLE IF NOT EXISTS ads_sync.sync_connections (
  id text PRIMARY KEY,
  provider text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  account_id text,
  source_identity jsonb,
  source_config_ref text,
  source_config_fingerprint text,
  state_config_ref text,
  configured_catalog_ref text,
  configured_catalog_hash text,
  selected_streams jsonb NOT NULL DEFAULT '[]'::jsonb,
  stream_group text NOT NULL DEFAULT '',
  stream_name text NOT NULL,
  airbyte_schema text NOT NULL,
  status text NOT NULL DEFAULT 'enabled',
  reporting_enabled boolean NOT NULL DEFAULT false,
  schedule_cron text,
  schedule_every_minutes integer,
  next_run_at timestamptz,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ads_sync.sync_connections
  ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '';
ALTER TABLE ads_sync.sync_connections
  ADD COLUMN IF NOT EXISTS source_identity jsonb;
ALTER TABLE ads_sync.sync_connections
  ADD COLUMN IF NOT EXISTS source_config_ref text;
ALTER TABLE ads_sync.sync_connections
  ADD COLUMN IF NOT EXISTS source_config_fingerprint text;
ALTER TABLE ads_sync.sync_connections
  ADD COLUMN IF NOT EXISTS configured_catalog_ref text;
ALTER TABLE ads_sync.sync_connections
  ADD COLUMN IF NOT EXISTS configured_catalog_hash text;
ALTER TABLE ads_sync.sync_connections
  ADD COLUMN IF NOT EXISTS selected_streams jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE ads_sync.sync_connections
  ADD COLUMN IF NOT EXISTS stream_group text NOT NULL DEFAULT '';
ALTER TABLE ads_sync.sync_connections
  ADD COLUMN IF NOT EXISTS reporting_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE ads_sync.sync_connections
  ADD COLUMN IF NOT EXISTS schedule_cron text;
ALTER TABLE ads_sync.sync_connections
  ADD COLUMN IF NOT EXISTS schedule_every_minutes integer;
ALTER TABLE ads_sync.sync_connections
  ADD COLUMN IF NOT EXISTS state_config_ref text;
ALTER TABLE ads_sync.sync_connections
  ADD COLUMN IF NOT EXISTS next_run_at timestamptz;
ALTER TABLE ads_sync.sync_connections
  ADD COLUMN IF NOT EXISTS last_run_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS sync_connections_enabled_schema_idx
  ON ads_sync.sync_connections (airbyte_schema)
  WHERE status = 'enabled';

DROP INDEX IF EXISTS ads_sync.sync_connections_reporting_provider_idx;

CREATE UNIQUE INDEX IF NOT EXISTS sync_connections_enabled_reporting_provider_idx
  ON ads_sync.sync_connections (provider)
  WHERE reporting_enabled = true AND status = 'enabled';

CREATE INDEX IF NOT EXISTS sync_connections_due_idx
  ON ads_sync.sync_connections (next_run_at)
  WHERE status = 'enabled';

CREATE TABLE IF NOT EXISTS ads_sync.backfill_plans (
  id text PRIMARY KEY,
  connection_id text NOT NULL REFERENCES ads_sync.sync_connections(id),
  provider text NOT NULL,
  stream_group text,
  status text NOT NULL DEFAULT 'active',
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  window_step_days integer NOT NULL,
  max_windows_per_run integer NOT NULL,
  next_window_start timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  stop_reason text
);

ALTER TABLE ads_sync.backfill_plans
  ADD COLUMN IF NOT EXISTS stream_group text;
ALTER TABLE ads_sync.backfill_plans
  ADD COLUMN IF NOT EXISTS max_windows_per_run integer NOT NULL DEFAULT 1;
ALTER TABLE ads_sync.backfill_plans
  ADD COLUMN IF NOT EXISTS next_window_start timestamptz;
ALTER TABLE ads_sync.backfill_plans
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE ads_sync.backfill_plans
  ADD COLUMN IF NOT EXISTS stop_reason text;
ALTER TABLE ads_sync.backfill_plans
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

UPDATE ads_sync.backfill_plans
SET window_end = window_start + interval '1 day'
WHERE window_end <= window_start;

UPDATE ads_sync.backfill_plans
SET window_step_days = 1
WHERE window_step_days <= 0;

UPDATE ads_sync.backfill_plans
SET max_windows_per_run = 1
WHERE max_windows_per_run <= 0;

UPDATE ads_sync.backfill_plans
SET next_window_start = window_start
WHERE next_window_start IS NULL;

ALTER TABLE ads_sync.backfill_plans
  ALTER COLUMN next_window_start SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'backfill_plans_window_order_chk'
  ) THEN
    ALTER TABLE ads_sync.backfill_plans
      ADD CONSTRAINT backfill_plans_window_order_chk CHECK (window_start < window_end);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'backfill_plans_window_step_days_chk'
  ) THEN
    ALTER TABLE ads_sync.backfill_plans
      ADD CONSTRAINT backfill_plans_window_step_days_chk CHECK (window_step_days > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'backfill_plans_max_windows_per_run_chk'
  ) THEN
    ALTER TABLE ads_sync.backfill_plans
      ADD CONSTRAINT backfill_plans_max_windows_per_run_chk CHECK (max_windows_per_run > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS backfill_plans_active_connection_idx
  ON ads_sync.backfill_plans (connection_id, next_window_start)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS backfill_plans_active_window_idx
  ON ads_sync.backfill_plans (
    connection_id,
    COALESCE(stream_group, ''),
    window_start,
    window_end
  )
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS ads_sync.sync_run_windows (
  id text PRIMARY KEY,
  backfill_plan_id text NOT NULL REFERENCES ads_sync.backfill_plans(id),
  run_id text,
  connection_id text NOT NULL REFERENCES ads_sync.sync_connections(id),
  provider text NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  attempt integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error_message text
);

ALTER TABLE ads_sync.sync_run_windows
  ADD COLUMN IF NOT EXISTS run_id text;
ALTER TABLE ads_sync.sync_run_windows
  ADD COLUMN IF NOT EXISTS finished_at timestamptz;
ALTER TABLE ads_sync.sync_run_windows
  ADD COLUMN IF NOT EXISTS error_message text;

UPDATE ads_sync.sync_run_windows
SET window_end = window_start + interval '1 day'
WHERE window_end <= window_start;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sync_run_windows_window_order_chk'
  ) THEN
    ALTER TABLE ads_sync.sync_run_windows
      ADD CONSTRAINT sync_run_windows_window_order_chk CHECK (window_start < window_end);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS sync_run_windows_plan_window_idx
  ON ads_sync.sync_run_windows (
    backfill_plan_id,
    connection_id,
    window_start,
    window_end
  );

CREATE TABLE IF NOT EXISTS ads_sync.sync_runs (
  id text PRIMARY KEY,
  connection_id text REFERENCES ads_sync.sync_connections(id),
  backfill_plan_id text REFERENCES ads_sync.backfill_plans(id),
  run_window_id text REFERENCES ads_sync.sync_run_windows(id),
  workflow_instance_id text,
  trigger_type text NOT NULL,
  requested_providers jsonb NOT NULL,
  status text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error_type text,
  error_message text
);

ALTER TABLE ads_sync.sync_runs
  ADD COLUMN IF NOT EXISTS connection_id text REFERENCES ads_sync.sync_connections(id);
ALTER TABLE ads_sync.sync_runs
  ADD COLUMN IF NOT EXISTS backfill_plan_id text REFERENCES ads_sync.backfill_plans(id);
ALTER TABLE ads_sync.sync_runs
  ADD COLUMN IF NOT EXISTS run_window_id text REFERENCES ads_sync.sync_run_windows(id);
ALTER TABLE ads_sync.sync_runs
  ADD COLUMN IF NOT EXISTS workflow_instance_id text;

CREATE TABLE IF NOT EXISTS ads_sync.sync_stream_runs (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES ads_sync.sync_runs(id),
  connection_id text REFERENCES ads_sync.sync_connections(id),
  provider text NOT NULL,
  stream_name text NOT NULL,
  status text NOT NULL,
  source_record_count integer NOT NULL DEFAULT 0,
  state_count integer NOT NULL DEFAULT 0,
  generation_id bigint,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error_type text,
  error_message text
);

ALTER TABLE ads_sync.sync_stream_runs
  ADD COLUMN IF NOT EXISTS connection_id text REFERENCES ads_sync.sync_connections(id);

CREATE TABLE IF NOT EXISTS ads_sync.sync_state_commits (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES ads_sync.sync_runs(id),
  stream_run_id text NOT NULL REFERENCES ads_sync.sync_stream_runs(id),
  connection_id text REFERENCES ads_sync.sync_connections(id),
  provider text NOT NULL,
  stream_name text NOT NULL,
  source_config_hash text,
  configured_catalog_hash text,
  state_json jsonb NOT NULL,
  committed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ads_sync.sync_state_commits
  ADD COLUMN IF NOT EXISTS source_config_hash text;

ALTER TABLE ads_sync.sync_state_commits
  ADD COLUMN IF NOT EXISTS configured_catalog_hash text;

ALTER TABLE ads_sync.sync_state_commits
  ADD COLUMN IF NOT EXISTS connection_id text REFERENCES ads_sync.sync_connections(id);

CREATE TABLE IF NOT EXISTS ads_sync.sync_generation_ledger (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES ads_sync.sync_runs(id),
  stream_run_id text NOT NULL REFERENCES ads_sync.sync_stream_runs(id),
  connection_id text REFERENCES ads_sync.sync_connections(id),
  provider text NOT NULL,
  stream_name text NOT NULL,
  generation_id bigint NOT NULL,
  sync_id bigint NOT NULL,
  minimum_generation_id bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ads_sync.sync_generation_ledger
  ADD COLUMN IF NOT EXISTS connection_id text REFERENCES ads_sync.sync_connections(id);

CREATE TABLE IF NOT EXISTS ads_sync.sync_artifacts (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES ads_sync.sync_runs(id),
  stream_run_id text REFERENCES ads_sync.sync_stream_runs(id),
  provider text,
  artifact_kind text NOT NULL,
  r2_key text NOT NULL,
  content_type text,
  byte_length integer,
  sha256 text,
  line_count integer,
  record_count integer,
  state_count integer,
  log_count integer,
  trace_count integer,
  first_record_emitted_at timestamptz,
  last_record_emitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ads_sync.sync_artifacts
  ADD COLUMN IF NOT EXISTS sha256 text;
ALTER TABLE ads_sync.sync_artifacts
  ADD COLUMN IF NOT EXISTS line_count integer;
ALTER TABLE ads_sync.sync_artifacts
  ADD COLUMN IF NOT EXISTS record_count integer;
ALTER TABLE ads_sync.sync_artifacts
  ADD COLUMN IF NOT EXISTS state_count integer;
ALTER TABLE ads_sync.sync_artifacts
  ADD COLUMN IF NOT EXISTS log_count integer;
ALTER TABLE ads_sync.sync_artifacts
  ADD COLUMN IF NOT EXISTS trace_count integer;
ALTER TABLE ads_sync.sync_artifacts
  ADD COLUMN IF NOT EXISTS first_record_emitted_at timestamptz;
ALTER TABLE ads_sync.sync_artifacts
  ADD COLUMN IF NOT EXISTS last_record_emitted_at timestamptz;

CREATE TABLE IF NOT EXISTS ads_sync.sync_catalog_snapshots (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES ads_sync.sync_runs(id),
  stream_run_id text REFERENCES ads_sync.sync_stream_runs(id),
  provider text NOT NULL,
  stream_name text NOT NULL,
  catalog_hash text,
  catalog_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ads_sync.sync_errors (
  id text PRIMARY KEY,
  run_id text REFERENCES ads_sync.sync_runs(id),
  stream_run_id text REFERENCES ads_sync.sync_stream_runs(id),
  provider text,
  error_type text NOT NULL,
  error_message text NOT NULL,
  error_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ads_sync.sync_stream_leases (
  lease_key text PRIMARY KEY,
  run_id text NOT NULL,
  stream_run_id text NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS sync_stream_runs_run_started_idx
  ON ads_sync.sync_stream_runs (run_id, started_at);

CREATE INDEX IF NOT EXISTS sync_stream_runs_provider_stream_status_idx
  ON ads_sync.sync_stream_runs (provider, stream_name, status);

CREATE INDEX IF NOT EXISTS sync_state_commits_provider_stream_hash_idx
  ON ads_sync.sync_state_commits (
    provider,
    stream_name,
    source_config_hash,
    configured_catalog_hash,
    committed_at DESC
  );

CREATE UNIQUE INDEX IF NOT EXISTS sync_state_commits_stream_run_idx
  ON ads_sync.sync_state_commits (stream_run_id);

CREATE INDEX IF NOT EXISTS sync_artifacts_run_stream_idx
  ON ads_sync.sync_artifacts (run_id, stream_run_id);

CREATE INDEX IF NOT EXISTS sync_errors_run_stream_created_idx
  ON ads_sync.sync_errors (run_id, stream_run_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS sync_catalog_snapshots_stream_run_idx
  ON ads_sync.sync_catalog_snapshots (stream_run_id)
  WHERE stream_run_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sync_generation_ledger_provider_stream_generation_idx
  ON ads_sync.sync_generation_ledger (provider, stream_name, generation_id);

CREATE UNIQUE INDEX IF NOT EXISTS sync_generation_ledger_connection_stream_generation_idx
  ON ads_sync.sync_generation_ledger (connection_id, stream_name, generation_id)
  WHERE connection_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sync_artifacts_stream_kind_idx
  ON ads_sync.sync_artifacts (stream_run_id, artifact_kind)
  WHERE stream_run_id IS NOT NULL;
`;

export const requiredReportingViewTables = [] as const;

export const reportingViewSql = `
CREATE SCHEMA IF NOT EXISTS ads_sync_reporting;

CREATE OR REPLACE FUNCTION ads_sync_reporting.airbyte_action_sum(
  actions jsonb,
  action_types text[]
) RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(SUM((entry ->> 'value')::numeric), 0)
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(actions) = 'array' THEN actions
      ELSE '[]'::jsonb
    END
  ) AS entry
  WHERE entry ->> 'action_type' = ANY(action_types)
$$;

CREATE OR REPLACE FUNCTION ads_sync_reporting.airbyte_action_total(
  actions jsonb
) RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(SUM((entry ->> 'value')::numeric), 0)
  FROM jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(actions) = 'array' THEN actions
      ELSE '[]'::jsonb
    END
  ) AS entry
$$;

DROP VIEW IF EXISTS ads_sync_reporting.ads_ad_daily;
DROP VIEW IF EXISTS ads_sync_reporting.meta_ad_creative_context;
DROP VIEW IF EXISTS ads_sync_reporting.ads_group_daily;
DROP VIEW IF EXISTS ads_sync_reporting.ads_campaign_daily;

DO $$
DECLARE
  google_rows_sql text := 'SELECT NULL::jsonb AS row WHERE false';
  meta_rows_sql text := 'SELECT NULL::jsonb AS row WHERE false';
BEGIN
  IF to_regclass('airbyte_google_ads.campaign_daily_performance') IS NOT NULL THEN
    google_rows_sql := 'SELECT to_jsonb(g) AS row FROM airbyte_google_ads.campaign_daily_performance AS g';
  END IF;

  IF to_regclass('airbyte_meta_ads.customcampaign_daily_performance') IS NOT NULL THEN
    meta_rows_sql := 'SELECT to_jsonb(m) AS row FROM airbyte_meta_ads.customcampaign_daily_performance AS m';
  END IF;

  EXECUTE format($view$
    CREATE OR REPLACE VIEW ads_sync_reporting.ads_campaign_daily AS
    WITH google_rows AS (
      %s
    ),
    google_normalized AS (
      SELECT
        'google_ads'::text AS platform,
        row ->> 'customer_id' AS account_id,
        row ->> 'customer_descriptive_name' AS account_name,
        (row ->> 'segments_date')::date AS date_day,
        row ->> 'campaign_id' AS campaign_id,
        row ->> 'campaign_name' AS campaign_name,
        row ->> 'campaign_status' AS campaign_status,
        NULLIF(row ->> 'metrics_impressions', '')::numeric AS impressions,
        NULLIF(row ->> 'metrics_clicks', '')::numeric AS clicks,
        NULLIF(row ->> 'metrics_cost_micros', '')::numeric / 1000000.0 AS spend,
        NULLIF(row ->> 'metrics_conversions', '')::numeric AS conversions,
        NULLIF(row ->> 'metrics_conversions_value', '')::numeric AS conversions_value,
        row ->> 'customer_currency_code' AS currency_code,
        'airbyte_google_ads.campaign_daily_performance'::text AS source_table,
        row ->> '_airbyte_generation_id' AS source_generation_id,
        NULLIF(row ->> '_airbyte_extracted_at', '')::timestamptz AS extracted_at,
        row ->> '_airbyte_raw_id' AS raw_record_id
      FROM google_rows
    ),
    google_deduped AS (
      SELECT
        platform,
        account_id,
        account_name,
        date_day,
        campaign_id,
        campaign_name,
        campaign_status,
        impressions,
        clicks,
        spend,
        conversions,
        conversions_value,
        currency_code,
        source_table,
        source_generation_id,
        extracted_at,
        raw_record_id
      FROM (
        SELECT
          google_normalized.*,
          row_number() OVER (
            PARTITION BY account_id, date_day, campaign_id
            ORDER BY extracted_at DESC NULLS LAST, raw_record_id DESC NULLS LAST
          ) AS row_rank
        FROM google_normalized
      ) AS ranked_google
      WHERE row_rank = 1
    ),
    meta_rows AS (
      %s
    ),
    meta_normalized AS (
      SELECT
        'meta_ads'::text AS platform,
        row ->> 'account_id' AS account_id,
        row ->> 'account_name' AS account_name,
        (row ->> 'date_start')::date AS date_day,
        row ->> 'campaign_id' AS campaign_id,
        row ->> 'campaign_name' AS campaign_name,
        row ->> 'campaign_status' AS campaign_status,
        NULLIF(row ->> 'impressions', '')::numeric AS impressions,
        NULLIF(row ->> 'clicks', '')::numeric AS clicks,
        NULLIF(row ->> 'spend', '')::numeric AS spend,
        ads_sync_reporting.airbyte_action_sum(row -> 'actions', ARRAY[
          'lead',
          'onsite_conversion.lead_grouped',
          'offsite_conversion.fb_pixel_lead',
          'purchase',
          'offsite_conversion.fb_pixel_purchase'
        ]) AS conversions,
        ads_sync_reporting.airbyte_action_sum(row -> 'action_values', ARRAY[
          'lead',
          'onsite_conversion.lead_grouped',
          'offsite_conversion.fb_pixel_lead',
          'purchase',
          'offsite_conversion.fb_pixel_purchase'
        ]) AS conversions_value,
        row ->> 'account_currency' AS currency_code,
        'airbyte_meta_ads.customcampaign_daily_performance'::text AS source_table,
        row ->> '_airbyte_generation_id' AS source_generation_id,
        NULLIF(row ->> '_airbyte_extracted_at', '')::timestamptz AS extracted_at,
        row ->> '_airbyte_raw_id' AS raw_record_id
      FROM meta_rows
    ),
    meta_deduped AS (
      SELECT
        platform,
        account_id,
        account_name,
        date_day,
        campaign_id,
        campaign_name,
        campaign_status,
        impressions,
        clicks,
        spend,
        conversions,
        conversions_value,
        currency_code,
        source_table,
        source_generation_id,
        extracted_at,
        raw_record_id
      FROM (
        SELECT
          meta_normalized.*,
          row_number() OVER (
            PARTITION BY account_id, date_day, campaign_id
            ORDER BY extracted_at DESC NULLS LAST, raw_record_id DESC NULLS LAST
          ) AS row_rank
        FROM meta_normalized
      ) AS ranked_meta
      WHERE row_rank = 1
    )
    SELECT
      platform,
      account_id,
      account_name,
      date_day,
      campaign_id,
      campaign_name,
      campaign_status,
      impressions,
      clicks,
      spend,
      conversions,
      conversions_value,
      currency_code,
      source_table,
      source_generation_id,
      extracted_at,
      raw_record_id
    FROM google_deduped
    UNION ALL
    SELECT
      platform,
      account_id,
      account_name,
      date_day,
      campaign_id,
      campaign_name,
      campaign_status,
      impressions,
      clicks,
      spend,
      conversions,
      conversions_value,
      currency_code,
      source_table,
      source_generation_id,
      extracted_at,
      raw_record_id
    FROM meta_deduped
  $view$, google_rows_sql, meta_rows_sql);
END $$;

DO $$
BEGIN
  IF to_regclass('airbyte_meta_ads.customadset_daily_performance') IS NOT NULL THEN
    EXECUTE $view$
      CREATE OR REPLACE VIEW ads_sync_reporting.ads_group_daily AS
      WITH meta_rows AS (
        SELECT to_jsonb(m) AS row
        FROM airbyte_meta_ads.customadset_daily_performance AS m
      ),
      meta_normalized AS (
        SELECT
          'meta_ads'::text AS platform,
          row ->> 'account_id' AS account_id,
          row ->> 'account_name' AS account_name,
          (row ->> 'date_start')::date AS date_day,
          row ->> 'campaign_id' AS campaign_id,
          row ->> 'campaign_name' AS campaign_name,
          row ->> 'adset_id' AS group_id,
          row ->> 'adset_name' AS group_name,
          NULL::text AS group_status,
          row ->> 'optimization_goal' AS optimization_goal,
          NULLIF(row ->> 'impressions', '')::numeric AS impressions,
          NULLIF(row ->> 'reach', '')::numeric AS reach,
          NULLIF(row ->> 'frequency', '')::numeric AS frequency,
          NULLIF(row ->> 'clicks', '')::numeric AS clicks,
          NULLIF(row ->> 'ctr', '')::numeric AS ctr,
          NULLIF(row ->> 'cpc', '')::numeric AS cpc,
          NULLIF(row ->> 'cpm', '')::numeric AS cpm,
          NULLIF(row ->> 'spend', '')::numeric AS spend,
          NULLIF(row ->> 'unique_clicks', '')::numeric AS unique_clicks,
          NULLIF(row ->> 'unique_ctr', '')::numeric AS unique_ctr,
          NULLIF(row ->> 'inline_link_clicks', '')::numeric AS inline_link_clicks,
          NULLIF(row ->> 'inline_link_click_ctr', '')::numeric AS inline_link_click_ctr,
          NULLIF(row ->> 'cost_per_inline_link_click', '')::numeric AS cost_per_inline_link_click,
          row -> 'actions' AS actions,
          row -> 'action_values' AS action_values,
          row -> 'cost_per_action_type' AS cost_per_action_type,
          row -> 'unique_actions' AS unique_actions,
          row -> 'cost_per_unique_action_type' AS cost_per_unique_action_type,
          row -> 'outbound_clicks' AS outbound_clicks,
          row -> 'outbound_clicks_ctr' AS outbound_clicks_ctr,
          row -> 'cost_per_outbound_click' AS cost_per_outbound_click,
          row -> 'website_purchase_roas' AS website_purchase_roas,
          ads_sync_reporting.airbyte_action_sum(row -> 'actions', ARRAY[
            'lead',
            'onsite_conversion.lead_grouped',
            'offsite_conversion.fb_pixel_lead',
            'purchase',
            'offsite_conversion.fb_pixel_purchase'
          ]) AS conversions,
          ads_sync_reporting.airbyte_action_sum(row -> 'action_values', ARRAY[
            'lead',
            'onsite_conversion.lead_grouped',
            'offsite_conversion.fb_pixel_lead',
            'purchase',
            'offsite_conversion.fb_pixel_purchase'
          ]) AS conversions_value,
          ads_sync_reporting.airbyte_action_total(row -> 'video_continuous_2_sec_watched_actions') AS video_2_sec_views,
          ads_sync_reporting.airbyte_action_total(row -> 'video_thruplay_watched_actions') AS thruplays,
          ads_sync_reporting.airbyte_action_total(row -> 'video_play_actions') AS video_plays,
          ads_sync_reporting.airbyte_action_total(row -> 'video_avg_time_watched_actions') AS video_avg_time_watched,
          ads_sync_reporting.airbyte_action_total(row -> 'video_p25_watched_actions') AS video_p25_watched,
          ads_sync_reporting.airbyte_action_total(row -> 'video_p50_watched_actions') AS video_p50_watched,
          ads_sync_reporting.airbyte_action_total(row -> 'video_p75_watched_actions') AS video_p75_watched,
          ads_sync_reporting.airbyte_action_total(row -> 'video_p95_watched_actions') AS video_p95_watched,
          ads_sync_reporting.airbyte_action_total(row -> 'video_p100_watched_actions') AS video_p100_watched,
          ads_sync_reporting.airbyte_action_total(row -> 'cost_per_thruplay') AS cost_per_thruplay,
          NULLIF(row ->> 'inline_post_engagement', '')::numeric AS inline_post_engagement,
          row ->> 'account_currency' AS currency_code,
          'airbyte_meta_ads.customadset_daily_performance'::text AS source_table,
          row ->> '_airbyte_generation_id' AS source_generation_id,
          NULLIF(row ->> '_airbyte_extracted_at', '')::timestamptz AS extracted_at,
          row ->> '_airbyte_raw_id' AS raw_record_id
        FROM meta_rows
      )
      SELECT
        platform,
        account_id,
        account_name,
        date_day,
        campaign_id,
        campaign_name,
        group_id,
        group_name,
        group_status,
        optimization_goal,
        impressions,
        reach,
        frequency,
        clicks,
        ctr,
        cpc,
        cpm,
        spend,
        unique_clicks,
        unique_ctr,
        inline_link_clicks,
        inline_link_click_ctr,
        cost_per_inline_link_click,
        actions,
        action_values,
        cost_per_action_type,
        unique_actions,
        cost_per_unique_action_type,
        outbound_clicks,
        outbound_clicks_ctr,
        cost_per_outbound_click,
        website_purchase_roas,
        conversions,
        conversions_value,
        video_2_sec_views,
        CASE
          WHEN impressions > 0 THEN video_2_sec_views / impressions
          ELSE NULL
        END AS hook_rate,
        thruplays,
        video_plays,
        video_avg_time_watched,
        video_p25_watched,
        video_p50_watched,
        video_p75_watched,
        video_p95_watched,
        video_p100_watched,
        cost_per_thruplay,
        inline_post_engagement,
        currency_code,
        source_table,
        source_generation_id,
        extracted_at,
        raw_record_id
      FROM (
        SELECT
          meta_normalized.*,
          row_number() OVER (
            PARTITION BY account_id, date_day, group_id
            ORDER BY extracted_at DESC NULLS LAST, raw_record_id DESC NULLS LAST
          ) AS row_rank
        FROM meta_normalized
      ) AS ranked_meta
      WHERE row_rank = 1
    $view$;
  ELSE
    EXECUTE $view$
      CREATE OR REPLACE VIEW ads_sync_reporting.ads_group_daily AS
      SELECT
        NULL::text AS platform,
        NULL::text AS account_id,
        NULL::text AS account_name,
        NULL::date AS date_day,
        NULL::text AS campaign_id,
        NULL::text AS campaign_name,
        NULL::text AS group_id,
        NULL::text AS group_name,
        NULL::text AS group_status,
        NULL::text AS optimization_goal,
        NULL::numeric AS impressions,
        NULL::numeric AS reach,
        NULL::numeric AS frequency,
        NULL::numeric AS clicks,
        NULL::numeric AS ctr,
        NULL::numeric AS cpc,
        NULL::numeric AS cpm,
        NULL::numeric AS spend,
        NULL::numeric AS unique_clicks,
        NULL::numeric AS unique_ctr,
        NULL::numeric AS inline_link_clicks,
        NULL::numeric AS inline_link_click_ctr,
        NULL::numeric AS cost_per_inline_link_click,
        NULL::jsonb AS actions,
        NULL::jsonb AS action_values,
        NULL::jsonb AS cost_per_action_type,
        NULL::jsonb AS unique_actions,
        NULL::jsonb AS cost_per_unique_action_type,
        NULL::jsonb AS outbound_clicks,
        NULL::jsonb AS outbound_clicks_ctr,
        NULL::jsonb AS cost_per_outbound_click,
        NULL::jsonb AS website_purchase_roas,
        NULL::numeric AS conversions,
        NULL::numeric AS conversions_value,
        NULL::numeric AS video_2_sec_views,
        NULL::numeric AS hook_rate,
        NULL::numeric AS thruplays,
        NULL::numeric AS video_plays,
        NULL::numeric AS video_avg_time_watched,
        NULL::numeric AS video_p25_watched,
        NULL::numeric AS video_p50_watched,
        NULL::numeric AS video_p75_watched,
        NULL::numeric AS video_p95_watched,
        NULL::numeric AS video_p100_watched,
        NULL::numeric AS cost_per_thruplay,
        NULL::numeric AS inline_post_engagement,
        NULL::text AS currency_code,
        NULL::text AS source_table,
        NULL::text AS source_generation_id,
        NULL::timestamptz AS extracted_at,
        NULL::text AS raw_record_id
      WHERE false
    $view$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('airbyte_meta_ads.customad_daily_performance') IS NOT NULL THEN
    EXECUTE $view$
      CREATE OR REPLACE VIEW ads_sync_reporting.ads_ad_daily AS
      WITH meta_rows AS (
        SELECT to_jsonb(m) AS row
        FROM airbyte_meta_ads.customad_daily_performance AS m
      ),
      meta_normalized AS (
        SELECT
          'meta_ads'::text AS platform,
          row ->> 'account_id' AS account_id,
          row ->> 'account_name' AS account_name,
          (row ->> 'date_start')::date AS date_day,
          row ->> 'campaign_id' AS campaign_id,
          row ->> 'campaign_name' AS campaign_name,
          row ->> 'adset_id' AS group_id,
          row ->> 'adset_name' AS group_name,
          row ->> 'ad_id' AS ad_id,
          row ->> 'ad_name' AS ad_name,
          NULL::text AS ad_status,
          NULLIF(row ->> 'impressions', '')::numeric AS impressions,
          NULLIF(row ->> 'reach', '')::numeric AS reach,
          NULLIF(row ->> 'frequency', '')::numeric AS frequency,
          NULLIF(row ->> 'clicks', '')::numeric AS clicks,
          NULLIF(row ->> 'ctr', '')::numeric AS ctr,
          NULLIF(row ->> 'cpc', '')::numeric AS cpc,
          NULLIF(row ->> 'cpm', '')::numeric AS cpm,
          NULLIF(row ->> 'spend', '')::numeric AS spend,
          NULLIF(row ->> 'unique_clicks', '')::numeric AS unique_clicks,
          NULLIF(row ->> 'unique_ctr', '')::numeric AS unique_ctr,
          NULLIF(row ->> 'inline_link_clicks', '')::numeric AS inline_link_clicks,
          NULLIF(row ->> 'inline_link_click_ctr', '')::numeric AS inline_link_click_ctr,
          NULLIF(row ->> 'cost_per_inline_link_click', '')::numeric AS cost_per_inline_link_click,
          row -> 'actions' AS actions,
          row -> 'action_values' AS action_values,
          row -> 'cost_per_action_type' AS cost_per_action_type,
          row -> 'unique_actions' AS unique_actions,
          row -> 'cost_per_unique_action_type' AS cost_per_unique_action_type,
          row -> 'outbound_clicks' AS outbound_clicks,
          row -> 'outbound_clicks_ctr' AS outbound_clicks_ctr,
          row -> 'cost_per_outbound_click' AS cost_per_outbound_click,
          row -> 'website_purchase_roas' AS website_purchase_roas,
          ads_sync_reporting.airbyte_action_sum(row -> 'actions', ARRAY[
            'lead',
            'onsite_conversion.lead_grouped',
            'offsite_conversion.fb_pixel_lead',
            'purchase',
            'offsite_conversion.fb_pixel_purchase'
          ]) AS conversions,
          ads_sync_reporting.airbyte_action_sum(row -> 'action_values', ARRAY[
            'lead',
            'onsite_conversion.lead_grouped',
            'offsite_conversion.fb_pixel_lead',
            'purchase',
            'offsite_conversion.fb_pixel_purchase'
          ]) AS conversions_value,
          ads_sync_reporting.airbyte_action_total(row -> 'video_continuous_2_sec_watched_actions') AS video_2_sec_views,
          ads_sync_reporting.airbyte_action_total(row -> 'video_thruplay_watched_actions') AS thruplays,
          ads_sync_reporting.airbyte_action_total(row -> 'video_play_actions') AS video_plays,
          ads_sync_reporting.airbyte_action_total(row -> 'video_avg_time_watched_actions') AS video_avg_time_watched,
          ads_sync_reporting.airbyte_action_total(row -> 'video_p25_watched_actions') AS video_p25_watched,
          ads_sync_reporting.airbyte_action_total(row -> 'video_p50_watched_actions') AS video_p50_watched,
          ads_sync_reporting.airbyte_action_total(row -> 'video_p75_watched_actions') AS video_p75_watched,
          ads_sync_reporting.airbyte_action_total(row -> 'video_p95_watched_actions') AS video_p95_watched,
          ads_sync_reporting.airbyte_action_total(row -> 'video_p100_watched_actions') AS video_p100_watched,
          ads_sync_reporting.airbyte_action_total(row -> 'cost_per_thruplay') AS cost_per_thruplay,
          NULLIF(row ->> 'inline_post_engagement', '')::numeric AS inline_post_engagement,
          row ->> 'quality_ranking' AS quality_ranking,
          row ->> 'engagement_rate_ranking' AS engagement_rate_ranking,
          row ->> 'conversion_rate_ranking' AS conversion_rate_ranking,
          row ->> 'account_currency' AS currency_code,
          'airbyte_meta_ads.customad_daily_performance'::text AS source_table,
          row ->> '_airbyte_generation_id' AS source_generation_id,
          NULLIF(row ->> '_airbyte_extracted_at', '')::timestamptz AS extracted_at,
          row ->> '_airbyte_raw_id' AS raw_record_id
        FROM meta_rows
      )
      SELECT
        platform,
        account_id,
        account_name,
        date_day,
        campaign_id,
        campaign_name,
        group_id,
        group_name,
        ad_id,
        ad_name,
        ad_status,
        impressions,
        reach,
        frequency,
        clicks,
        ctr,
        cpc,
        cpm,
        spend,
        unique_clicks,
        unique_ctr,
        inline_link_clicks,
        inline_link_click_ctr,
        cost_per_inline_link_click,
        actions,
        action_values,
        cost_per_action_type,
        unique_actions,
        cost_per_unique_action_type,
        outbound_clicks,
        outbound_clicks_ctr,
        cost_per_outbound_click,
        website_purchase_roas,
        conversions,
        conversions_value,
        video_2_sec_views,
        CASE
          WHEN impressions > 0 THEN video_2_sec_views / impressions
          ELSE NULL
        END AS hook_rate,
        thruplays,
        video_plays,
        video_avg_time_watched,
        video_p25_watched,
        video_p50_watched,
        video_p75_watched,
        video_p95_watched,
        video_p100_watched,
        cost_per_thruplay,
        inline_post_engagement,
        quality_ranking,
        engagement_rate_ranking,
        conversion_rate_ranking,
        currency_code,
        source_table,
        source_generation_id,
        extracted_at,
        raw_record_id
      FROM (
        SELECT
          meta_normalized.*,
          row_number() OVER (
            PARTITION BY account_id, date_day, ad_id
            ORDER BY extracted_at DESC NULLS LAST, raw_record_id DESC NULLS LAST
          ) AS row_rank
        FROM meta_normalized
      ) AS ranked_meta
      WHERE row_rank = 1
    $view$;
  ELSE
    EXECUTE $view$
      CREATE OR REPLACE VIEW ads_sync_reporting.ads_ad_daily AS
      SELECT
        NULL::text AS platform,
        NULL::text AS account_id,
        NULL::text AS account_name,
        NULL::date AS date_day,
        NULL::text AS campaign_id,
        NULL::text AS campaign_name,
        NULL::text AS group_id,
        NULL::text AS group_name,
        NULL::text AS ad_id,
        NULL::text AS ad_name,
        NULL::text AS ad_status,
        NULL::numeric AS impressions,
        NULL::numeric AS reach,
        NULL::numeric AS frequency,
        NULL::numeric AS clicks,
        NULL::numeric AS ctr,
        NULL::numeric AS cpc,
        NULL::numeric AS cpm,
        NULL::numeric AS spend,
        NULL::numeric AS unique_clicks,
        NULL::numeric AS unique_ctr,
        NULL::numeric AS inline_link_clicks,
        NULL::numeric AS inline_link_click_ctr,
        NULL::numeric AS cost_per_inline_link_click,
        NULL::jsonb AS actions,
        NULL::jsonb AS action_values,
        NULL::jsonb AS cost_per_action_type,
        NULL::jsonb AS unique_actions,
        NULL::jsonb AS cost_per_unique_action_type,
        NULL::jsonb AS outbound_clicks,
        NULL::jsonb AS outbound_clicks_ctr,
        NULL::jsonb AS cost_per_outbound_click,
        NULL::jsonb AS website_purchase_roas,
        NULL::numeric AS conversions,
        NULL::numeric AS conversions_value,
        NULL::numeric AS video_2_sec_views,
        NULL::numeric AS hook_rate,
        NULL::numeric AS thruplays,
        NULL::numeric AS video_plays,
        NULL::numeric AS video_avg_time_watched,
        NULL::numeric AS video_p25_watched,
        NULL::numeric AS video_p50_watched,
        NULL::numeric AS video_p75_watched,
        NULL::numeric AS video_p95_watched,
        NULL::numeric AS video_p100_watched,
        NULL::numeric AS cost_per_thruplay,
        NULL::numeric AS inline_post_engagement,
        NULL::text AS quality_ranking,
        NULL::text AS engagement_rate_ranking,
        NULL::text AS conversion_rate_ranking,
        NULL::text AS currency_code,
        NULL::text AS source_table,
        NULL::text AS source_generation_id,
        NULL::timestamptz AS extracted_at,
        NULL::text AS raw_record_id
      WHERE false
    $view$;
  END IF;
END $$;

DO $$
DECLARE
  image_rows_sql text := 'SELECT NULL::jsonb AS row WHERE false';
  video_rows_sql text := 'SELECT NULL::jsonb AS row WHERE false';
BEGIN
  IF to_regclass('airbyte_meta_ads_metadata.images') IS NOT NULL THEN
    image_rows_sql := 'SELECT to_jsonb(i) AS row FROM airbyte_meta_ads_metadata.images AS i';
  END IF;

  IF to_regclass('airbyte_meta_ads_metadata.videos') IS NOT NULL THEN
    video_rows_sql := 'SELECT to_jsonb(v) AS row FROM airbyte_meta_ads_metadata.videos AS v';
  END IF;

  IF to_regclass('airbyte_meta_ads_metadata.ads') IS NOT NULL
    AND to_regclass('airbyte_meta_ads_metadata.ad_creatives') IS NOT NULL THEN
    EXECUTE format($view$
      CREATE OR REPLACE VIEW ads_sync_reporting.meta_ad_creative_context AS
      WITH ad_rows AS (
        SELECT to_jsonb(a) AS row
        FROM airbyte_meta_ads_metadata.ads AS a
      ),
      ad_normalized AS (
        SELECT
          row ->> 'account_id' AS account_id,
          row ->> 'campaign_id' AS campaign_id,
          row ->> 'adset_id' AS group_id,
          row ->> 'id' AS ad_id,
          row ->> 'name' AS ad_name,
          row ->> 'status' AS ad_status,
          row ->> 'effective_status' AS effective_ad_status,
          row ->> 'configured_status' AS configured_ad_status,
          COALESCE(
            row #>> '{creative,id}',
            row #>> '{creative,creative_id}',
            row ->> 'creative_id',
            row ->> 'ad_creative_id'
          ) AS creative_id,
          row ->> 'preview_shareable_link' AS ad_preview_url,
          row ->> '_airbyte_generation_id' AS ad_source_generation_id,
          NULLIF(row ->> '_airbyte_extracted_at', '')::timestamptz AS ad_extracted_at,
          row ->> '_airbyte_raw_id' AS ad_raw_record_id
        FROM ad_rows
      ),
      latest_ads AS (
        SELECT *
        FROM (
          SELECT
            ad_normalized.*,
            row_number() OVER (
              PARTITION BY ad_id
              ORDER BY ad_extracted_at DESC NULLS LAST, ad_raw_record_id DESC NULLS LAST
            ) AS row_rank
          FROM ad_normalized
        ) AS ranked_ads
        WHERE row_rank = 1
      ),
      creative_rows AS (
        SELECT to_jsonb(c) AS row
        FROM airbyte_meta_ads_metadata.ad_creatives AS c
      ),
      creative_normalized AS (
        SELECT
          row ->> 'account_id' AS account_id,
          row ->> 'id' AS creative_id,
          row ->> 'name' AS creative_name,
          row ->> 'status' AS creative_status,
          row ->> 'actor_id' AS actor_id,
          row ->> 'object_story_id' AS object_story_id,
          row ->> 'effective_object_story_id' AS effective_object_story_id,
          row ->> 'object_url' AS object_url,
          row ->> 'instagram_permalink_url' AS instagram_permalink_url,
          row ->> 'body' AS creative_body,
          row ->> 'title' AS creative_title,
          row ->> 'link_url' AS creative_link_url,
          row ->> 'thumbnail_url' AS thumbnail_url,
          row ->> 'image_url' AS image_url,
          COALESCE(
            row ->> 'image_hash',
            row #>> '{object_story_spec,link_data,image_hash}',
            row #>> '{asset_feed_spec,images,0,hash}'
          ) AS image_hash,
          COALESCE(
            row ->> 'video_id',
            row #>> '{object_story_spec,video_data,video_id}',
            row #>> '{asset_feed_spec,videos,0,video_id}'
          ) AS creative_video_id,
          row ->> 'call_to_action_type' AS creative_call_to_action_type,
          row -> 'object_story_spec' AS object_story_spec,
          row -> 'asset_feed_spec' AS asset_feed_spec,
          row ->> '_airbyte_generation_id' AS creative_source_generation_id,
          NULLIF(row ->> '_airbyte_extracted_at', '')::timestamptz AS creative_extracted_at,
          row ->> '_airbyte_raw_id' AS creative_raw_record_id
        FROM creative_rows
      ),
      latest_creatives AS (
        SELECT *
        FROM (
          SELECT
            creative_normalized.*,
            row_number() OVER (
              PARTITION BY creative_id
              ORDER BY creative_extracted_at DESC NULLS LAST, creative_raw_record_id DESC NULLS LAST
            ) AS row_rank
          FROM creative_normalized
        ) AS ranked_creatives
        WHERE row_rank = 1
      ),
      image_rows AS (
        %s
      ),
      image_normalized AS (
        SELECT
          row ->> 'hash' AS image_hash,
          COALESCE(row ->> 'url', row ->> 'url_128', row ->> 'permalink_url') AS image_url,
          NULLIF(row ->> '_airbyte_extracted_at', '')::timestamptz AS image_extracted_at,
          row ->> '_airbyte_raw_id' AS image_raw_record_id
        FROM image_rows
      ),
      latest_images AS (
        SELECT *
        FROM (
          SELECT
            image_normalized.*,
            row_number() OVER (
              PARTITION BY image_hash
              ORDER BY image_extracted_at DESC NULLS LAST, image_raw_record_id DESC NULLS LAST
            ) AS row_rank
          FROM image_normalized
        ) AS ranked_images
        WHERE row_rank = 1
      ),
      video_rows AS (
        %s
      ),
      video_normalized AS (
        SELECT
          row ->> 'id' AS video_id,
          row ->> 'permalink_url' AS video_permalink_url,
          COALESCE(
            row ->> 'picture',
            row #>> '{thumbnails,0,uri}',
            row #>> '{format,0,picture}'
          ) AS video_thumbnail_url,
          NULLIF(row ->> '_airbyte_extracted_at', '')::timestamptz AS video_extracted_at,
          row ->> '_airbyte_raw_id' AS video_raw_record_id
        FROM video_rows
      ),
      latest_videos AS (
        SELECT *
        FROM (
          SELECT
            video_normalized.*,
            row_number() OVER (
              PARTITION BY video_id
              ORDER BY video_extracted_at DESC NULLS LAST, video_raw_record_id DESC NULLS LAST
            ) AS row_rank
          FROM video_normalized
        ) AS ranked_videos
        WHERE row_rank = 1
      )
      SELECT
        'meta_ads'::text AS platform,
        latest_ads.account_id,
        latest_ads.campaign_id,
        latest_ads.group_id,
        latest_ads.ad_id,
        latest_ads.ad_name,
        latest_ads.ad_status,
        latest_ads.effective_ad_status,
        latest_ads.configured_ad_status,
        latest_ads.creative_id,
        latest_creatives.creative_name,
        latest_creatives.creative_status,
        COALESCE(
          latest_creatives.actor_id,
          NULLIF(
            split_part(
              COALESCE(
                latest_creatives.effective_object_story_id,
                latest_creatives.object_story_id
              ),
              '_',
              1
            ),
            ''
          )
        ) AS page_id,
        latest_creatives.object_story_id,
        latest_creatives.effective_object_story_id,
        COALESCE(
          latest_creatives.effective_object_story_id,
          latest_creatives.object_story_id
        ) AS post_id,
        COALESCE(
          latest_creatives.instagram_permalink_url,
          latest_creatives.object_url
        ) AS post_permalink_url,
        latest_ads.ad_preview_url,
        latest_creatives.creative_body,
        latest_creatives.creative_title,
        latest_creatives.creative_link_url,
        COALESCE(
          latest_creatives.thumbnail_url,
          latest_creatives.image_url,
          latest_images.image_url,
          latest_videos.video_thumbnail_url
        ) AS creative_thumbnail_url,
        latest_creatives.creative_call_to_action_type,
        latest_creatives.creative_video_id,
        latest_creatives.image_hash,
        COALESCE(latest_creatives.image_url, latest_images.image_url) AS image_url,
        latest_videos.video_id,
        latest_videos.video_permalink_url,
        latest_videos.video_thumbnail_url,
        latest_creatives.object_story_spec,
        latest_creatives.asset_feed_spec,
        latest_ads.ad_source_generation_id,
        latest_creatives.creative_source_generation_id,
        latest_ads.ad_extracted_at,
        latest_creatives.creative_extracted_at,
        GREATEST(
          latest_ads.ad_extracted_at,
          latest_creatives.creative_extracted_at
        ) AS extracted_at,
        latest_ads.ad_raw_record_id,
        latest_creatives.creative_raw_record_id,
        ARRAY[
          'airbyte_meta_ads_metadata.ads',
          'airbyte_meta_ads_metadata.ad_creatives'
        ]::text[] AS source_tables
      FROM latest_ads
      LEFT JOIN latest_creatives
        ON latest_creatives.creative_id = latest_ads.creative_id
        AND (
          latest_creatives.account_id = latest_ads.account_id
          OR latest_creatives.account_id IS NULL
          OR latest_ads.account_id IS NULL
        )
      LEFT JOIN latest_images
        ON latest_images.image_hash = latest_creatives.image_hash
      LEFT JOIN latest_videos
        ON latest_videos.video_id = latest_creatives.creative_video_id
    $view$, image_rows_sql, video_rows_sql);
  ELSE
    EXECUTE $view$
      CREATE OR REPLACE VIEW ads_sync_reporting.meta_ad_creative_context AS
      SELECT
        NULL::text AS platform,
        NULL::text AS account_id,
        NULL::text AS campaign_id,
        NULL::text AS group_id,
        NULL::text AS ad_id,
        NULL::text AS ad_name,
        NULL::text AS ad_status,
        NULL::text AS effective_ad_status,
        NULL::text AS configured_ad_status,
        NULL::text AS creative_id,
        NULL::text AS creative_name,
        NULL::text AS creative_status,
        NULL::text AS page_id,
        NULL::text AS object_story_id,
        NULL::text AS effective_object_story_id,
        NULL::text AS post_id,
        NULL::text AS post_permalink_url,
        NULL::text AS ad_preview_url,
        NULL::text AS creative_body,
        NULL::text AS creative_title,
        NULL::text AS creative_link_url,
        NULL::text AS creative_thumbnail_url,
        NULL::text AS creative_call_to_action_type,
        NULL::text AS creative_video_id,
        NULL::text AS image_hash,
        NULL::text AS image_url,
        NULL::text AS video_id,
        NULL::text AS video_permalink_url,
        NULL::text AS video_thumbnail_url,
        NULL::jsonb AS object_story_spec,
        NULL::jsonb AS asset_feed_spec,
        NULL::text AS ad_source_generation_id,
        NULL::text AS creative_source_generation_id,
        NULL::timestamptz AS ad_extracted_at,
        NULL::timestamptz AS creative_extracted_at,
        NULL::timestamptz AS extracted_at,
        NULL::text AS ad_raw_record_id,
        NULL::text AS creative_raw_record_id,
        NULL::text[] AS source_tables
      WHERE false
    $view$;
  END IF;
END $$;
`;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function redactSensitiveConfigValues(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveConfigValues(item));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) =>
      isSensitiveConfigKey(key)
        ? []
        : [[key, redactSensitiveConfigValues(item)] as const]
    )
  );
}

function isSensitiveConfigKey(key: string) {
  const normalized = key.toLowerCase();
  return (
    normalized === "credentials" ||
    normalized === "access_token" ||
    normalized === "refresh_token" ||
    normalized === "client_secret" ||
    normalized === "client_id" ||
    normalized === "developer_token" ||
    normalized === "password" ||
    normalized.endsWith("_secret") ||
    normalized.endsWith("_token")
  );
}

function stringValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return String(value);
}

function numberValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function integerValue(value: unknown) {
  const parsed = numberValue(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

function microsToUnits(value: unknown) {
  const parsed = numberValue(value);
  return parsed === null ? null : parsed / 1_000_000;
}

function actionSum(value: unknown, actionTypes: string[]) {
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
