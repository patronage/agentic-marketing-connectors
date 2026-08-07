import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

const configSchema = z.object({
  runLogDir: z.string().min(1).optional(),
});

export interface PatronageCliConfig {
  runLogDir: string;
}

export function resolveCliConfig(input: {
  configPath?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  runLogDir?: string;
}): PatronageCliConfig {
  const cwd = input.cwd ?? process.cwd();
  const env = input.env ?? process.env;
  const configPath =
    input.configPath ?? path.join(cwd, "patronage.config.json");
  const fileConfig = readConfigFile(configPath);
  const runLogDir =
    input.runLogDir ??
    env.PATRONAGE_RUN_LOG_DIR ??
    fileConfig.runLogDir ??
    "tmp/patronage";

  return {
    runLogDir: path.resolve(cwd, runLogDir),
  };
}

function readConfigFile(configPath: string): Partial<PatronageCliConfig> {
  if (!existsSync(configPath)) {
    return {};
  }

  const parsed = configSchema.parse(
    JSON.parse(readFileSync(configPath, "utf-8"))
  );
  return parsed;
}
