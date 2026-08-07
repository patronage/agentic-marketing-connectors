import {
  adsSyncCanaryRequestSha256,
  artifactKeys,
  parseAdsSyncCanaryRequest,
  supportedProviderDefinitions,
} from "@patronage/ads-sync";

export async function prepareBoundedRun() {
  const canary = parseAdsSyncCanaryRequest({
    connectionId: "meta_ads_performance",
    provider: "meta_ads",
    windowEnd: "2026-05-02T00:00:00.000Z",
    windowStart: "2026-05-01T00:00:00.000Z",
  });
  const runId = "tutorial-run";

  return {
    artifactKeys: artifactKeys({
      provider: canary.provider,
      runId,
      streamName: "customcampaign_daily_performance",
    }),
    backfillPolicy:
      supportedProviderDefinitions[canary.provider].backfillPolicy,
    canary: {
      connectionId: canary.connectionId,
      requestSha256: await adsSyncCanaryRequestSha256(canary),
      windowEnd: canary.windowEnd.toISOString(),
      windowStart: canary.windowStart.toISOString(),
    },
  };
}

console.log(JSON.stringify(await prepareBoundedRun(), null, 2));
