import fs from "node:fs";
import path from "node:path";

import { findRoot } from "../context.ts";
import { packageRoot } from "../utils/paths.ts";

/** Folder name of the agent skill. */
export const SKILL_NAME = "periplus-docs";
/** Where agent skills live by default, relative to the project root. */
export const DEFAULT_SKILLS_DIR = ".cursor/skills";

/** The `SKILL.md` shipped inside the npm package. */
export const EMBEDDED_SKILL = path.join(
  packageRoot(),
  "skills",
  SKILL_NAME,
  "SKILL.md"
);

/** Options of {@link runSkill}. */
export interface SkillOptions {
  /** Invocation directory; the project root is searched upwards from it. */
  cwd: string;
  /** Skills folder relative to the project root (default `.cursor/skills`). */
  dir?: string;
  /** Overwrite a local copy that differs from the packaged one. */
  force?: boolean;
}

/** Outcome of {@link runSkill}. */
export interface SkillResult {
  /** SKILL.md path relative to the root. */
  file: string;
  /** `outdated`: a local copy differs and was kept because `force` was not set. */
  status: "created" | "updated" | "unchanged" | "outdated";
}

/**
 * Installs the packaged agent skill into the project.
 *
 * @param options - Location and overwrite policy.
 * @returns The skill file and what happened to it.
 */
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
