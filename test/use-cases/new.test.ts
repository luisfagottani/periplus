import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "vitest";

import { runNew, validateFlowSlug } from "../../src/use-cases/new.ts";
import { createDemoProject, type DemoProject } from "../helpers/project.ts";

describe("validateFlowSlug", () => {
  it("should accept kebab-case and reject anything else", () => {
    assert.equal(validateFlowSlug("checkout"), undefined);
    assert.equal(validateFlowSlug("pix-payment"), undefined);
    assert.match(validateFlowSlug("Checkout") ?? "", /use kebab-case/);
    assert.match(validateFlowSlug("pix_payment") ?? "", /use kebab-case/);
    assert.match(validateFlowSlug("") ?? "", /use kebab-case/);
  });
});

describe("runNew", () => {
  let project: DemoProject;

  beforeEach(() => {
    project = createDemoProject({ withFlow: false });
  });

  afterEach(() => {
    project.cleanup();
  });

  it("should create the flow root with a snake_case flowId and the only domain", () => {
    const file = runNew(project.ctx(), "pix-payment", {
      moduleRoot: "src/mod",
    });
    const content = project.read(file);

    assert.equal(file, "flows/pix-payment/index.mdx");
    assert.match(content, /flowId: pix_payment/);
    assert.match(content, /domain: app/);
    assert.match(content, /moduleRoot: src\/mod/);
  });

  it("should refuse to overwrite an existing flow", () => {
    runNew(project.ctx(), "checkout", { moduleRoot: "src/mod" });

    assert.throws(() =>
      runNew(project.ctx(), "checkout", { moduleRoot: "src/mod" })
    );
  });

  it("should reject invalid slugs and missing module roots", () => {
    assert.throws(
      () => runNew(project.ctx(), "Bad", { moduleRoot: "src/mod" }),
      /kebab-case/
    );
    assert.throws(() =>
      runNew(project.ctx(), "checkout", { moduleRoot: "src/missing" })
    );
  });
});
