import { IsolateRunner } from "./runner";
import { CUSTOM_TOOLS } from "./tools/custom-tools";
import {
  customToolAgentDefinition,
  isCustomToolEnabled,
} from "./tools/custom-tools-runtime";
import { handleWebhook } from "./webhooks";

export { IsolateRunner };

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/webhooks" && request.method === "POST") {
      return handleWebhook(request, env, ctx);
    }

    if (url.pathname === "/health" && request.method === "GET") {
      const missing = requiredSecrets.filter((name) => !env[name]).map(String);

      return json({
        ok: missing.length === 0,
        missing,
        worker: "patronage-example-claude-managed-agents",
      });
    }

    if (url.pathname === "/agent-config" && request.method === "GET") {
      const tools = CUSTOM_TOOLS.filter((tool) =>
        isCustomToolEnabled(tool, env)
      ).map(customToolAgentDefinition);

      return json({
        system:
          "Use the Patronage Google Ads tool to prepare validate-only optimization plans. Do not claim live campaign changes were applied unless a separate approval path has executed them.",
        tools,
      });
    }

    return json({
      endpoints: {
        agentConfig: "/agent-config",
        health: "/health",
        webhooks: "/webhooks",
      },
      name: "Patronage Claude Managed Agents Example",
    });
  },
};

const requiredSecrets = [
  "ENVIRONMENT_ID",
  "ANTHROPIC_ENVIRONMENT_KEY",
  "WEBHOOK_SECRET",
] as const;

function json(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, {
    ...init,
    headers: {
      "access-control-allow-origin": "*",
      ...init?.headers,
    },
  });
}
