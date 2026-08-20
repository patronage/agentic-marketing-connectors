import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const deployRoot = path.resolve(new URL("..", import.meta.url).pathname);
const packageRoot = path.resolve(deployRoot, "..");
const packageManifest = JSON.parse(
  readFileSync(path.join(packageRoot, "package.json"), "utf-8")
) as { exports: Record<string, unknown>; name: string };
/** Public entry points: the package `exports` map, resolved to specifiers. */
const publicEntryPoints = new Set(
  Object.keys(packageManifest.exports).map((subpath) =>
    subpath === "."
      ? packageManifest.name
      : `${packageManifest.name}/${subpath.slice(2)}`
  )
);
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
    if (!specifier || publicEntryPoints.has(specifier)) {
      continue;
    }

    if (specifier.startsWith(`${packageManifest.name}/`)) {
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
