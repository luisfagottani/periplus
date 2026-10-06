import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "vitest";

import { analyze } from "../src/analyze.ts";
import { type Ctx, loadContext } from "../src/context.ts";
import type { FlowManifest } from "../src/manifest.ts";
import { normalizeLinkRef } from "../src/schema.ts";
import { runBuild } from "../src/use-cases/build.ts";
import { runCheck } from "../src/use-cases/check.ts";
import { runInit } from "../src/use-cases/init.ts";
import { runNode } from "../src/use-cases/node.ts";
import { EMBEDDED_SKILL, runSkill } from "../src/use-cases/skill.ts";
import { runStamp } from "../src/use-cases/stamp.ts";

let root: string;

function write(relative: string, content: string) {
  const absolute = path.join(root, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}

function read(relative: string): string {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function ctx(): Ctx {
  return loadContext({ root, cwd: root });
}

const INDEX = `---
flowId: demo_flow
title: Demo
domain: app
moduleRoot: src/mod
entry:
  summary: The user opens the demo.
---

Flow narrative.
`;

const TYPES_IMPORT =
  "import type { ScreenDoc } from '../../../../flows/demo/generated/+flow.types';";

const LOADING = `${TYPES_IMPORT}

export default {
  flowId: 'demo_flow',
  type: 'loading',
  branches: [
    {
      branchId: 'default',
      label: 'Loading',
      incoming: [{ from: 'flow:entry', reason: 'opened the flow' }],
      outgoing: [
        { to: 'FormScreen', reason: 'data ok' },
        { outcome: 'error', reason: 'API failed', ux: 'Toast + goBack' },
      ],
      apis: [{ endpoint: 'GET /demo', when: 'on mount', effect: 'read' }],
    },
  ],
} satisfies ScreenDoc;
`;

const FORM = `${TYPES_IMPORT}

export default {
  flowId: 'demo_flow',
  // comment that stamp must preserve
  branches: [
    {
      branchId: 'default',
      label: 'Form',
      incoming: [{ from: 'LoadingScreen', reason: 'data ok' }],
      outgoing: [{ to: 'flow:other_flow', reason: 'submitted' }],
    },
  ],
} satisfies ScreenDoc;
`;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "periplus-"));
  write(
    "periplus.config.json",
    JSON.stringify({
      project: "demo",
      externalFlows: { other_flow: { title: "Other flow" } },
    })
  );
  write(
    "src/mod/screens/LoadingScreen/LoadingScreen.tsx",
    "export const Loading = () => null;\n"
  );
  write(
    "src/mod/screens/FormScreen/FormScreen.tsx",
    "export const Form = () => null;\n"
  );
  write("flows/demo/index.mdx", INDEX);
  write("src/mod/screens/LoadingScreen/LoadingScreen.periplus.ts", LOADING);
  write(
    "src/mod/screens/LoadingScreen/LoadingScreen.periplus.mdx",
    "Loading body.\n"
  );
  write("src/mod/screens/FormScreen/FormScreen.periplus.ts", FORM);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("normalizeLinkRef", () => {
  it("should expand a bare screen ref to the default branch", () => {
    assert.equal(normalizeLinkRef("FormScreen"), "FormScreen:default");
    assert.equal(normalizeLinkRef("Loading:start"), "Loading:start");
    assert.equal(normalizeLinkRef("flow:entry"), "flow:entry");
  });
});

describe("build", () => {
  it("should mirror outgoing/incoming into the manifest, with synthetic error terminal", () => {
    runBuild(ctx(), { hub: false });
    const manifest = JSON.parse(
      read("flows/demo/generated/flow.manifest.json")
    ) as FlowManifest;

    const ids = manifest.nodes.map((n) => n.id);
    assert.deepEqual(ids.sort(), [
      "FormScreen:default",
      "LoadingScreen:default",
      "LoadingScreen:default::error",
      "flow:entry",
      "flow:other_flow",
    ]);

    const edges = manifest.edges.map((e) => `${e.source}->${e.target}`);
    assert.ok(edges.includes("flow:entry->LoadingScreen:default"));
    assert.ok(edges.includes("LoadingScreen:default->FormScreen:default"));
    assert.ok(edges.includes("FormScreen:default->flow:other_flow"));
    assert.equal(
      edges.filter((e) => e === "LoadingScreen:default->FormScreen:default")
        .length,
      1
    );
  });

  it("should generate a node id union for typed links", () => {
    runBuild(ctx(), { hub: false });
    const types = read("flows/demo/generated/+flow.types.ts");
    assert.match(
      types,
      /export type DemoFlowNodeId =\n {2}\| "LoadingScreen:default"\n {2}\| "FormScreen:default";/
    );
    assert.match(
      read("flows/generated/+flows.catalog.ts"),
      /export type ExternalFlowId =\n {2}\| "other_flow";/
    );
  });

  it("should report stale generated files in check mode", () => {
    runBuild(ctx(), { hub: false });
    assert.deepEqual(runBuild(ctx(), { check: true }).stale, []);

    write(
      "src/mod/screens/FormScreen/FormScreen.periplus.ts",
      FORM.replace("label: 'Form'", "label: 'New form'")
    );
    const { stale } = runBuild(ctx(), { check: true });
    assert.ok(stale.includes("flows/demo/generated/flow.manifest.json"));
  });
});

