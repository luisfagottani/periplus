import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  createTheme,
  isColorEnabled,
  plainTheme,
} from "../../../src/cli/ui/theme.ts";
import { hasAnsi } from "../../helpers/streams.ts";

const TTY = { isTTY: true };
const PIPE = { isTTY: false };

describe("isColorEnabled", () => {
  it("should color interactive terminals and leave pipes plain", () => {
    assert.equal(isColorEnabled({}, TTY), true);
    assert.equal(isColorEnabled({}, PIPE), false);
  });

  it("should disable colors when NO_COLOR is set, even with FORCE_COLOR", () => {
    assert.equal(isColorEnabled({ NO_COLOR: "1" }, TTY), false);
    assert.equal(
      isColorEnabled({ NO_COLOR: "1", FORCE_COLOR: "1" }, TTY),
      false
    );
  });

  it("should ignore an empty NO_COLOR", () => {
    assert.equal(isColorEnabled({ NO_COLOR: "" }, TTY), true);
  });

  it("should honor FORCE_COLOR on pipes and its falsy values", () => {
    assert.equal(isColorEnabled({ FORCE_COLOR: "1" }, PIPE), true);
    assert.equal(isColorEnabled({ FORCE_COLOR: "" }, PIPE), true);
    assert.equal(isColorEnabled({ FORCE_COLOR: "0" }, TTY), false);
    assert.equal(isColorEnabled({ FORCE_COLOR: "false" }, TTY), false);
  });

  it("should color CI logs but not dumb terminals", () => {
    assert.equal(isColorEnabled({ CI: "true" }, PIPE), true);
    assert.equal(isColorEnabled({ CI: "false" }, PIPE), false);
    assert.equal(isColorEnabled({ CI: "true", TERM: "dumb" }, TTY), false);
  });
});

describe("createTheme", () => {
  it("should emit ANSI codes only when enabled", () => {
    assert.ok(hasAnsi(createTheme(true).success("ok")));
    assert.equal(createTheme(false).success("ok"), "ok");
  });

  it("should expose a plain theme for files and machine output", () => {
    assert.equal(plainTheme.enabled, false);
    assert.equal(plainTheme.error("x"), "x");
    assert.equal(plainTheme.symbols.success, "✓");
  });
});
