#!/usr/bin/env node
/**
 * End-to-end smoke test of the built CLI in an empty project.
 * Usage: node scripts/smoke.mjs [path/to/cli]  (defaults to dist/cli.mjs)
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const cli = path.resolve(
  process.argv[2] ?? path.join(repoRoot, "dist/cli.mjs")
);
const project = fs.mkdtempSync(path.join(os.tmpdir(), "periplus-smoke-"));

// pnpm forwards the caller directory as INIT_CWD; it would point the CLI at this repository.
// stdio is inherited, so without CI=true a local terminal would make the CLI prompt and hang.
const { INIT_CWD: _callerDir, ...callerEnv } = process.env;
const env = { ...callerEnv, CI: "true" };

function write(relative, content) {
  const file = path.join(project, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function run(...args) {
  console.log(`$ periplus ${args.join(" ")}`);
  execFileSync(process.execPath, [cli, ...args], {
    cwd: project,
    env,
    stdio: "inherit",
  });
}

try {
  write("package.json", JSON.stringify({ name: "smoke-app", private: true }));
  write(
    "src/modules/checkout/screens/CartScreen/CartScreen.tsx",
    "export const CartScreen = () => null;\n"
  );

  run("init");
  run("skill");
  run(
    "new",
    "checkout",
    "--module-root",
    "src/modules/checkout",
    "--domain",
    "app"
  );
  run("node", "checkout", "--path", "src/modules/checkout/screens/CartScreen");
  run("build");
  run("build", "--check");
  run("check", "--fail-on", "error");

  for (const expected of [
    "periplus.config.json",
    "docs/periplus/astro.config.mjs",
    ".cursor/skills/periplus-docs/SKILL.md",
    "flows/checkout/index.mdx",
    "flows/checkout/generated/flow.manifest.json",
    "src/modules/checkout/screens/CartScreen/CartScreen.periplus.ts",
  ]) {
    if (!fs.existsSync(path.join(project, expected))) {
      throw new Error(`missing ${expected}`);
    }
  }
  console.log(`\n✓ smoke test passed with Node ${process.version}`);
} finally {
  fs.rmSync(project, { recursive: true, force: true });
}
