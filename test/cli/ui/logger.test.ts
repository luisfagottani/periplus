import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { createLogger } from "../../../src/cli/ui/logger.ts";
import { createTheme, plainTheme } from "../../../src/cli/ui/theme.ts";
import { hasAnsi, memoryStream } from "../../helpers/streams.ts";

function setup(theme = plainTheme) {
  const stdout = memoryStream();
  const stderr = memoryStream();
  return { stdout, stderr, logger: createLogger({ stdout, stderr, theme }) };
}

describe("createLogger", () => {
  it("should write results to stdout and failures to stderr", () => {
    const { stdout, stderr, logger } = setup();
    logger.success("done");
    logger.info("plain");
    logger.hint("detail");
    logger.line();
    logger.warn("careful");
    logger.error("broken");

    assert.equal(stdout.text(), "✓ done\nplain\ndetail\n\n");
    assert.equal(stderr.text(), "! careful\n✗ broken\n");
  });

  it("should prefix files with the symbol of their change", () => {
    const { stdout, logger } = setup();
    logger.file("added", "a.ts");
    logger.file("updated", "b.ts");
    logger.file("unchanged", "c.ts");
    logger.file("removed", "d.ts");
    logger.file("regenerated", "e.ts");
    logger.file("outdated", "f.ts", "(use --force)");

    assert.equal(
      stdout.text(),
      "+ a.ts\n~ b.ts\n= c.ts\n- d.ts\n↻ e.ts\n! f.ts (use --force)\n"
    );
  });

  it("should never emit ANSI codes with the plain theme", () => {
    const { stdout, stderr, logger } = setup();
    logger.success("x");
    logger.file("added", "y");
    logger.error("z");
    assert.ok(!hasAnsi(stdout.text() + stderr.text()));
  });

  it("should style symbols when colors are enabled", () => {
    const { stdout, logger } = setup(createTheme(true));
    logger.success("x");
    assert.ok(hasAnsi(stdout.text()));
    assert.ok(stdout.text().endsWith(" x\n"));
  });
});
