import { runSuggest } from "../../use-cases/suggest.ts";
import type { CommandHandler } from "../command.ts";

/** `periplus suggest [dir]`: writes code-derived candidates to review. */
export const suggestCommand: CommandHandler = ({ args, logger, project }) => {
  logger.file("added", runSuggest(project(), args[0]));
  return 0;
};
