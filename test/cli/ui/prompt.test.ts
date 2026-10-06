import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  createPrompter,
  isCi,
  isInteractive,
  PromptUnavailableError,
} from "../../../src/cli/ui/prompt.ts";
import { memoryStream } from "../../helpers/streams.ts";

const tty = { isTTY: true };

describe("isCi", () => {
  it("should treat empty, 0 and false as not CI", () => {
    assert.equal(isCi({}), false);
    assert.equal(isCi({ CI: "" }), false);
    assert.equal(isCi({ CI: "0" }), false);
    assert.equal(isCi({ CI: "false" }), false);
    assert.equal(isCi({ CI: "true" }), true);
    assert.equal(isCi({ CI: "1" }), true);
  });
});

describe("isInteractive", () => {
  it("should be interactive only with two TTYs, outside CI and without --yes", () => {
    assert.equal(isInteractive({ env: {}, stdin: tty, stdout: tty }), true);
    assert.equal(
      isInteractive({ env: { CI: "true" }, stdin: tty, stdout: tty }),
      false
    );
    assert.equal(
      isInteractive({ env: {}, stdin: tty, stdout: tty, yes: true }),
      false
    );
    assert.equal(isInteractive({ env: {}, stdin: {}, stdout: tty }), false);
    assert.equal(isInteractive({ env: {}, stdin: tty, stdout: {} }), false);
  });
});

describe("createPrompter (non-interactive)", () => {
  const prompter = createPrompter({
    interactive: false,
    stdout: memoryStream(),
  });

  it("should reject prompts with a hint to use flags", async () => {
    await assert.rejects(
      prompter.text({ message: "Flow slug?" }),
      (error: Error) =>
        error instanceof PromptUnavailableError &&
        error.message ===
          "Flow slug: pass it as a flag or run in an interactive terminal"
    );
    await assert.rejects(
      prompter.select({
        message: "Pick",
        options: [{ value: "a", label: "A" }],
      }),
      PromptUnavailableError
    );
    await assert.rejects(
      prompter.confirm({ message: "Sure?" }),
      PromptUnavailableError
    );
  });

  it("should run tasks without printing anything", async () => {
    const stdout = memoryStream();
    const silent = createPrompter({ interactive: false, stdout });

    await silent.intro("title");
    const result = await silent.task(
      { start: "working", done: () => "done" },
      () => 42
    );
    await silent.outro("bye");

    assert.equal(result, 42);
    assert.equal(stdout.text(), "");
    assert.equal(silent.interactive, false);
  });

  it("should propagate task errors", async () => {
    await assert.rejects(
      prompter.task({ start: "x", done: () => "y" }, () => {
        throw new Error("boom");
      }),
      /boom/
    );
  });
});