describe("check", () => {
  it("should flag unknown targets and missing error paths", () => {
    write(
      "src/mod/screens/FormScreen/FormScreen.periplus.ts",
      FORM.replace("flow:other_flow", "Nope").replace(
        "label: 'Form',",
        "label: 'Form',\n      type: 'loading',"
      )
    );
    const codes = analyze(ctx()).issues.map((i) => i.code);
    assert.ok(codes.includes("unknown-target"));
    assert.ok(codes.includes("missing-error-path"));
  });

  it("should warn when an incoming link has no matching outgoing link", () => {
    write(
      "src/mod/screens/LoadingScreen/LoadingScreen.periplus.ts",
      LOADING.replace("        { to: 'FormScreen', reason: 'data ok' },\n", "")
    );
    const symmetry = analyze(ctx()).issues.filter((i) => i.code === "symmetry");
    assert.equal(symmetry.length, 1);
  });

  it("should mark a doc as stale after the component code changes", () => {
    runStamp(ctx(), {
      files: ["src/mod/screens/FormScreen/FormScreen.periplus.ts"],
    });
    assert.ok(!analyze(ctx()).issues.some((i) => i.code === "stale"));

    write(
      "src/mod/screens/FormScreen/FormScreen.tsx",
      'export const Form = () => "changed";\n'
    );
    const stale = analyze(ctx()).issues.filter((i) => i.code === "stale");
    assert.equal(stale.length, 1);
    assert.equal(
      stale[0].file,
      "src/mod/screens/FormScreen/FormScreen.periplus.ts"
    );
  });

  it("should ignore test files when fingerprinting", () => {
    runStamp(ctx(), { files: [], flow: "demo_flow" });
    write(
      "src/mod/screens/FormScreen/__tests__/FormScreen.test.tsx",
      'it("x", () => {});\n'
    );
    assert.ok(!analyze(ctx()).issues.some((i) => i.code === "stale"));
  });

  it("should fail on errors and stale generated output", () => {
    runBuild(ctx(), { hub: false });
    assert.equal(
      runCheck(ctx(), { failOn: "error", format: "text", changedFiles: [] })
        .failed,
      false
    );

    write(
      "src/mod/screens/FormScreen/FormScreen.periplus.ts",
      FORM.replace("flowId: 'demo_flow'", "flowId: 'missing_flow'")
    );
    assert.equal(
      runCheck(ctx(), { failOn: "error", format: "text", changedFiles: [] })
        .failed,
      true
    );
  });
});

describe("node", () => {
  it("should scaffold a colocated doc and add branches to an existing one", () => {
    write("src/mod/screens/NewScreen/NewScreen.tsx", "export default null;\n");
    const created = runNode(ctx(), "demo", {
      path: "src/mod/screens/NewScreen",
    });
    assert.equal(
      created.file,
      "src/mod/screens/NewScreen/NewScreen.periplus.ts"
    );
    assert.match(read(created.file), /flowId: 'demo_flow'/);
    assert.match(
      read(created.file),
      /from '\.\.\/\.\.\/\.\.\/\.\.\/flows\/demo\/generated\/\+flow\.types';/
    );
    assert.ok(
      fs.existsSync(
        path.join(root, "src/mod/screens/NewScreen/NewScreen.periplus.mdx")
      )
    );

    runNode(ctx(), "demo_flow", {
      path: "src/mod/screens/NewScreen",
      branch: "second",
      label: "Second role",
    });
    const analysis = analyze(ctx(), { skipFingerprint: true });
    const ids = analysis.models[0].manifest.nodes.map((n) => n.id);
    assert.ok(ids.includes("NewScreen:default"));
    assert.ok(ids.includes("NewScreen:second"));
  });

  it("should refuse folders outside the flow moduleRoot", () => {
    write("src/other/Thing/Thing.tsx", "export default null;\n");
    assert.throws(
      () => runNode(ctx(), "demo", { path: "src/other/Thing" }),
      /outside the flow moduleRoot/
    );
  });
});

