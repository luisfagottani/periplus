import { createColors } from "picocolors";

/** The only part of a stream needed to decide whether it can render colors. */
export interface ColorStream {
  isTTY?: boolean;
}

/** A function that wraps text in ANSI styles (or returns it untouched when colors are off). */
export type Style = (text: string) => string;

/**
 * Semantic palette used by every CLI message.
 * Commands pick a role (`success`, `warn`…) instead of a raw color, so output stays consistent.
 */
export interface Theme {
  /** Whether styles emit ANSI escape codes. */
  readonly enabled: boolean;
  readonly success: Style;
  readonly error: Style;
  readonly warn: Style;
  readonly info: Style;
  readonly dim: Style;
  readonly bold: Style;
  /** Commands, flags and paths the user can copy. */
  readonly code: Style;
  readonly symbols: Readonly<typeof SYMBOLS>;
}

/** Glyphs shared by every command; kept ASCII-friendly where terminals lack Unicode fonts. */
export const SYMBOLS = {
  success: "✓",
  error: "✗",
  warning: "!",
  added: "+",
  updated: "~",
  unchanged: "=",
  removed: "-",
  regenerated: "↻",
  arrow: "→",
  bullet: "•",
} as const;

function isTruthyFlag(value: string | undefined): boolean {
  return (
    value !== undefined && value !== "" && value !== "0" && value !== "false"
  );
}

/**
 * Decides whether output to `stream` should be colored.
 *
 * Precedence: `NO_COLOR` (any non-empty value) disables, `FORCE_COLOR` forces, `TERM=dumb` disables,
 * `CI` enables (CI log viewers render ANSI), otherwise only interactive terminals get colors.
 *
 * @param env - Environment variables (usually `process.env`).
 * @param stream - Destination stream (usually `process.stdout`).
 * @returns `true` when ANSI styles should be emitted.
 * @example
 * isColorEnabled({ NO_COLOR: "1" }, { isTTY: true }); // false
 */
export function isColorEnabled(
  env: NodeJS.ProcessEnv,
  stream: ColorStream
): boolean {
  if (env.NO_COLOR) {
    return false;
  }
  if (env.FORCE_COLOR !== undefined) {
    return env.FORCE_COLOR !== "0" && env.FORCE_COLOR !== "false";
  }
  if (env.TERM === "dumb") {
    return false;
  }
  if (isTruthyFlag(env.CI)) {
    return true;
  }
  return Boolean(stream.isTTY);
}

/**
 * Builds the semantic palette.
 *
 * @param enabled - When `false`, every style returns its input unchanged (safe for files and pipes).
 * @returns A {@link Theme} backed by picocolors.
 */
export function createTheme(enabled: boolean): Theme {
  const colors = createColors(enabled);
  return {
    enabled,
    success: colors.green,
    error: colors.red,
    warn: colors.yellow,
    info: colors.cyan,
    dim: colors.dim,
    bold: colors.bold,
    code: colors.cyan,
    symbols: SYMBOLS,
  };
}

/** Theme without ANSI codes, for reports written to files or machine-readable output. */
export const plainTheme: Theme = createTheme(false);
