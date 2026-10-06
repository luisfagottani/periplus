import { runSkill, type SkillResult } from "../../use-cases/skill.ts";
import type { CommandHandler } from "../command.ts";
import type { FileChange } from "../ui/logger.ts";

const STATUS_MESSAGES: Record<
  SkillResult["status"],
  [change: FileChange, note?: string]
> = {
  created: ["added"],
  updated: ["updated", "updated to the packaged version"],
  unchanged: ["unchanged", "is already up to date"],
  outdated: [
    "outdated",
    "differs from the packaged version (use --force to overwrite)",
  ],
};

/** `periplus skill`: installs the agent skill, never overwriting without `--force`. */
export const skillCommand: CommandHandler = ({ values, runtime, logger }) => {
  const result = runSkill({
    cwd: runtime.cwd,
    dir: values.dir,
    force: values.force,
  });
  const [change, note] = STATUS_MESSAGES[result.status];
  logger.file(change, result.file, note);
  return 0;
};
