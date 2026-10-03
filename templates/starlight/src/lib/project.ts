import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CONFIG_FILE = "periplus.config.json";

export interface ProjectConfig {
  project: string;
  flowsDir?: string;
  repoUrl?: string;
  site?: { title?: string; description?: string; githubUrl?: string };
}

function findUp(start: string): string | undefined {
  let dir = path.resolve(start);
  while (!fs.existsSync(path.join(dir, CONFIG_FILE))) {
    const parent = path.dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
  return dir;
}

let rootCache: string | undefined;

/** Documented project root: `PERIPLUS_ROOT` or the first directory above the site containing `periplus.config.json`. */
export function projectRoot(): string {
  if (rootCache) {
    return rootCache;
  }
  const fromEnv = process.env.PERIPLUS_ROOT;
  // During build Vite rewrites import.meta.url to the generated chunk, so the cwd (site folder) comes first.
  const found = fromEnv
    ? path.resolve(fromEnv)
    : (findUp(process.cwd()) ??
      findUp(path.dirname(fileURLToPath(import.meta.url))));
  if (!found) {
    throw new Error(
      `${CONFIG_FILE} not found above ${process.cwd()}: run \`periplus init\` at the project root or set PERIPLUS_ROOT.`
    );
  }
  rootCache = found;
  return found;
}

let configCache: ProjectConfig | undefined;

export function loadProjectConfig(): ProjectConfig {
  configCache ??= JSON.parse(
    fs.readFileSync(path.join(projectRoot(), CONFIG_FILE), "utf8")
  ) as ProjectConfig;
  return configCache;
}
