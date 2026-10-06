import type { CliRuntime } from "../../src/cli/runtime.ts";
import { type MemoryStream, memoryStream } from "./streams.ts";

/** {@link CliRuntime} backed by in-memory streams. */
export interface FakeRuntime extends CliRuntime {
  stdout: MemoryStream;
  stderr: MemoryStream;
}

/**
 * Creates a runtime without TTYs (so no prompts and no colors) rooted at `cwd`.
 *
 * @param cwd - Directory the CLI is invoked from.
 * @param overrides - Env vars or TTY flags to change.
 */
export function fakeRuntime(
  cwd: string,
  overrides: { env?: NodeJS.ProcessEnv; tty?: boolean } = {}
): FakeRuntime {
  const tty = overrides.tty ?? false;
  return {
    cwd,
    env: { ...overrides.env },
    stdin: { isTTY: tty },
    stdout: memoryStream(tty),
    stderr: memoryStream(tty),
  };
}
