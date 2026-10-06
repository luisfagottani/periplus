import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "vitest";

import {
  type DevRebuild,
  isWatchedDocFile,
  rebuildOnce,
  runDev,
} from "../../src/use-cases/dev.ts";
import { createDemoProject, type DemoProject } from "../helpers/project.ts";

describe("isWatchedDocFile", () => {
  it("should watch docs and flow roots but never generated output", () => {
    assert.equal(isWatchedDocFile("screens/Home/Home.periplus.ts"), true);
    assert.equal(isWatchedDocFile("screens/Home/Home.periplus.mdx"), true);
    assert.equal(isWatchedDocFile("checkout/index.mdx"), true);
    assert.equal(isWatchedDocFile("checkout/generated/index.mdx"), false);
    assert.equal(isWatchedDocFile("screens/Home/Home.tsx"), false);
  });
});

describe("dev", () => {
  let project: DemoProject;

  beforeEach(() => {
    project = createDemoProject();
  });

  afterEach(() => {
    project.cleanup();
  });

  it("rebuildOnce should report generated files and the trigger", () => {
    const rebuild = rebuildOnce(project.ctx(), "initial build");

    assert.equal(rebuild.reason, "initial build");
    assert.equal(rebuild.error, undefined);
    assert.ok(
      rebuild.changed.includes("flows/demo/generated/flow.manifest.json")
    );
  });

  it("rebuildOnce should capture errors instead of throwing", () => {
    const ctx = project.ctx();
    project.cleanup();
    project.write("flows/demo/index.mdx", "---\nnot: [valid\n---\n");

    const rebuild = rebuildOnce(ctx, "index.mdx");

    assert.ok(rebuild.error instanceof Error || rebuild.issues.length > 0);
  });

  it("runDev should build once, watch the scan roots and close cleanly", () => {
    const rebuilds: DevRebuild[] = [];

    const watcher = runDev(project.ctx(), {
      onRebuild: (rebuild) => rebuilds.push(rebuild),
    });
    watcher.close();

    assert.equal(rebuilds.length, 1);
    assert.equal(rebuilds[0].reason, "initial build");
    assert.ok(watcher.dirs.length > 0);
  });
});
