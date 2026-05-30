import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { config as loadDotenv } from "dotenv";

export function findDotenvPath(startDirectories: string[]): string | undefined {
  const searched = new Set<string>();

  for (const startDirectory of startDirectories) {
    let currentDirectory = resolve(startDirectory);

    while (true) {
      if (!searched.has(currentDirectory)) {
        searched.add(currentDirectory);

        const candidate = join(currentDirectory, ".env");
        if (existsSync(candidate)) {
          return candidate;
        }
      }

      const parentDirectory = dirname(currentDirectory);
      if (parentDirectory === currentDirectory) {
        break;
      }

      currentDirectory = parentDirectory;
    }
  }

  return undefined;
}

export function loadLocalDotenv(
  startDirectories: string[]
): string | undefined {
  const envPath = findDotenvPath(startDirectories);

  if (envPath) {
    loadDotenv({ path: envPath, quiet: true });
  }

  return envPath;
}

export function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  if (value.trim().startsWith("op://")) {
    throw new Error(
      `${name} still contains a 1Password reference. Run \`pnpm setup:env\` to inject secrets.`
    );
  }

  return value.trim();
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    return undefined;
  }

  if (value.trim().startsWith("op://")) {
    return undefined;
  }

  return value.trim();
}