describe("domains", () => {
  it("should accept any domain when none is configured and list it in the catalog", () => {
    runBuild(ctx(), { hub: false });
    assert.ok(!analyze(ctx()).issues.some((i) => i.code === "unknown-domain"));
    assert.deepEqual(
      JSON.parse(read("flows/generated/flows.catalog.json")).domains,
      [{ id: "app", label: "app" }]
    );
  });

  it("should flag a domain missing from the config and keep the configured order and labels", () => {
    write(
      "periplus.config.json",
      JSON.stringify({
        project: "demo",
        domains: { web: "Web", app: "Mobile app" },
      })
    );
    runBuild(ctx(), { hub: false });
    assert.deepEqual(
      JSON.parse(read("flows/generated/flows.catalog.json")).domains.map(
        (d: { label: string }) => d.label
      ),
      ["Web", "Mobile app"]
    );

    write(
      "periplus.config.json",
      JSON.stringify({ project: "demo", domains: { web: "Web" } })
    );
    const issue = analyze(ctx()).issues.find(
      (i) => i.code === "unknown-domain"
    );
    assert.equal(issue?.file, "flows/demo/index.mdx");
  });
});

describe("init", () => {
  it("should copy the site template and create the config in an empty project", async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "periplus-init-"));
    try {
      const result = await runInit({ cwd: empty });
      assert.equal(result.hubDir, "docs/periplus");
      assert.equal(result.config, "created");
      assert.ok(
        fs.existsSync(path.join(empty, "docs/periplus/astro.config.mjs"))
      );
      assert.ok(fs.existsSync(path.join(empty, "docs/periplus/.gitignore")));
      assert.ok(!fs.existsSync(path.join(empty, "docs/periplus/gitignore")));

      const config = JSON.parse(
        fs.readFileSync(path.join(empty, "periplus.config.json"), "utf8")
      );
      assert.equal(config.hubDir, "docs/periplus");
      assert.equal(config.site.title, path.basename(empty));
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  it("should keep existing files unless forced and update hubDir in an existing config", async () => {
    write("site/src/content/docs/index.mdx", "my home\n");
    const first = await runInit({ cwd: root, dir: "site" });
    assert.ok(first.skipped.includes("src/content/docs/index.mdx"));
    assert.equal(read("site/src/content/docs/index.mdx"), "my home\n");
    assert.equal(first.config, "updated");
    assert.equal(JSON.parse(read("periplus.config.json")).hubDir, "site");
    assert.equal(
      JSON.parse(read("periplus.config.json")).externalFlows.other_flow.title,
      "Other flow"
    );

    const forced = await runInit({ cwd: root, dir: "site", force: true });
    assert.equal(forced.skipped.length, 0);
    assert.notEqual(read("site/src/content/docs/index.mdx"), "my home\n");
  });
});

