import Anthropic from "@anthropic-ai/sdk";
import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import { Agent, type FiberRecoveryContext } from "agents";

import { ANTHROPIC_BETA } from "./anthropic";
import { writeOptimizationPlanArtifact } from "./artifacts";
import { runHeartbeatLoop } from "./heartbeat";
import { CUSTOM_TOOLS } from "./tools/custom-tools";
import {
  customToolToBetaRunnable,
  isCustomToolEnabled,
} from "./tools/custom-tools-runtime";

const IDLE_MS = 60_000;
const DISPATCHER_FIBER = "patronage-managed-agent-runner";

interface RunnerStartOptions {
  baseURL: string;
  environmentId: string;
  sessionId: string;
  workId: string;
}

interface RunnerState {
  baseURL: string | null;
  environmentId: string | null;
  registeredToolNames: string[];
  sessionId: string | null;
  startedAt: number | null;
  workId: string | null;
}

const EMPTY_STATE: RunnerState = {
  baseURL: null,
  environmentId: null,
  registeredToolNames: [],
  sessionId: null,
  startedAt: null,
  workId: null,
};

export class IsolateRunner extends Agent<Env, RunnerState> {
  initialState: RunnerState = EMPTY_STATE;

  private ctrl: AbortController | undefined;

  async isLive(): Promise<boolean> {
    return Boolean(this.ctrl && !this.ctrl.signal.aborted);
  }

  async start(options: RunnerStartOptions): Promise<void> {
    if (await this.isLive()) {
      console.log(
        `[runner] session=${options.sessionId} already running, skipping start`
      );
      return;
    }

    this.setState({
      ...this.state,
      ...options,
      registeredToolNames: enabledToolNames(this.env),
      startedAt: Date.now(),
    });

    await this.boot(options);
  }

  async stop(): Promise<void> {
    this.ctrl?.abort();
  }

  override async onFiberRecovered(
    context: FiberRecoveryContext
  ): Promise<void> {
    if (context.name !== DISPATCHER_FIBER) {
      return;
    }

    const { baseURL, environmentId, sessionId, workId } = this.state;
    if (!baseURL || !environmentId || !sessionId || !workId) {
      console.warn("[runner] fiber recovery skipped; state is incomplete");
      return;
    }

    await this.boot({ baseURL, environmentId, sessionId, workId });
  }

  private async boot(options: RunnerStartOptions): Promise<void> {
    this.ctrl = new AbortController();
    const { signal } = this.ctrl;
    const client = new Anthropic({
      apiKey: null,
      authToken: this.env.ANTHROPIC_ENVIRONMENT_KEY,
      baseURL: options.baseURL,
    });
    const tools = instrumentTools(buildTools(this.env), {
      env: this.env,
      sessionId: options.sessionId,
    });

    console.log(
      `[runner] starting session=${options.sessionId} work=${options.workId} tools=${tools.map((tool) => tool.name).join(",")}`
    );

    this.ctx.waitUntil(
      this.runFiber(DISPATCHER_FIBER, async () => {
        try {
          await Promise.allSettled([
            drainSessionToolRunner({
              client,
              sessionId: options.sessionId,
              signal,
              tools,
            }),
            runHeartbeatLoop({
              abort: () => this.ctrl?.abort(),
              client,
              environmentId: options.environmentId,
              logPrefix: "[runner]",
              signal,
              workId: options.workId,
            }),
          ]);
        } finally {
          this.ctrl = undefined;
          try {
            await client.beta.environments.work.stop(options.workId, {
              environment_id: options.environmentId,
              force: true,
              betas: [ANTHROPIC_BETA],
            });
          } catch (error) {
            console.warn(
              `[runner] force-stop failed session=${options.sessionId}: ${error instanceof Error ? error.message : String(error)}`
            );
          }

          this.setState({
            ...this.state,
            registeredToolNames: [],
          });
        }
      })
    );
  }
}

export function getIsolateRunner(env: Env, sessionId: string) {
  const id = env.IsolateRunner.idFromName(sessionId);
  return env.IsolateRunner.get(id) as DurableObjectStub<IsolateRunner>;
}

function buildTools(env: Env): BetaRunnableTool[] {
  return CUSTOM_TOOLS.filter((tool) => isCustomToolEnabled(tool, env)).map(
    (tool) => customToolToBetaRunnable(tool, env)
  );
}

function enabledToolNames(env: Env): string[] {
  return CUSTOM_TOOLS.filter((tool) => isCustomToolEnabled(tool, env)).map(
    (tool) => tool.name
  );
}

function instrumentTools(
  tools: BetaRunnableTool[],
  runnerContext: { env: Env; sessionId: string }
): BetaRunnableTool[] {
  return tools.map((tool) => ({
    ...tool,
    run: async (input, toolContext) => {
      const startedAt = Date.now();
      console.log(
        `[runner] tool=${tool.name} start session=${runnerContext.sessionId}`
      );
      try {
        const result = await tool.run(input, toolContext);
        await writeToolArtifact({
          env: runnerContext.env,
          result,
          sessionId: runnerContext.sessionId,
          toolName: tool.name,
        });
        console.log(
          `[runner] tool=${tool.name} done session=${runnerContext.sessionId} ms=${Date.now() - startedAt}`
        );
        return result;
      } catch (error) {
        console.error(
          `[runner] tool=${tool.name} failed session=${runnerContext.sessionId}: ${error instanceof Error ? error.message : String(error)}`
        );
        throw error;
      }
    },
  }));
}

async function writeToolArtifact(options: {
  env: Env;
  result: unknown;
  sessionId: string;
  toolName: string;
}): Promise<void> {
  try {
    const artifactKey = await writeOptimizationPlanArtifact(options);
    if (artifactKey) {
      console.log(
        `[runner] tool=${options.toolName} artifact=${artifactKey} session=${options.sessionId}`
      );
    }
  } catch (error) {
    console.warn(
      `[runner] tool=${options.toolName} artifact write failed session=${options.sessionId}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function drainSessionToolRunner(options: {
  client: Anthropic;
  sessionId: string;
  signal: AbortSignal;
  tools: BetaRunnableTool[];
}): Promise<void> {
  const runner = options.client.beta.sessions.events.toolRunner(
    options.sessionId,
    {
      maxIdleMs: IDLE_MS,
      signal: options.signal,
      tools: options.tools,
    }
  );

  for await (const _call of runner) {
    if (options.signal.aborted) {
      break;
    }
  }
}
