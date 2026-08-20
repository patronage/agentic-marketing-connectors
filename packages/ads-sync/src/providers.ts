/**
 * Provider registry for Ads Sync. The registry maps each supported provider
 * id to its package-owned provider module and hosts the provider-neutral
 * dispatch helpers that callers use with a provider id.
 */
import { googleAdsProvider } from "./google-ads.js";
import { googleSearchConsoleProvider } from "./google-search-console.js";
import { metaAdsProvider } from "./meta-ads.js";
import { catalogDriftIssues, isRecord } from "./provider-contract.js";
import type {
  AccessTokenSourceConfigInput,
  AdsSyncProvider,
  AdsSyncProviderModule,
  CampaignDailyRecord,
  CatalogDriftIssue,
  ConfiguredCatalog,
  SourceReportingWindow,
} from "./provider-contract.js";

export type {
  AccessTokenSourceConfigInput,
  ConfiguredCatalog,
  ConfiguredCatalogStream,
} from "./provider-contract.js";

export const providerModules = {
  google_ads: googleAdsProvider,
  google_search_console: googleSearchConsoleProvider,
  meta_ads: metaAdsProvider,
} as const satisfies Record<AdsSyncProvider, AdsSyncProviderModule>;

export function providerModule(
  provider: AdsSyncProvider
): AdsSyncProviderModule {
  return providerModules[provider];
}

export const supportedProviders = Object.keys(
  providerModules
) as AdsSyncProvider[];

export function isAdsSyncProvider(value: unknown): value is AdsSyncProvider {
  return typeof value === "string" && Object.hasOwn(providerModules, value);
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

export interface ProviderDefinition {
  defaultAirbyteSchema: string;
  displayName: string;
  sourceConfigSecret: string;
  stateSecret: string;
  streamName: string;
}

function providerDefinition(module: AdsSyncProviderModule): ProviderDefinition {
  return {
    defaultAirbyteSchema: module.defaultAirbyteSchema,
    displayName: module.displayName,
    sourceConfigSecret: module.sourceConfigSecret,
    stateSecret: module.stateSecret,
    streamName: module.streamName,
  };
}

export const providerDefinitions = {
  google_ads: providerDefinition(googleAdsProvider),
  google_search_console: providerDefinition(googleSearchConsoleProvider),
  meta_ads: providerDefinition(metaAdsProvider),
} satisfies Record<AdsSyncProvider, ProviderDefinition>;

export function sourceConfigForReporting(
  provider: AdsSyncProvider,
  sourceConfig: unknown,
  catalog: unknown,
  options: SourceReportingWindow = {}
) {
  if (!isRecord(sourceConfig)) {
    return sourceConfig;
  }

  const cloned = structuredClone(sourceConfig);
  if (!isRecord(cloned)) {
    return sourceConfig;
  }

  return providerModules[provider].sourceConfigForReporting(
    cloned,
    catalog,
    options
  );
}

/** Returns the fully configured catalog the provider module ships. */
export function configuredCatalogForProvider(
  provider: AdsSyncProvider
): ConfiguredCatalog {
  return providerModules[provider].configuredCatalog;
}

/** Providers whose module ships an access-token-only source-config builder. */
export type AccessTokenSourceConfigProvider = {
  [P in AdsSyncProvider]: (typeof providerModules)[P] extends {
    accessTokenSourceConfig: (
      input: AccessTokenSourceConfigInput
    ) => Record<string, unknown>;
  }
    ? P
    : never;
}[AdsSyncProvider];

export const accessTokenSourceConfigProviders = supportedProviders.filter(
  (provider): provider is AccessTokenSourceConfigProvider =>
    typeof providerModule(provider).accessTokenSourceConfig === "function"
);

/**
 * Builds the access-token-only source configuration for one provider.
 * Throws for a provider whose pinned source image requires OAuth refresh-token
 * credentials, so the caller never ships a config the image rejects.
 */
export function accessTokenSourceConfigForProvider(
  provider: AccessTokenSourceConfigProvider,
  input: AccessTokenSourceConfigInput
): Record<string, unknown> {
  const build = providerModule(provider).accessTokenSourceConfig;
  if (!build) {
    throw new Error(
      `${provider} has no access-token-only source config; supported providers: ${accessTokenSourceConfigProviders.join(", ")}`
    );
  }
  return build(input);
}

export function normalizeCampaignDailyRecord(
  provider: AdsSyncProvider,
  record: Record<string, unknown>
): CampaignDailyRecord {
  return providerModules[provider].normalizeCampaignDailyRecord(record);
}

export function validateCatalogForReporting(
  provider: AdsSyncProvider,
  catalog: unknown,
  options: { selectedStreams?: readonly string[] } = {}
): CatalogDriftIssue[] {
  return catalogDriftIssues(
    providerModules[provider].reportingStreamRequirements,
    catalog,
    options
  );
}
