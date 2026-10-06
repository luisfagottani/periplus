import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { COMMAND_NAMES, findCommand } from "../../src/cli/commands.ts";

describe("findCommand", () => {
  it("should return a handler for every registered name", () => {
    for (const name of COMMAND_NAMES) {
      assert.equal(typeof findCommand(name), "function");
    }
  });

  it("should not resolve Object.prototype keys", () => {
    assert.equal(findCommand("toString"), undefined);
    assert.equal(findCommand("constructor"), undefined);
  });
});
