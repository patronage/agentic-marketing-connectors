import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const deployRoot = path.resolve(new URL("..", import.meta.url).pathname);
const packageRoot = path.resolve(deployRoot, "..");
const importPattern =
  /(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["'](?<staticImport>[^"']+)["']|import\s*\(\s*["'](?<dynamicImport>[^"']+)["']\s*\)|require\s*\(\s*["'](?<requiredImport>[^"']+)["']\s*\)/gu;
const violations: string[] = [];

for (const filePath of sourceFiles(deployRoot)) {
  const contents = readFileSync(filePath, "utf-8");

  for (const specifier of internalPackageImports(filePath, contents)) {
    violations.push(`${path.relative(deployRoot, filePath)} -> ${specifier}`);
  }
}

if (violations.length > 0) {
  throw new Error(
    `Reference deployment must import @patronage/ads-sync public entry points only:\n${violations
      .map((violation) => `- ${violation}`)
      .join("\n")}`
  );
}

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const filePath = path.join(dir, entry);
    const stat = statSync(filePath);

    if (stat.isDirectory()) {
      if (entry === "node_modules") {
        continue;
      }

      yield* sourceFiles(filePath);
      continue;
    }

    if (/\.[cm]?tsx?$/u.test(filePath)) {
      yield filePath;
    }
  }
}

function internalPackageImports(filePath: string, contents: string) {
  const specifiers: string[] = [];

  for (const match of contents.matchAll(importPattern)) {
    const specifier =
      match.groups?.staticImport ??
      match.groups?.dynamicImport ??
      match.groups?.requiredImport;
    if (!specifier || specifier === "@patronage/ads-sync") {
      continue;
    }

    if (specifier.startsWith("@patronage/ads-sync/")) {
      specifiers.push(specifier);
      continue;
    }

    if (!specifier.startsWith(".")) {
      continue;
    }

    const resolved = path.resolve(path.dirname(filePath), specifier);
    if (isInside(packageRoot, resolved) && !isInside(deployRoot, resolved)) {
      specifiers.push(specifier);
    }
  }

  return specifiers;
}

function isInside(parent: string, child: string) {
  const relativePath = path.relative(parent, child);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !relativePath.startsWith("/"))
  );
}
