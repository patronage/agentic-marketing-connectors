import Anthropic from "@anthropic-ai/sdk";

import { ANTHROPIC_BETA, resolveAnthropicBaseURL } from "./anthropic";
import { getIsolateRunner } from "./runner";

const TOLERANCE_SECONDS = 300;
const MAX_DRAIN = 25;

export interface DrainResult {
  created: boolean;
  sessionId: string;
  workId: string;
}

export async function handleWebhook(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const webhookId = request.headers.get("webhook-id");
  const webhookTimestamp = request.headers.get("webhook-timestamp");
  const signature = request.headers.get("webhook-signature");

  if (!webhookId || !webhookTimestamp || !signature) {
    return Response.json(
      { error: "missing webhook signature" },
      { status: 401 }
    );
  }

  const rawBody = await request.arrayBuffer();
  const valid = await verifyStandardWebhook(
    signature,
    webhookId,
    webhookTimestamp,
    rawBody,
    env.WEBHOOK_SECRET
  );

  if (!valid) {
    return Response.json(
      { error: "invalid webhook signature" },
      { status: 401 }
    );
  }

  let eventType = "unknown";
  try {
    const event = JSON.parse(new TextDecoder().decode(rawBody)) as {
      type?: string;
    };
    eventType = event.type ?? eventType;
  } catch {
    return Response.json({ error: "invalid webhook JSON" }, { status: 400 });
  }

  ctx.waitUntil(
    (async () => {
      try {
        const results = await drainWork(env);
        console.log(
          `[webhook] ${eventType} drained ${results.length} work item(s)`
        );
      } catch (error) {
        console.error(
          `[webhook] drain failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })()
  );

  return Response.json({ accepted: true });
}

export async function drainWork(env: Env): Promise<DrainResult[]> {
  const baseURL = resolveAnthropicBaseURL(env);
  const client = bearerClient(env, env.ANTHROPIC_ENVIRONMENT_KEY);
  const spawned: DrainResult[] = [];

  for (let i = 0; i < MAX_DRAIN; i += 1) {
    const work = await client.beta.environments.work.poll(env.ENVIRONMENT_ID, {
      reclaim_older_than_ms: 2000,
      betas: [ANTHROPIC_BETA],
    });

    if (!work) {
      break;
    }

    if (work.data.type !== "session") {
      continue;
    }

    const sessionId = work.data.id;
    const runner = getIsolateRunner(env, sessionId);
    const wasLive = await runner.isLive();

    if (!wasLive) {
      await runner.start({
        baseURL,
        environmentId: env.ENVIRONMENT_ID,
        sessionId,
        workId: work.id,
      });
    }

    spawned.push({
      created: !wasLive,
      sessionId,
      workId: work.id,
    });
  }

  return spawned;
}

function bearerClient(env: Env, token: string): Anthropic {
  if (!token) {
    throw new Error("ANTHROPIC_ENVIRONMENT_KEY is required");
  }

  return new Anthropic({
    apiKey: null,
    authToken: token,
    baseURL: resolveAnthropicBaseURL(env),
  });
}

async function verifyStandardWebhook(
  signatureHeader: string,
  webhookId: string,
  webhookTimestamp: string,
  rawBody: ArrayBuffer,
  secret: string
): Promise<boolean> {
  if (!secret) {
    return false;
  }

  const timestamp = Number.parseInt(webhookTimestamp, 10);
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  if (Math.abs(Date.now() / 1000 - timestamp) > TOLERANCE_SECONDS) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    decodeWebhookSecret(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const bodyBytes = new Uint8Array(rawBody);
  const prefix = new TextEncoder().encode(`${webhookId}.${webhookTimestamp}.`);
  const signedPayload = new Uint8Array(prefix.length + bodyBytes.length);
  signedPayload.set(prefix);
  signedPayload.set(bodyBytes, prefix.length);

  const mac = await crypto.subtle.sign("HMAC", key, signedPayload);
  const expected = bytesToBase64(new Uint8Array(mac));

  return signatureHeader.split(" ").some((signature) => {
    const [version, value] = signature.split(",", 2);
    return (
      version === "v1" && Boolean(value) && constantTimeEq(value, expected)
    );
  });
}

function decodeWebhookSecret(secret: string): Uint8Array {
  if (secret.startsWith("whsec_")) {
    return base64ToBytes(secret.slice("whsec_".length));
  }

  try {
    return base64ToBytes(secret);
  } catch {
    return new TextEncoder().encode(secret);
  }
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.codePointAt(i) ?? 0;
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary);
}

function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= (a.codePointAt(i) ?? 0) ^ (b.codePointAt(i) ?? 0);
  }
  return diff === 0;
}
