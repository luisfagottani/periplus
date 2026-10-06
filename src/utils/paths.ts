import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let cached: string | undefined;

function isPeriplusPackage(dir: string): boolean {
  const manifest = path.join(dir, "package.json");
  if (!fs.existsSync(manifest)) {
    return false;
  }
  const { name } = JSON.parse(fs.readFileSync(manifest, "utf8")) as {
    name?: string;
  };
  return name === "periplus";
}

/** Root of the installed `periplus` package (works from `src/` in tests and from the bundled `dist/cli.js`). */
export function packageRoot(): string {
  if (cached) {
    return cached;
  }
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (!isPeriplusPackage(dir)) {
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error("could not locate the periplus package root");
    }
    dir = parent;
  }
  cached = dir;
  return dir;
}

/** Version of the installed `periplus` package (from its `package.json`). */
export function packageVersion(): string {
  const { version } = JSON.parse(
    fs.readFileSync(path.join(packageRoot(), "package.json"), "utf8")
  ) as { version: string };
  return version;
}
