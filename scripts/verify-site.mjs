#!/usr/bin/env node
/**
 * Builds the Starlight site the way a user gets it: `periplus init` + a documented flow,
 * then `npm ci`, `astro check` and `astro build` in the generated hub.
 * Needs Node 22.12+ (Astro 7). Usage: node scripts/verify-site.mjs [--keep] [path/to/cli]
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
const args = process.argv.slice(2);
const keep = args.includes("--keep");
const cli = path.resolve(
  args.find((arg) => !arg.startsWith("--")) ??
    path.join(repoRoot, "dist/cli.mjs")
);
const project = fs.mkdtempSync(path.join(os.tmpdir(), "periplus-site-"));
const hub = path.join(project, "docs/periplus");

// pnpm forwards the caller directory as INIT_CWD; it would point the CLI at this repository.
const { INIT_CWD: _callerDir, ...callerEnv } = process.env;
const env = { ...callerEnv, CI: "true" };

function write(relative, content) {
  const file = path.join(project, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function exec(command, commandArgs, cwd) {
  console.log(`$ ${command} ${commandArgs.join(" ")}`);
  execFileSync(command, commandArgs, { cwd, env, stdio: "inherit" });
}

const periplus = (...commandArgs) =>
  exec(process.execPath, [cli, ...commandArgs], project);

/** Replaces the generated doc body, keeping the `import type` line written by `periplus node`. */
function document(screen, body) {
  const file = path.join(
    project,
    `src/modules/checkout/screens/${screen}/${screen}.periplus.ts`
  );
  const [importLine] = fs.readFileSync(file, "utf8").split("\n");
  fs.writeFileSync(
    file,
    `${importLine}\n\nexport default ${body} satisfies ScreenDoc;\n`
  );
}

const CART = `{
  flowId: 'checkout',
  branches: [
    {
      branchId: 'default',
      label: 'Cart',
      summary: 'Lists the items and the total.',
      incoming: [{ from: 'flow:entry', reason: 'opened the cart' }],
      outgoing: [
        { to: 'PaymentScreen', reason: 'tapped "Pay"' },
        { outcome: 'error', reason: 'cart failed to load', ux: 'Retry banner' },
      ],
      rules: [{ id: 'min_total', summary: 'Pay is disabled below the minimum total.' }],
      apis: [{ endpoint: 'GET /cart', when: 'on mount', effect: 'read' }],
    },
  ],
}`;

const PAYMENT = `{
  flowId: 'checkout',
  branches: [
    {
      branchId: 'default',
      label: 'Payment',
      final: true,
      incoming: [{ from: 'CartScreen', reason: 'tapped "Pay"' }],
      outgoing: [
        { outcome: 'end', reason: 'payment approved' },
        { outcome: 'error', reason: 'payment declined', ux: 'Error toast' },
      ],
      apis: [{ endpoint: 'POST /payments', when: 'on submit', effect: 'write' }],
    },
  ],
}`;

try {
  write("package.json", JSON.stringify({ name: "site-app", private: true }));
  for (const screen of ["CartScreen", "PaymentScreen"]) {
    write(
      `src/modules/checkout/screens/${screen}/${screen}.tsx`,
      `export const ${screen} = () => null;\n`
    );
  }

  periplus("init");
  periplus(
    "new",
    "checkout",
    "--module-root",
    "src/modules/checkout",
    "--domain",
    "app"
  );
  for (const screen of ["CartScreen", "PaymentScreen"]) {
    periplus(
      "node",
      "checkout",
      "--path",
      `src/modules/checkout/screens/${screen}`
    );
  }
  document("CartScreen", CART);
  document("PaymentScreen", PAYMENT);
  periplus("build");
  periplus("check", "--fail-on", "error");

  // `init` never copies the lockfile; reuse it so CI installs exactly what Dependabot pinned.
  fs.copyFileSync(
    path.join(repoRoot, "templates/starlight/package-lock.json"),
    path.join(hub, "package-lock.json")
  );
  exec("npm", ["ci", "--no-audit", "--no-fund"], hub);
  exec("npm", ["run", "check"], hub);
  exec("npm", ["run", "build"], hub);

  for (const expected of [
    "dist/index.html",
    "dist/overview/index.html",
    "dist/flows/app/checkout/index.html",
    "dist/flows/app/checkout/cart-screen/index.html",
    "dist/flows/app/checkout/payment-screen/index.html",
  ]) {
    if (!fs.existsSync(path.join(hub, expected))) {
      throw new Error(`missing ${expected}`);
    }
  }
  console.log(`\n✓ site built with Node ${process.version}`);
} finally {
  if (keep) {
    console.log(`kept ${project}`);
  } else {
    fs.rmSync(project, { recursive: true, force: true });
  }
}
