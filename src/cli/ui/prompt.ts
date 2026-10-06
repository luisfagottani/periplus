import type { Writable } from "node:stream";

import type { InputStream } from "../runtime.ts";
import type { OutputStream } from "./logger.ts";

/** Inputs that decide whether the CLI may prompt or animate. */
export interface InteractivityOptions {
  env: NodeJS.ProcessEnv;
  stdin: InputStream;
  stdout: Pick<OutputStream, "isTTY">;
  /** `--yes`: the user asked to never be prompted. */
  yes?: boolean;
}

/** One choice of {@link Prompter.select}. */
export interface SelectOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

/** Labels of a {@link Prompter.task}. */
export interface TaskLabels<T> {
  /** Shown while the work runs (spinner text). */
  start: string;
  /** Shown when it finishes, built from the result. */
  done: (result: T) => string;
}

/**
 * Prompts and progress indicators. In non-interactive mode prompts throw
 * {@link PromptUnavailableError} and tasks simply run, so commands behave the same in CI.
 */
export interface Prompter {
  readonly interactive: boolean;
  /** Opens a framed session (`┌ title`). */
  intro: (title: string) => Promise<void>;
  /** Closes the framed session (`└ message`). */
  outro: (message: string) => Promise<void>;
  text: (options: {
    message: string;
    placeholder?: string;
    defaultValue?: string;
    /** Returns an error message to reject the value. */
    validate?: (value: string) => string | undefined;
  }) => Promise<string>;
  select: <T extends string>(options: {
    message: string;
    options: SelectOption<T>[];
    initialValue?: T;
  }) => Promise<T>;
  confirm: (options: {
    message: string;
    initialValue?: boolean;
  }) => Promise<boolean>;
  /** Runs `run` behind a spinner (interactive) or silently (non-interactive). */
  task: <T>(labels: TaskLabels<T>, run: () => T | Promise<T>) => Promise<T>;
}

/** The user pressed Ctrl+C / Esc on a prompt. */
export class PromptCancelledError extends Error {
  override readonly name = "PromptCancelledError";
  constructor() {
    super("cancelled");
  }
}

/** A prompt was needed but the CLI is not interactive (CI, pipe or `--yes`). */
export class PromptUnavailableError extends Error {
  override readonly name = "PromptUnavailableError";
}

function isTruthyFlag(value: string | undefined): boolean {
  return (
    value !== undefined && value !== "" && value !== "0" && value !== "false"
  );
}

/**
 * Whether the CLI runs in a CI environment (`CI` set to a truthy value).
 *
 * @param env - Environment variables.
 */
export function isCi(env: NodeJS.ProcessEnv): boolean {
  return isTruthyFlag(env.CI);
}

/**
 * Whether the CLI may prompt and show spinners: both stdin and stdout must be terminals,
 * outside CI, and without `--yes`.
 *
 * @param options - Environment, streams and the `--yes` flag.
 * @returns `true` when a human is at the keyboard.
 */
export function isInteractive({
  env,
  stdin,
  stdout,
  yes,
}: InteractivityOptions): boolean {
  return !(yes || isCi(env)) && Boolean(stdin.isTTY) && Boolean(stdout.isTTY);
}

type Clack = typeof import("@clack/prompts");

let clackModule: Promise<Clack> | undefined;

/** Clack needs `node:util.styleText` (Node 20.12+), so it is only loaded when a prompt or spinner is shown. */
function loadClack(): Promise<Clack> {
  clackModule ??= import("@clack/prompts");
  return clackModule;
}

const TRAILING_PUNCTUATION = /[?:]\s*$/;

const nextTick = () => new Promise<void>((resolve) => setImmediate(resolve));

function unavailable(message: string): never {
  throw new PromptUnavailableError(
    `${message.replace(TRAILING_PUNCTUATION, "")}: pass it as a flag or run in an interactive terminal`
  );
}

function createNonInteractivePrompter(): Prompter {
  return {
    interactive: false,
    intro: async () => undefined,
    outro: async () => undefined,
    text: async ({ message }) => unavailable(message),
    select: async ({ message }) => unavailable(message),
    confirm: async ({ message }) => unavailable(message),
    task: async (_labels, run) => await run(),
  };
}

function createInteractivePrompter(stdout: OutputStream): Prompter {
  const output = stdout as unknown as Writable;
  const answer = async <T>(value: T): Promise<Exclude<T, symbol>> => {
    const clack = await loadClack();
    if (clack.isCancel(value)) {
      clack.cancel("Cancelled.", { output });
      throw new PromptCancelledError();
    }
    return value as Exclude<T, symbol>;
  };

  return {
    interactive: true,
    intro: async (title) => (await loadClack()).intro(title, { output }),
    outro: async (message) => (await loadClack()).outro(message, { output }),
    text: async ({ message, placeholder, defaultValue, validate }) => {
      const clack = await loadClack();
      return answer(
        await clack.text({
          message,
          placeholder,
          defaultValue,
          output,
          validate: validate ? (value) => validate(value ?? "") : undefined,
        })
      );
    },
    select: async <T extends string>({
      message,
      options,
      initialValue,
    }: {
      message: string;
      options: SelectOption<T>[];
      initialValue?: T;
    }) => {
      const clack = await loadClack();
      const choice = await clack.select<string>({
        message,
        options,
        initialValue,
        output,
      });
      return (await answer(choice)) as T;
    },
    confirm: async ({ message, initialValue }) => {
      const clack = await loadClack();
      return answer(await clack.confirm({ message, initialValue, output }));
    },
    task: async (labels, run) => {
      const clack = await loadClack();
      const spinner = clack.spinner({ output });
      spinner.start(labels.start);
      // Synchronous work blocks the event loop; yield once so the first spinner frame renders.
      await nextTick();
      try {
        const result = await run();
        spinner.stop(labels.done(result));
        return result;
      } catch (error) {
        spinner.error(labels.start);
        throw error;
      }
    },
  };
}

/**
 * Creates the prompter for the current run.
 *
 * @param options.interactive - Result of {@link isInteractive}.
 * @param options.stdout - Where prompts and spinners render.
 */
export function createPrompter({
  interactive,
  stdout,
}: {
  interactive: boolean;
  stdout: OutputStream;
}): Prompter {
  return interactive
    ? createInteractivePrompter(stdout)
    : createNonInteractivePrompter();
}
