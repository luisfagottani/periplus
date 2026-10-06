import type { Theme } from "./theme.ts";

/** Minimal writable stream (satisfied by `process.stdout` and by test doubles). */
export interface OutputStream {
  write: (chunk: string) => unknown;
  isTTY?: boolean;
}

/** How a file was affected by a command; drives the leading symbol and color. */
export type FileChange =
  | "added"
  | "updated"
  | "unchanged"
  | "removed"
  | "regenerated"
  | "outdated";

/** Human-oriented output for commands. Results go to stdout, failures to stderr. */
export interface Logger {
  readonly theme: Theme;
  /** Writes a line as-is (an empty call prints a blank line). */
  line: (text?: string) => void;
  /** Positive outcome, prefixed with `✓`. */
  success: (text: string) => void;
  /** Neutral progress or status information. */
  info: (text: string) => void;
  /** Something the user should look at, prefixed with `!` (stderr). */
  warn: (text: string) => void;
  /** Failure, prefixed with `✗` (stderr). */
  error: (text: string) => void;
  /** Secondary detail, rendered dimmed. */
  hint: (text: string) => void;
  /** One file touched by a command (`+ path`, `~ path`…), with an optional note after it. */
  file: (change: FileChange, path: string, note?: string) => void;
}

/** Streams and palette a {@link Logger} writes with. */
export interface LoggerOptions {
  stdout: OutputStream;
  stderr: OutputStream;
  theme: Theme;
}

function fileMarker(theme: Theme, change: FileChange): string {
  const { symbols } = theme;
  switch (change) {
    case "added":
      return theme.success(symbols.added);
    case "updated":
      return theme.info(symbols.updated);
    case "unchanged":
      return theme.dim(symbols.unchanged);
    case "removed":
      return theme.error(symbols.removed);
    case "regenerated":
      return theme.info(symbols.regenerated);
    case "outdated":
      return theme.warn(symbols.warning);
    default:
      return change satisfies never;
  }
}

/**
 * Creates a {@link Logger} bound to the given streams.
 *
 * @param options - Destination streams and the palette to style messages with.
 * @returns A logger whose methods append a trailing newline.
 * @example
 * const logger = createLogger({ stdout: process.stdout, stderr: process.stderr, theme: createTheme(true) });
 * logger.file("added", "flows/checkout/index.mdx");
 */
export function createLogger({ stdout, stderr, theme }: LoggerOptions): Logger {
  const out = (text: string) => stdout.write(`${text}\n`);
  const err = (text: string) => stderr.write(`${text}\n`);
  const { symbols } = theme;

  return {
    theme,
    line: (text = "") => out(text),
    success: (text) => out(`${theme.success(symbols.success)} ${text}`),
    info: (text) => out(text),
    warn: (text) => err(`${theme.warn(symbols.warning)} ${text}`),
    error: (text) => err(`${theme.error(symbols.error)} ${text}`),
    hint: (text) => out(theme.dim(text)),
    file: (change, path, note) =>
      out(
        `${fileMarker(theme, change)} ${path}${note ? ` ${theme.dim(note)}` : ""}`
      ),
  };
}
