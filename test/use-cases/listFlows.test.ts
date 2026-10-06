import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "vitest";

import { listFlows } from "../../src/use-cases/listFlows.ts";
import { runNew } from "../../src/use-cases/new.ts";
import { createDemoProject, type DemoProject } from "../helpers/project.ts";

describe("listFlows", () => {
  let project: DemoProject;

  beforeEach(() => {
    project = createDemoProject();
  });

  afterEach(() => {
    project.cleanup();
  });

  it("should list every flow sorted by title", () => {
    runNew(project.ctx(), "about", { moduleRoot: "src/mod", title: "About" });

    assert.deepEqual(listFlows(project.ctx()), [
      { slug: "about", flowId: "about", title: "About" },
      { slug: "demo", flowId: "demo_flow", title: "Demo" },
    ]);
  });

  it("should return an empty list without flows", () => {
    const empty = createDemoProject({ withFlow: false });
    try {
      assert.deepEqual(listFlows(empty.ctx()), []);
    } finally {
      empty.cleanup();
    }
  });
});
