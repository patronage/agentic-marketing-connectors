/** Graph API version used when a caller does not provide an override. */
export const DEFAULT_META_GRAPH_API_VERSION = "v25.0";

export interface MetaGraphApiVersionPolicy {
  defaultVersion: string;
  overrideBehavior: "provider-visible";
  reviewCadence: "before-each-public-release";
}

export const META_GRAPH_API_VERSION_POLICY: MetaGraphApiVersionPolicy = {
  defaultVersion: DEFAULT_META_GRAPH_API_VERSION,
  overrideBehavior: "provider-visible",
  reviewCadence: "before-each-public-release",
} as const;
