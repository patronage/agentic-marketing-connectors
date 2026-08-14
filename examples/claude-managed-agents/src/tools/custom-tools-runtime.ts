import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import { z } from "zod";

export interface CustomToolContext {
  env: Env;
}

export interface CustomTool<TSchema extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  inputSchema: TSchema;
  requires?: (env: Env) => boolean;
  run: (
    input: z.output<TSchema>,
    context: CustomToolContext
  ) => Promise<string> | string;
}

export function defineTool<TSchema extends z.ZodType>(
  definition: CustomTool<TSchema>
): CustomTool<TSchema> {
  return definition;
}

export function isCustomToolEnabled(tool: CustomTool, env: Env): boolean {
  if (!tool.requires) {
    return true;
  }

  try {
    return tool.requires(env);
  } catch (error) {
    console.warn(
      `[custom-tools] requires() for "${tool.name}" failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}

export function customToolToBetaRunnable(
  tool: CustomTool,
  env: Env
): BetaRunnableTool {
  return betaZodTool({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    run: async (input) => {
      try {
        return await tool.run(input, { env });
      } catch (error) {
        return `error: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
  });
}

export function customToolAgentDefinition(tool: CustomTool): {
  type: "custom";
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
} {
  const raw = z.toJSONSchema(tool.inputSchema, { reused: "inline" }) as {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };

  if (raw.type !== "object") {
    throw new Error(
      `Custom tool "${tool.name}" must use a z.object(...) input schema.`
    );
  }

  return {
    type: "custom",
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: "object",
      properties: sanitizeJsonSchemaForAnthropic(
        raw.properties ?? {}
      ) as Record<string, unknown>,
      ...(raw.required && raw.required.length > 0
        ? { required: raw.required }
        : {}),
    },
  };
}

const RE2_INCOMPATIBLE_PATTERN_FEATURES = /\(\?<?[=!]|\\\d/;

function sanitizeJsonSchemaForAnthropic(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(sanitizeJsonSchemaForAnthropic);
  }

  if (!node || typeof node !== "object") {
    return node;
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (
      key === "pattern" &&
      typeof value === "string" &&
      RE2_INCOMPATIBLE_PATTERN_FEATURES.test(value)
    ) {
      continue;
    }

    out[key] = sanitizeJsonSchemaForAnthropic(value);
  }

  return out;
}
