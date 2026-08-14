export const ANTHROPIC_DEFAULT_BASE_URL = "https://api.anthropic.com";
export const ANTHROPIC_BETA = "managed-agents-2026-04-01";

export function resolveAnthropicBaseURL(env: Env): string {
  return env.ANTHROPIC_BASE_URL || ANTHROPIC_DEFAULT_BASE_URL;
}
