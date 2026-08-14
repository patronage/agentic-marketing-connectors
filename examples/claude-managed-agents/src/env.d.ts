import type { IsolateRunner } from "./runner";

declare global {
  interface Env {
    ENVIRONMENT_ID: string;
    ANTHROPIC_ENVIRONMENT_KEY: string;
    WEBHOOK_SECRET: string;
    ANTHROPIC_BASE_URL?: string;
    OPTIMIZATION_PLAN_BUCKET?: R2Bucket;
    IsolateRunner: DurableObjectNamespace<IsolateRunner>;
  }
}
