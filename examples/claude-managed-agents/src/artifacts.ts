const OPTIMIZATION_PLAN_TOOL_NAME =
  "patronage_google_ads_negative_keyword_optimizer";

export async function writeOptimizationPlanArtifact(options: {
  env: Env;
  result: unknown;
  sessionId: string;
  toolName: string;
}): Promise<string | null> {
  if (
    options.toolName !== OPTIMIZATION_PLAN_TOOL_NAME ||
    !options.env.OPTIMIZATION_PLAN_BUCKET
  ) {
    return null;
  }

  const body = normalizeJson(options.result);
  if (!body) {
    return null;
  }

  const key = `runs/${options.sessionId}/optimization-plan.json`;
  await options.env.OPTIMIZATION_PLAN_BUCKET.put(key, body, {
    customMetadata: {
      sessionId: options.sessionId,
      toolName: options.toolName,
    },
    httpMetadata: {
      contentType: "application/json; charset=utf-8",
    },
  });

  return key;
}

function normalizeJson(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  try {
    return `${JSON.stringify(JSON.parse(value), null, 2)}\n`;
  } catch {
    return null;
  }
}
