export function parseLiveSmokeArgs(argv) {
  return { allowMutations: argv.includes("--allow-mutations") };
}
