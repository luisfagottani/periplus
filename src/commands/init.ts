import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { CONFIG_FILE, findRoot } from "../context.ts";
import { packageRoot } from "../paths.ts";

export const DEFAULT_SITE_DIR = "docs/periplus";

export const EMBEDDED_TEMPLATE = path.join(
  packageRoot(),
  "templates/starlight"
);

/** npm never publishes `.gitignore` files inside packages, so the template stores it without the dot. */
const RENAMES: Record<string, string> = { gitignore: ".gitignore" };
const SKIP = new Set(["node_modules", "dist", ".astro", "package-lock.json"]);
const GENERATED_DIR = path.join("src", "content", "docs", "flows");

export interface InitOptions {
  cwd: string;
  dir?: string;
  force?: boolean;
  /** giget source (e.g. `gh:org/repo/templates/starlight`); defaults to the bundled template. */
  template?: string;
}

export interface InitResult {
  root: string;
  /** Site folder relative to the root (written as `hubDir`). */
  hubDir: string;
  written: string[];
  skipped: string[];
  config: "created" | "updated" | "unchanged";
}

function copyTree(
  source: string,
  target: string,
  force: boolean,
  result: Pick<InitResult, "written" | "skipped">,
  base = target
) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) {
      continue;
    }
    const from = path.join(source, entry.name);
    const to = path.join(target, RENAMES[entry.name] ?? entry.name);
    const relative = path.relative(base, to).split(path.sep).join("/");
    if (entry.isDirectory()) {
      if (path.relative(base, to) === GENERATED_DIR) {
        continue;
      }
      copyTree(from, to, force, result, base);
      continue;
    }
    if (fs.existsSync(to) && !force) {
      result.skipped.push(relative);
      continue;
    }
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    result.written.push(relative);
  }
}

function projectName(root: string): string {
  const pkg = path.join(root, "package.json");
  if (fs.existsSync(pkg)) {
    const { name } = JSON.parse(fs.readFileSync(pkg, "utf8")) as {
      name?: string;
    };
    if (name) {
      return name;
    }
  }
  return path.basename(root);
}

function updateConfig(root: string, hubDir: string): InitResult["config"] {
  const file = path.join(root, CONFIG_FILE);
  const exists = fs.existsSync(file);
  const raw: Record<string, unknown> = exists
    ? JSON.parse(fs.readFileSync(file, "utf8"))
    : {
        project: projectName(root),
        flowsDir: "flows",
        scanRoots: ["src"],
        repoUrl: "",
        domains: {},
      };

  const site = { ...((raw.site as Record<string, unknown> | undefined) ?? {}) };
  const changed = !exists || raw.hubDir !== hubDir || !site.title;
  if (!changed) {
    return "unchanged";
  }

  site.title ??= raw.project ?? projectName(root);
  raw.hubDir = hubDir;
  raw.site = site;
  fs.writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`);
  return exists ? "updated" : "created";
}

async function resolveTemplate(
  source: string | undefined
): Promise<{ dir: string; cleanup: () => void }> {
  if (!source) {
    return { dir: EMBEDDED_TEMPLATE, cleanup: () => undefined };
  }
  const { downloadTemplate } = await import("giget");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "periplus-template-"));
  const { dir } = await downloadTemplate(source, {
    dir: path.join(tmp, "template"),
    force: true,
  });
  return {
    dir,
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}

export async function runInit(options: InitOptions): Promise<InitResult> {
  const root = findRoot(options.cwd) ?? path.resolve(options.cwd);
  const target = path.resolve(options.cwd, options.dir ?? DEFAULT_SITE_DIR);
  const hubDir = path.relative(root, target).split(path.sep).join("/");
  if (!hubDir || hubDir.startsWith("..")) {
    throw new Error(`the site folder must be inside the project (${root})`);
  }

  const template = await resolveTemplate(options.template);
  const result: InitResult = {
    root,
    hubDir,
    written: [],
    skipped: [],
    config: "unchanged",
  };
  try {
    copyTree(template.dir, target, Boolean(options.force), result);
  } finally {
    template.cleanup();
  }
  result.config = updateConfig(root, hubDir);
  return result;
}
