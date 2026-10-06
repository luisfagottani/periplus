import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { printRebuild } from "../../../src/cli/handlers/dev.ts";
import { createLogger } from "../../../src/cli/ui/logger.ts";
import { plainTheme } from "../../../src/cli/ui/theme.ts";
import { memoryStream } from "../../helpers/streams.ts";

function setup() {
  const stdout = memoryStream();
  const stderr = memoryStream();
  return {
    stdout,
    stderr,
    logger: createLogger({ stdout, stderr, theme: plainTheme }),
  };
}

describe("printRebuild", () => {
  it("should print the trigger, the file count, the duration and each file", () => {
    const { stdout, logger } = setup();

    printRebuild(logger, {
      reason: "Home.periplus.ts",
      durationMs: 12,
      changed: ["flows/demo/generated/flow.manifest.json"],
      issues: [],
    });

    assert.equal(
      stdout.text(),
      "periplus Home.periplus.ts → 1 file(s) generated in 12ms\n↻ flows/demo/generated/flow.manifest.json\n"
    );
  });

  it("should append the issue report when the build found issues", () => {
    const { stdout, logger } = setup();

    printRebuild(logger, {
      reason: "initial build",
      durationMs: 1,
      changed: [],
      issues: [{ level: "error", code: "dead-end", message: "no way out" }],
    });

    assert.match(stdout.text(), /✗ \[dead-end\] no way out/);
  });

  it("should print build errors to stderr", () => {
    const { stdout, stderr, logger } = setup();

    printRebuild(logger, {
      reason: "index.mdx",
      durationMs: 1,
      changed: [],
      issues: [],
      error: new Error("invalid config"),
    });

    assert.equal(stdout.text(), "");
    assert.equal(stderr.text(), "✗ periplus index.mdx: invalid config\n");
  });
});
