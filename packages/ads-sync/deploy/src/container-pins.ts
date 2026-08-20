/**
 * Exact image and wrapper pins the Reference Deployment expects each running
 * container to report on `/metadata`, keyed by container kind, plus the
 * Durable Object binding names in `wrangler.jsonc`.
 */
import type { AdsSyncProvider } from "@patronage/ads-sync";
import { supportedImageVersions } from "@patronage/ads-sync";
import type { ContainerImagePin, ContainerKind } from "@patronage/ads-sync/run";

/** Wrapper contract version the images in `../images` report on `/metadata`. */
export const WRAPPER_VERSION = "ads-sync-wrapper-v0.3";

export const CONTAINER_BINDINGS: Readonly<
  Record<AdsSyncProvider | "destination", string>
> = {
  destination: "AIRBYTE_POSTGRES_DESTINATION",
  google_ads: "AIRBYTE_GOOGLE_ADS_SOURCE",
  google_search_console: "AIRBYTE_GOOGLE_SEARCH_CONSOLE_SOURCE",
  meta_ads: "AIRBYTE_META_ADS_SOURCE",
};

export const containerImagePins: Readonly<
  Record<ContainerKind, ContainerImagePin>
> = {
  destination: {
    connectorImage: supportedImageVersions.destination,
    wrapperVersion: WRAPPER_VERSION,
  },
  google_ads: {
    connectorImage: supportedImageVersions.google_ads,
    wrapperVersion: WRAPPER_VERSION,
  },
  google_search_console: {
    connectorImage: supportedImageVersions.google_search_console,
    wrapperVersion: WRAPPER_VERSION,
  },
  meta_ads: {
    connectorImage: supportedImageVersions.meta_ads,
    wrapperVersion: WRAPPER_VERSION,
  },
};