describe("ts docs", () => {
  it("should read the body from the sibling .periplus.mdx and type links in the generated ScreenDoc", () => {
    runBuild(ctx(), { hub: false });
    const manifest = JSON.parse(
      read("flows/demo/generated/flow.manifest.json")
    ) as FlowManifest;
    assert.equal(
      manifest.screens.find((screen) => screen.screenRef === "LoadingScreen")
        ?.body,
      "Loading body."
    );
    assert.equal(
      manifest.screens.find((screen) => screen.screenRef === "FormScreen")
        ?.body,
      ""
    );

    const types = read("flows/demo/generated/+flow.types.ts");
    assert.match(
      types,
      /export type DemoFlowLinkTarget =\n {2}\| "LoadingScreen"\n {2}\| "FormScreen"\n {2}\| DemoFlowNodeId/
    );
    assert.match(
      types,
      /export type ScreenDoc = PeriplusScreenDoc<typeof FLOW_ID, LinkTarget>;/
    );
    const docTypes = read("flows/generated/+periplus.types.ts");
    assert.match(
      docTypes,
      /export type PeriplusScreenDoc<Flow extends string, Target extends string>/
    );
    for (const field of [
      "from",
      "to",
      "outcome",
      "reason",
      "ux",
      "flowId",
      "branchId",
      "id",
      "endpoint",
    ]) {
      assert.match(
        docTypes,
        new RegExp(`\\*/\\n\\s*${field}\\??: `),
        `field without JSDoc: ${field}`
      );
    }
    assert.ok((docTypes.match(/Business condition/g) ?? []).length >= 3);
    assert.match(
      read("flows/generated/+flows.catalog.ts"),
      /\/\*\* Repo-relative path to the `<Folder>\.periplus\.ts`/
    );
  });

  it("should reject runtime imports and invalid syntax as invalid-doc", () => {
    write(
      "src/mod/screens/FormScreen/FormScreen.periplus.ts",
      `import { x } from './x';\nexport default { flowId: x };\n`
    );
    write(
      "src/mod/screens/LoadingScreen/LoadingScreen.periplus.ts",
      "export default { flowId: "
    );
    const invalid = analyze(ctx()).issues.filter(
      (i) => i.code === "invalid-doc"
    );
    assert.equal(invalid.length, 2);
    assert.ok(invalid.some((i) => /import type/.test(i.message)));
  });

  it("should stamp only lastReviewed/codeFingerprint, keeping comments, and ignore the doc itself in the hash", () => {
    const file = "src/mod/screens/FormScreen/FormScreen.periplus.ts";
    runStamp(ctx(), { files: [file] });
    const stamped = read(file);
    assert.match(stamped, /\/\/ comment that stamp must preserve/);
    assert.match(
      stamped,
      /lastReviewed: '\d{4}-\d{2}-\d{2}',\n {2}codeFingerprint: 'sha256:[0-9a-f]{16}',\n\} satisfies ScreenDoc;/
    );
    assert.equal(
      stamped.replace(/\n {2}lastReviewed: .*\n {2}codeFingerprint: .*,/, ""),
      FORM
    );

    runStamp(ctx(), { files: [file] });
    assert.equal(read(file), stamped);
    assert.ok(!analyze(ctx()).issues.some((i) => i.code === "stale"));
  });

  it("should append a branch to the branches array of an existing doc", () => {
    runNode(ctx(), "demo", {
      path: "src/mod/screens/FormScreen",
      branch: "review",
      label: "Review",
    });
    const source = read("src/mod/screens/FormScreen/FormScreen.periplus.ts");
    assert.match(
      source,
      /\n {4}\{\n {6}branchId: 'review',\n {6}label: 'Review',/
    );
    const ids = analyze(ctx(), {
      skipFingerprint: true,
    }).models[0].manifest.nodes.map((n) => n.id);
    assert.ok(ids.includes("FormScreen:review"));
  });

  it("should warn about a product body without its .periplus.ts", () => {
    write("src/mod/screens/Lonely/Lonely.periplus.mdx", "text\n");
    const issue = analyze(ctx()).issues.find((i) => i.code === "orphan-body");
    assert.equal(issue?.file, "src/mod/screens/Lonely/Lonely.periplus.mdx");
  });
});

describe("skill", () => {
  it("should install the packaged skill, keep local edits without --force and overwrite with it", () => {
    const file = ".cursor/skills/periplus-docs/SKILL.md";
    assert.deepEqual(runSkill({ cwd: root }), { file, status: "created" });
    assert.equal(read(file), fs.readFileSync(EMBEDDED_SKILL, "utf8"));
    assert.equal(runSkill({ cwd: root }).status, "unchanged");

    write(file, "edited locally\n");
    assert.equal(runSkill({ cwd: root }).status, "outdated");
    assert.equal(read(file), "edited locally\n");
    assert.equal(runSkill({ cwd: root, force: true }).status, "updated");
    assert.equal(read(file), fs.readFileSync(EMBEDDED_SKILL, "utf8"));
  });

  it("should honor --dir and keep the packaged skill free of project-specific names", () => {
    assert.equal(
      runSkill({ cwd: root, dir: ".agents/skills" }).file,
      ".agents/skills/periplus-docs/SKILL.md"
    );
    assert.match(
      fs.readFileSync(EMBEDDED_SKILL, "utf8"),
      /^---\nname: periplus-docs\n/
    );
  });
});
