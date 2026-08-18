import type { AdsSyncProvider } from "./provider-contract.js";
import { isAdsSyncProvider } from "./providers.js";

const MAX_CANARY_WINDOW_MS = 24 * 60 * 60 * 1000;
const CANARY_KEYS = [
  "connectionId",
  "provider",
  "windowEnd",
  "windowStart",
] as const;

export interface AdsSyncCanaryRequest {
  connectionId: string;
  provider: AdsSyncProvider;
  windowEnd: Date;
  windowStart: Date;
}

export const canonicalAdsSyncCanaryRequest = (
  request: AdsSyncCanaryRequest
) => ({
  connectionId: request.connectionId,
  provider: request.provider,
  windowEnd: request.windowEnd.toISOString(),
  windowStart: request.windowStart.toISOString(),
});

export const adsSyncCanaryRequestSha256 = async (
  request: AdsSyncCanaryRequest
) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify(canonicalAdsSyncCanaryRequest(request))
    )
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const parseAdsSyncCanaryRequest = (
  value: unknown
): AdsSyncCanaryRequest => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Ads Sync canary request must be one JSON object.");
  }
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body).toSorted();
  if (keys.join("\n") !== [...CANARY_KEYS].toSorted().join("\n")) {
    throw new Error(
      "Ads Sync canary accepts only connectionId, provider, windowStart, and windowEnd."
    );
  }
  if (
    typeof body.connectionId !== "string" ||
    !/^[a-z][a-z0-9_]{2,63}$/u.test(body.connectionId)
  ) {
    throw new Error("Ads Sync canary requires one exact connectionId.");
  }
  if (!isAdsSyncProvider(body.provider)) {
    throw new Error("Ads Sync canary requires one exact supported provider.");
  }
  if (
    typeof body.windowStart !== "string" ||
    typeof body.windowEnd !== "string"
  ) {
    throw new TypeError(
      "Ads Sync canary requires ISO windowStart and windowEnd."
    );
  }
  const windowStart = new Date(body.windowStart);
  const windowEnd = new Date(body.windowEnd);
  const duration = windowEnd.getTime() - windowStart.getTime();
  if (
    Number.isNaN(windowStart.getTime()) ||
    Number.isNaN(windowEnd.getTime()) ||
    duration <= 0 ||
    duration > MAX_CANARY_WINDOW_MS
  ) {
    throw new Error(
      "Ads Sync canary window must be positive and no longer than 24 hours."
    );
  }
  return {
    connectionId: body.connectionId,
    provider: body.provider,
    windowEnd,
    windowStart,
  };
};
