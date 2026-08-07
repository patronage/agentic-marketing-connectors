#!/usr/bin/env node
import { pathToFileURL } from "node:url";

import chalk from "chalk";
import { Command } from "commander";

import { createGoogleCommand } from "./google.js";
import type { GoogleCommandOptions } from "./google.js";
import { createLinkedInCommand } from "./linkedin.js";
import { createMetaCommand } from "./meta.js";
import { createXCommand } from "./x.js";

export interface ProgramOptions {
  google?: GoogleCommandOptions;
}

export function createProgram(options: ProgramOptions = {}): Command {
  const program = new Command();

  program
    .name("patronage")
    .description("Local CLI harness for Patronage Open Source Core")
    .version("0.0.0");

  program.addCommand(createGoogleCommand(options.google));
  program.addCommand(createLinkedInCommand());
  program.addCommand(createMetaCommand());
  program.addCommand(createXCommand());

  return program;
}

export async function run(
  argv: string[] = process.argv,
  options: ProgramOptions = {}
): Promise<void> {
  await createProgram(options).parseAsync(argv);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    await run();
  } catch (error) {
    console.error(
      chalk.red("\nError:"),
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
}
