import fs from "node:fs";
import path from "node:path";

import { findRoot } from "../context.ts";
import { packageRoot } from "../paths.ts";

export const SKILL_NAME = "periplus-docs";
export const DEFAULT_SKILLS_DIR = ".cursor/skills";

export const EMBEDDED_SKILL = path.join(
  packageRoot(),
  "skills",
  SKILL_NAME,
  "SKILL.md"
);

export interface SkillOptions {
  cwd: string;
  /** Skills folder relative to the project root (default `.cursor/skills`). */
  dir?: string;
  force?: boolean;
}

export interface SkillResult {
  /** SKILL.md path relative to the root. */
  file: string;
  status: "created" | "updated" | "unchanged" | "outdated";
}

export function runSkill(options: SkillOptions): SkillResult {
  const root = findRoot(options.cwd) ?? path.resolve(options.cwd);
  const target = path.resolve(
    root,
    options.dir ?? DEFAULT_SKILLS_DIR,
    SKILL_NAME,
    "SKILL.md"
  );
  const file = path.relative(root, target).split(path.sep).join("/");
  const content = fs.readFileSync(EMBEDDED_SKILL, "utf8");

  if (fs.existsSync(target)) {
    if (fs.readFileSync(target, "utf8") === content) {
      return { file, status: "unchanged" };
    }
    if (!options.force) {
      return { file, status: "outdated" };
    }
    fs.writeFileSync(target, content);
    return { file, status: "updated" };
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return { file, status: "created" };
}
