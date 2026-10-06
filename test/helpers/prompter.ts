import type { Prompter } from "../../src/cli/ui/prompt.ts";

/** A prompt the fake prompter was asked, with the answer it returned. */
export interface AskedPrompt {
  kind: "text" | "select" | "confirm";
  message: string;
  /** Values offered by a `select`. */
  options?: string[];
}

/** Interactive {@link Prompter} that answers from a queue instead of a terminal. */
export interface ScriptedPrompter extends Prompter {
  asked: AskedPrompt[];
  /** Spinner labels in the order tasks ran. */
  tasks: string[];
}

/**
 * Creates an interactive prompter that returns `answers` in order. An answer of `undefined`
 * accepts the prompt's `defaultValue`. Text answers go through `validate` and throw if rejected.
 *
 * @param answers - One entry per expected prompt.
 */
export function scriptedPrompter(
  answers: (string | boolean | undefined)[]
): ScriptedPrompter {
  const queue = [...answers];
  const asked: AskedPrompt[] = [];
  const tasks: string[] = [];
  const next = (prompt: AskedPrompt) => {
    asked.push(prompt);
    if (!queue.length) {
      throw new Error(`unexpected prompt: ${prompt.message}`);
    }
    return queue.shift();
  };

  return {
    interactive: true,
    asked,
    tasks,
    intro: async () => undefined,
    outro: async () => undefined,
    text: ({ message, defaultValue, validate }) => {
      const value =
        (next({ kind: "text", message }) as string | undefined) ??
        defaultValue ??
        "";
      const invalid = validate?.(value);
      if (invalid) {
        return Promise.reject(new Error(`rejected "${value}": ${invalid}`));
      }
      return Promise.resolve(value);
    },
    select: ({ message, options }) => {
      const values = options.map((option) => option.value);
      const value = next({ kind: "select", message, options: values });
      if (!values.includes(value as never)) {
        return Promise.reject(
          new Error(`"${value}" is not an option of "${message}"`)
        );
      }
      return Promise.resolve(value as (typeof values)[number]);
    },
    confirm: async ({ message }) =>
      next({ kind: "confirm", message }) as boolean,
    task: async (labels, run) => {
      tasks.push(labels.start);
      return await run();
    },
  };
}
