import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "vitest";

import { createTheme } from "../../src/cli/ui/theme.ts";
import { runBuild } from "../../src/use-cases/build.ts";
import { parseChangedFiles, runCheck } from "../../src/use-cases/check.ts";
import { createDemoProject, type DemoProject } from "../helpers/project.ts";
import { hasAnsi } from "../helpers/streams.ts";

describe("parseChangedFiles", () => {
  it("should accept a JSON array or a whitespace/comma list", () => {
    assert.deepEqual(parseChangedFiles('["a.ts","","b.ts"]'), ["a.ts", "b.ts"]);
    assert.deepEqual(parseChangedFiles("a.ts b.ts,c.ts\nd.ts"), [
      "a.ts",
      "b.ts",
      "c.ts",
      "d.ts",
    ]);
  });

  it("should return an empty list for missing or blank input", () => {
    assert.deepEqual(parseChangedFiles(undefined), []);
    assert.deepEqual(parseChangedFiles("   "), []);
  });
});

describe("runCheck styling", () => {
  let project: DemoProject;

  beforeEach(() => {
    project = createDemoProject();
    runBuild(project.ctx());
  });

  afterEach(() => {
    project.cleanup();
  });

  const colored = createTheme(true);

  it("should color the text report when a style is given", () => {
    const { report } = runCheck(project.ctx(), {
      failOn: "error",
      format: "text",
      changedFiles: [],
      style: colored,
    });

    assert.equal(hasAnsi(report), true);
  });

  it("should keep --output files plain even with a style", () => {
    const { report } = runCheck(project.ctx(), {
      failOn: "error",
      format: "text",
      output: "out/report.txt",
      changedFiles: [],
      style: colored,
    });

    assert.equal(hasAnsi(report), false);
    assert.equal(project.read("out/report.txt"), report);
  });

  it("should ignore the style for markdown and json", () => {
    for (const format of ["markdown", "json"] as const) {
      const { report } = runCheck(project.ctx(), {
        failOn: "error",
        format,
        changedFiles: [],
        style: colored,
      });
      assert.equal(hasAnsi(report), false);
    }
  });
});
