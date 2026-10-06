import type { CommandHandler } from "./command.ts";
import { buildCommand } from "./handlers/build.ts";
import { checkCommand } from "./handlers/check.ts";
import { devCommand } from "./handlers/dev.ts";
import { initCommand } from "./handlers/init.ts";
import { newCommand } from "./handlers/new.ts";
import { nodeCommand } from "./handlers/node.ts";
import { skillCommand } from "./handlers/skill.ts";
import { stampCommand } from "./handlers/stamp.ts";
import { suggestCommand } from "./handlers/suggest.ts";

/** Command name → handler. Keep in sync with `COMMAND_HELP`. */
export const COMMANDS: Readonly<Record<string, CommandHandler>> = {
  init: initCommand,
  skill: skillCommand,
  new: newCommand,
  node: nodeCommand,
  suggest: suggestCommand,
  stamp: stampCommand,
  check: checkCommand,
  build: buildCommand,
  dev: devCommand,
};

/** Names accepted as `periplus <command>`. */
export const COMMAND_NAMES = Object.keys(COMMANDS);

/**
 * Looks up a command without falling through to `Object.prototype` keys.
 *
 * @param name - Command typed by the user.
 */
export function findCommand(name: string): CommandHandler | undefined {
  return Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
}
