import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "vitest";

import { EXIT_CANCELLED, main } from "../../src/cli/main.ts";
import { packageVersion } from "../../src/utils/paths.ts";
import { createDemoProject, type DemoProject } from "../helpers/project.ts";
import { fakeRuntime } from "../helpers/runtime.ts";
import { hasAnsi } from "../helpers/streams.ts";

let project: DemoProject;

beforeEach(() => {
  project = createDemoProject();
});

afterEach(() => {
  project.cleanup();
});

async function run(argv: string[], env?: NodeJS.ProcessEnv) {
  const runtime = fakeRuntime(project.root, { env });
  const code = await main(argv, runtime);
  return { code, out: runtime.stdout.text(), err: runtime.stderr.text() };
}

describe("main: global behavior", () => {
  it("should print the package version", async () => {
    const { code, out } = await run(["--version"]);

    assert.equal(code, 0);
    assert.equal(out, `${packageVersion()}\n`);
  });

  it("should print help and exit 1 without a command, 0 with --help", async () => {
    const bare = await run([]);
    const help = await run(["--help"]);

    assert.equal(bare.code, 1);
    assert.match(bare.out, /Usage: periplus <command>/);
    assert.equal(help.code, 0);
  });

  it("should print command help for `<command> --help` and `help <command>`", async () => {
    const flag = await run(["build", "--help"]);
    const sub = await run(["help", "build"]);

    assert.equal(flag.code, 0);
    assert.match(flag.out, /Usage: periplus build \[--check\]/);
    assert.equal(sub.out, flag.out);
  });

  it("should suggest the closest command for typos", async () => {
    const { code, err } = await run(["biuld"]);

    assert.equal(code, 1);
    assert.match(err, /✗ unknown command: biuld/);
    assert.match(err, /Did you mean periplus build\?/);
  });

  it("should report usage errors with a pointer to --help", async () => {
    const { code, err } = await run(["check", "--fail-on", "nope"]);

    assert.equal(code, 1);
    assert.match(err, /invalid --fail-on: nope/);
    assert.match(err, /periplus --help/);
  });

  it("should print runtime errors as `✗ message` and exit 1", async () => {
    project.cleanup();
    const { code, err } = await run(["build"]);

    assert.equal(code, 1);
    assert.match(err, /✗ periplus.config.json not found/);
  });

  it("should never emit ANSI codes when stdout is not a terminal", async () => {
    const { out } = await run(["build"]);

    assert.equal(hasAnsi(out), false);
  });

  it("should emit colors with FORCE_COLOR even without a terminal", async () => {
    const { out } = await run(["build"], { FORCE_COLOR: "1" });

    assert.equal(hasAnsi(out), true);
  });
});

describe("main: commands", () => {
  it("build should list regenerated files and the summary", async () => {
    const { code, out } = await run(["build", "--no-hub"]);

    assert.equal(code, 0);
    assert.match(out, /↻ flows\/demo\/generated\/flow\.manifest\.json/);
    assert.match(out, /1 flow\(s\), \d+ file\(s\) updated\./);
  });

  it("build --check should fail before a build and pass after it", async () => {
    const before = await run(["build", "--check", "--no-hub"]);
    await run(["build", "--no-hub"]);
    const after = await run(["build", "--check", "--no-hub"]);

    assert.equal(before.code, 1);
    assert.match(before.err, /stale files:/);
    assert.equal(after.code, 0);
    assert.match(after.out, /✓ generated\/ is up to date\./);
  });

  it("check should pass on a stamped and freshly built project", async () => {
    await run(["stamp", "--flow", "demo"]);
    await run(["build"]);
    const { code, out } = await run(["check"]);

    assert.equal(code, 0);
    assert.equal(out, "✓ periplus: no issues found.\n");
  });

  it("check --fail-on warning should fail on unstamped docs", async () => {
    await run(["build"]);
    const { code, out } = await run(["check", "--fail-on", "warning"]);

    assert.equal(code, 1);
    assert.match(out, /! \[missing-fingerprint\]/);
  });

  it("check --format json should print parseable JSON even with FORCE_COLOR", async () => {
    const { code, out } = await run(["check", "--format", "json"], {
      FORCE_COLOR: "1",
    });

    const report = JSON.parse(out) as {
      failed: boolean;
      generatedStale: string[];
    };
    assert.equal(hasAnsi(out), false);
    assert.equal(code, 1);
    assert.equal(report.failed, true);
    assert.ok(report.generatedStale.length > 0);
  });

  it("check --output should write a plain report file", async () => {
    await run(["build"]);
    const { out, err } = await run(["check", "--output", "report.txt"], {
      FORCE_COLOR: "1",
    });

    assert.match(`${out}${err}`, /report written to report\.txt/);
    assert.equal(hasAnsi(project.read("report.txt")), false);
  });

  it("new should require the slug when prompts are unavailable", async () => {
    const { code, err } = await run(["new"]);

    assert.equal(code, 1);
    assert.match(err, /usage: new <slug>/);
  });

  it("new should create the flow root and print the next step", async () => {
    const { code, out } = await run([
      "new",
      "checkout",
      "--module-root",
      "src/mod",
    ]);

    assert.equal(code, 0);
    assert.match(out, /\+ flows\/checkout\/index\.mdx/);
    assert.match(out, /periplus node checkout/);
    assert.ok(project.exists("flows/checkout/index.mdx"));
  });

  it("node should require the flow when prompts are unavailable", async () => {
    const { code, err } = await run(["node"]);

    assert.equal(code, 1);
    assert.match(err, /usage: node <flow>/);
  });

  it("stamp should explain how to select docs when nothing is passed", async () => {
    const { code, err } = await run(["stamp"]);

    assert.equal(code, 1);
    assert.match(err, /✗ pass files, --flow <flow> or --stale/);
  });

  it("stamp --flow should stamp the flow docs, then --stale finds nothing", async () => {
    const flow = await run(["stamp", "--flow", "demo"]);
    const stale = await run(["stamp", "--stale"]);

    assert.equal(flow.code, 0);
    assert.match(
      flow.out,
      /✓ src\/mod\/screens\/HomeScreen\/HomeScreen\.periplus\.ts/
    );
    assert.equal(stale.out, "Nothing to stamp.\n");
  });

  it("init should install the bundled site without prompting in CI", async () => {
    const { code, out } = await run(["init", "site"]);

    assert.equal(code, 0);
    assert.match(out, /\+ \d+ file\(s\) in site/);
    assert.match(out, /~ periplus\.config\.json hubDir\/site updated/);
    assert.match(out, /npm install --prefix site/);
    assert.ok(project.exists("site/package.json"));
  });

  it("should expose the cancellation exit code", () => {
    assert.equal(EXIT_CANCELLED, 130);
  });
});
