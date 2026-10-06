import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "vitest";

import type { CommandContext } from "../../../src/cli/command.ts";
import { initCommand } from "../../../src/cli/handlers/init.ts";
import { newCommand } from "../../../src/cli/handlers/new.ts";
import { nodeCommand } from "../../../src/cli/handlers/node.ts";
import { stampCommand } from "../../../src/cli/handlers/stamp.ts";
import { parseCli } from "../../../src/cli/parser.ts";
import { createLogger } from "../../../src/cli/ui/logger.ts";
import { plainTheme } from "../../../src/cli/ui/theme.ts";
import { createDemoProject, type DemoProject } from "../../helpers/project.ts";
import {
  type ScriptedPrompter,
  scriptedPrompter,
} from "../../helpers/prompter.ts";
import { fakeRuntime } from "../../helpers/runtime.ts";

let project: DemoProject;

beforeEach(() => {
  project = createDemoProject();
});

afterEach(() => {
  project.cleanup();
});

function context(
  argv: string[],
  prompter: ScriptedPrompter
): CommandContext & { out: () => string } {
  const runtime = fakeRuntime(project.root);
  const { args, values } = parseCli(argv);
  return {
    args,
    values,
    runtime,
    prompter,
    logger: createLogger({
      stdout: runtime.stdout,
      stderr: runtime.stderr,
      theme: plainTheme,
    }),
    project: project.ctx,
    out: runtime.stdout.text,
  };
}

describe("init wizard", () => {
  it("should ask for the folder and template, then install", async () => {
    const prompter = scriptedPrompter(["site", "bundled"]);

    const code = await initCommand(context(["init"], prompter));

    assert.equal(code, 0);
    assert.deepEqual(
      prompter.asked.map((prompt) => prompt.kind),
      ["text", "select"]
    );
    assert.deepEqual(prompter.tasks, ["Copying the site template"]);
    assert.ok(project.exists("site/package.json"));
  });

  it("should confirm before overwriting a folder that has files", async () => {
    project.write("site/README.md", "mine\n");
    const prompter = scriptedPrompter(["site", "bundled", false]);
    const ctx = context(["init"], prompter);

    await initCommand(ctx);

    assert.equal(prompter.asked.at(-1)?.kind, "confirm");
    assert.match(ctx.out(), /already existed/);
  });

  it("should not prompt when the folder is passed", async () => {
    const prompter = scriptedPrompter([]);

    await initCommand(context(["init", "site"], prompter));

    assert.equal(prompter.asked.length, 0);
  });
});

describe("new wizard", () => {
  it("should ask for missing slug, module root and title", async () => {
    const prompter = scriptedPrompter(["checkout", "src/mod", undefined]);
    const ctx = context(["new"], prompter);

    const code = await newCommand(ctx);

    assert.equal(code, 0);
    assert.equal(prompter.asked.length, 3);
    assert.match(project.read("flows/checkout/index.mdx"), /title: checkout/);
    assert.deepEqual(prompter.tasks, ["Regenerating types"]);
  });

  it("should reject an invalid slug through validation", async () => {
    const prompter = scriptedPrompter(["Bad Slug"]);

    await assert.rejects(
      async () => await newCommand(context(["new"], prompter)),
      /use kebab-case/
    );
  });
});

describe("node picker", () => {
  it("should offer the project's flows when <flow> is missing", async () => {
    const prompter = scriptedPrompter(["demo"]);
    project.write(
      "src/mod/screens/CartScreen/CartScreen.tsx",
      "export const Cart = () => null;\n"
    );
    const ctx = context(
      ["node", "--path", "src/mod/screens/CartScreen"],
      prompter
    );

    const code = await nodeCommand(ctx);

    assert.equal(code, 0);
    assert.deepEqual(prompter.asked[0].options, ["demo"]);
    assert.match(ctx.out(), /CartScreen\.periplus\.ts/);
  });
});

describe("stamp picker", () => {
  it("should ask what to stamp and stamp the chosen flow", async () => {
    const prompter = scriptedPrompter(["flow", "demo"]);
    const ctx = context(["stamp"], prompter);

    await stampCommand(ctx);

    assert.match(ctx.out(), /✓ src\/mod\/screens\/HomeScreen/);
  });
});
