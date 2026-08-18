import { z } from "zod";

import {
  defaultConnectionId,
  defaultSyncConnectionDefinition,
  configuredCatalogForSelectedStreams,
} from "./core.js";
import type { SyncConnectionDefinition } from "./core.js";
import { googleAdsProvider } from "./google-ads.js";
import { googleSearchConsoleProvider } from "./google-search-console.js";
import { metaAdsProvider } from "./meta-ads.js";
import type {
  AdsSyncProvider,
  AdsSyncProviderModule,
} from "./provider-contract.js";
import { providerDefinitions } from "./providers.js";

const providerIdSchema = z.enum([
  "google_ads",
  "google_search_console",
  "meta_ads",
]);

export const adsSyncConnectionConfigSchema = z.object({
  catalog: z.unknown(),
  catalogRef: z.string().min(1).optional(),
  connectionId: z.string().min(1).optional(),
  displayName: z.string().min(1).optional(),
  destinationSchema: z.string().min(1).optional(),
  provider: providerIdSchema,
  reportingEnabled: z.boolean().default(true),
  scheduleCron: z.null().default(null),
  scheduleEveryMinutes: z
    .number()
    .int()
    .positive()
    .nullable()
    .default(6 * 60),
  selectedStreams: z.array(z.string().min(1)).optional(),
  sourceConfigSecret: z.string().min(1),
  stateSecret: z.string().min(1).optional(),
  streamGroup: z.string().min(1).optional(),
  streamName: z.string().min(1).optional(),
});

export const adsSyncConfigSchema = z.object({
  connections: z.array(adsSyncConnectionConfigSchema).min(1),
});

export type AdsSyncConnectionConfig = z.infer<
  typeof adsSyncConnectionConfigSchema
>;
export type AdsSyncConfig = z.infer<typeof adsSyncConfigSchema>;
export type AdsSyncConfigInput = z.input<typeof adsSyncConfigSchema>;

export function defineAdsSyncConfig(config: AdsSyncConfigInput): AdsSyncConfig {
  return adsSyncConfigSchema.parse(config);
}

export function adsSyncConnectionsForProviders(
  config: AdsSyncConfig,
  providers?: AdsSyncProvider[]
) {
  const requested = providers ? new Set(providers) : null;
  return config.connections.filter(
    (connection) => !requested || requested.has(connection.provider)
  );
}

export async function syncConnectionDefinitionFromConfig(
  connectionConfig: AdsSyncConnectionConfig,
  sourceConfig: unknown
): Promise<SyncConnectionDefinition> {
  const providerDefinition = providerDefinitions[connectionConfig.provider];
  const catalog = configuredCatalogForSelectedStreams(
    connectionConfig.catalog,
    connectionConfig.selectedStreams
  );
  const connection = await defaultSyncConnectionDefinition({
    catalog,
    provider: connectionConfig.provider,
    sourceConfig,
  });

  return {
    ...connection,
    airbyteSchema:
      connectionConfig.destinationSchema ?? connection.airbyteSchema,
    catalogConfigRef:
      connectionConfig.catalogRef ??
      `ads-sync.config.ts#${connectionConfig.connectionId ?? defaultConnectionId(connectionConfig.provider)}.catalog`,
    connectionId:
      connectionConfig.connectionId ??
      defaultConnectionId(connectionConfig.provider),
    displayName:
      connectionConfig.displayName ??
      `${providerDefinition.displayName} ${connectionConfig.streamGroup ?? "default"}`,
    reportingEnabled: connectionConfig.reportingEnabled,
    scheduleCron: connectionConfig.scheduleCron,
    scheduleEveryMinutes: connectionConfig.scheduleEveryMinutes,
    selectedStreams:
      connectionConfig.selectedStreams ?? connection.selectedStreams,
    sourceConfigRef: connectionConfig.sourceConfigSecret,
    stateConfigRef:
      connectionConfig.stateSecret ?? providerDefinition.stateSecret,
    streamGroup: connectionConfig.streamGroup ?? connection.streamGroup,
    streamName: connectionConfig.streamName ?? connection.streamName,
  };
}

export interface SupportedProviderDefinition {
  backfillPolicy: {
    maxWindowsPerRun: number;
    windowStepDays: number;
  };
  defaultAirbyteSchema: string;
  displayName: string;
  id: string;
  rateLimitPolicy: {
    cooldownSeconds?: number;
    stopOnCode?: number;
  };
  reportingViews: readonly string[];
  sourceImage: string;
}

export function defineProvider<TDefinition extends SupportedProviderDefinition>(
  definition: TDefinition
) {
  return definition;
}

function supportedProviderDefinition(
  module: AdsSyncProviderModule
): SupportedProviderDefinition {
  return {
    backfillPolicy: module.backfillPolicy,
    defaultAirbyteSchema: module.defaultAirbyteSchema,
    displayName: module.displayName,
    id: module.id,
    rateLimitPolicy: module.rateLimitPolicy,
    reportingViews: module.reportingViews,
    sourceImage: module.sourceImage,
  };
}

export const supportedProviderDefinitions = {
  google_ads: defineProvider(supportedProviderDefinition(googleAdsProvider)),
  google_search_console: defineProvider(
    supportedProviderDefinition(googleSearchConsoleProvider)
  ),
  meta_ads: defineProvider(supportedProviderDefinition(metaAdsProvider)),
} as const satisfies Record<AdsSyncProvider, SupportedProviderDefinition>;

export const supportedImageVersions = {
  destination:
    "airbyte/destination-postgres:3.0.13@sha256:0b310bd46ba0e006757ea3dc1d3b8ef8e3bcf51c3a96f5460a836653b5ac4f4c",
  google_ads: supportedProviderDefinitions.google_ads.sourceImage,
  google_search_console:
    supportedProviderDefinitions.google_search_console.sourceImage,
  meta_ads: supportedProviderDefinitions.meta_ads.sourceImage,
} as const;
