import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { createTheme } from "../../src/cli/ui/theme.ts";
import { shouldFail, sortIssues } from "../../src/domain/report/fail.ts";
import {
  PR_COMMENT_MARKER,
  renderMarkdown,
} from "../../src/domain/report/markdown.ts";
import { renderCheckText, renderText } from "../../src/domain/report/text.ts";
import type { Issue } from "../../src/issues.ts";
import { hasAnsi } from "../helpers/streams.ts";

const ERROR: Issue = {
  level: "error",
  code: "dead-end",
  message: "no way out",
  file: "b.periplus.ts",
  nodeId: "Home:default",
};
const STALE: Issue = {
  level: "warning",
  code: "stale",
  message: "code changed",
  file: "a.periplus.ts",
};
const WARNING: Issue = {
  level: "warning",
  code: "orphan-node",
  message: "unreachable",
};

describe("shouldFail", () => {
  it("should always fail on errors", () => {
    assert.equal(shouldFail([ERROR], "error"), true);
  });

  it("should fail on stale docs only from `stale` up", () => {
    assert.equal(shouldFail([STALE], "error"), false);
    assert.equal(shouldFail([STALE], "stale"), true);
    assert.equal(shouldFail([WARNING], "stale"), false);
    assert.equal(shouldFail([WARNING], "warning"), true);
  });
});

describe("sortIssues", () => {
  it("should put errors first without mutating the input", () => {
    const input = [STALE, WARNING, ERROR];

    assert.deepEqual(sortIssues(input), [ERROR, WARNING, STALE]);
    assert.deepEqual(input, [STALE, WARNING, ERROR]);
  });
});

describe("renderText", () => {
  it("should render the success line without issues", () => {
    assert.equal(renderText([]), "✓ periplus: no issues found.");
  });

  it("should render each issue and a summary, plain by default", () => {
    const text = renderText([STALE, ERROR]);

    assert.equal(
      text,
      [
        "✗ [dead-end] b.periplus.ts · Home:default: no way out",
        "! [stale] a.periplus.ts: code changed",
        "",
        "1 error(s), 1 warning(s).",
      ].join("\n")
    );
    assert.equal(hasAnsi(text), false);
  });

  it("should color when given an enabled theme", () => {
    assert.equal(hasAnsi(renderText([ERROR], createTheme(true))), true);
  });
});

describe("renderCheckText", () => {
  it("should append stale generated files", () => {
    const text = renderCheckText([], ["flows/demo/generated/a.json"]);

    assert.match(text, /stale generated artifacts; run `periplus build`:/);
    assert.match(text, /\n {2}- flows\/demo\/generated\/a\.json$/);
  });
});

describe("renderMarkdown", () => {
  it("should start with the PR marker and never contain ANSI", () => {
    const markdown = renderMarkdown([ERROR, STALE, WARNING], {
      failed: true,
      generatedStale: ["x.json"],
    });

    assert.ok(markdown.startsWith(PR_COMMENT_MARKER));
    assert.match(markdown, /dead-end/);
    assert.match(markdown, /x\.json/);
    assert.equal(hasAnsi(markdown), false);
  });

  it("should report a clean run", () => {
    assert.match(
      renderMarkdown([], { failed: false }),
      /No issues: docs are valid/
    );
  });
});
