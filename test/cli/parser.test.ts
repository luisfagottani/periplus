import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  parseCli,
  parseFailOn,
  parseFormat,
  UsageError,
} from "../../src/cli/parser.ts";

describe("parseCli", () => {
  it("should split the command, its positionals and flags", () => {
    const parsed = parseCli(["node", "checkout", "--branch", "review", "-y"]);

    assert.equal(parsed.command, "node");
    assert.deepEqual(parsed.args, ["checkout"]);
    assert.equal(parsed.values.branch, "review");
    assert.equal(parsed.values.yes, true);
  });

  it("should return no command for an empty argv", () => {
    const parsed = parseCli([]);

    assert.equal(parsed.command, undefined);
    assert.deepEqual(parsed.args, []);
  });

  it("should throw a UsageError on unknown flags", () => {
    assert.throws(() => parseCli(["build", "--nope"]), UsageError);
  });

  it("should throw a UsageError when a string flag has no value", () => {
    assert.throws(() => parseCli(["check", "--format"]), UsageError);
  });
});

describe("parseFailOn", () => {
  it("should default to error and accept every threshold", () => {
    assert.equal(parseFailOn(undefined), "error");
    assert.equal(parseFailOn("stale"), "stale");
    assert.equal(parseFailOn("warning"), "warning");
  });

  it("should reject unknown thresholds", () => {
    assert.throws(() => parseFailOn("info"), /invalid --fail-on: info/);
  });
});

describe("parseFormat", () => {
  it("should default to text and accept markdown and json", () => {
    assert.equal(parseFormat(undefined), "text");
    assert.equal(parseFormat("markdown"), "markdown");
    assert.equal(parseFormat("json"), "json");
  });

  it("should reject unknown formats", () => {
    assert.throws(() => parseFormat("html"), UsageError);
  });
});
