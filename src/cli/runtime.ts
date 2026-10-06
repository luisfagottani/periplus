import type { OutputStream } from "./ui/logger.ts";

/** The only part of stdin the CLI inspects. */
export interface InputStream {
  isTTY?: boolean;
}

/**
 * Everything the CLI reads from the outside world. Passing it explicitly (instead of touching
 * `process` directly) lets tests run commands in a temporary folder with captured output.
 */
export interface CliRuntime {
  /** Directory the CLI was invoked from. */
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdin: InputStream;
  stdout: OutputStream;
  stderr: OutputStream;
}

/**
 * Runtime backed by the current process.
 * Package managers forward the caller directory as `INIT_CWD` when running scripts, so it wins over `process.cwd()`.
 */
export function processRuntime(): CliRuntime {
  return {
    cwd: process.env.INIT_CWD ?? process.cwd(),
    env: process.env,
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
  };
}
