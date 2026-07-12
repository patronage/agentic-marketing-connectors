import { z } from "zod";

import {
  defaultConnectionId,
  defaultSyncConnectionDefinition,
  configuredCatalogForSelectedStreams,
  providerDefinitions,
} from "./core.js";
import type { AdsSyncProvider, SyncConnectionDefinition } from "./core.js";

const providerIdSchema = z.enum(["google_ads", "meta_ads"]);

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

export const supportedProviderDefinitions = {
  google_ads: defineProvider({
    backfillPolicy: {
      maxWindowsPerRun: 8,
      windowStepDays: 7,
    },
    defaultAirbyteSchema: providerDefinitions.google_ads.defaultAirbyteSchema,
    displayName: providerDefinitions.google_ads.displayName,
    id: "google_ads",
    rateLimitPolicy: {},
    reportingViews: ["ads_sync_reporting.ads_campaign_daily"],
    sourceImage: "airbyte/source-google-ads:4.2.5",
  }),
  meta_ads: defineProvider({
    backfillPolicy: {
      maxWindowsPerRun: 4,
      windowStepDays: 3,
    },
    defaultAirbyteSchema: providerDefinitions.meta_ads.defaultAirbyteSchema,
    displayName: providerDefinitions.meta_ads.displayName,
    id: "meta_ads",
    rateLimitPolicy: {
      cooldownSeconds: 60 * 60,
      stopOnCode: 17,
    },
    reportingViews: [
      "ads_sync_reporting.ads_campaign_daily",
      "ads_sync_reporting.ads_group_daily",
      "ads_sync_reporting.ads_ad_daily",
      "ads_sync_reporting.meta_ad_creative_context",
    ],
    sourceImage: "airbyte/source-facebook-marketing:5.2.11",
  }),
} as const satisfies Record<AdsSyncProvider, SupportedProviderDefinition>;

export const supportedImageVersions = {
  destination: "airbyte/destination-postgres:3.0.13",
  google_ads: supportedProviderDefinitions.google_ads.sourceImage,
  meta_ads: supportedProviderDefinitions.meta_ads.sourceImage,
} as const;
