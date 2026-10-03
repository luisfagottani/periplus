import fs from "node:fs";
import path from "node:path";

import { type Config, configSchema, formatZodIssues } from "./schema.ts";

export const CONFIG_FILE = "periplus.config.json";

export interface Ctx {
  root: string;
  /** Directory the CLI was invoked from (package managers forward it as INIT_CWD when running scripts). */
  cwd: string;
  config: Config;
}

export function findRoot(start: string): string | undefined {
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

export function loadContext(
  options: { root?: string; cwd?: string } = {}
): Ctx {
  const cwd = options.cwd ?? process.env.INIT_CWD ?? process.cwd();
  const root = options.root ?? findRoot(cwd);

  if (!root) {
    throw new Error(
      `${CONFIG_FILE} not found from ${cwd} (run \`periplus init\` first)`
    );
  }

  const raw = JSON.parse(fs.readFileSync(path.join(root, CONFIG_FILE), "utf8"));
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `invalid ${CONFIG_FILE}:\n  ${formatZodIssues(parsed.error).join("\n  ")}`
    );
  }

  return { root, cwd, config: parsed.data };
}

export function toRepoPath(ctx: Ctx, absolute: string): string {
  return path.relative(ctx.root, absolute).split(path.sep).join("/");
}

export function fromRepoPath(ctx: Ctx, repoPath: string): string {
  return path.join(ctx.root, ...repoPath.split("/"));
}

export function flowsDirAbs(ctx: Ctx): string {
  return fromRepoPath(ctx, ctx.config.flowsDir);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
