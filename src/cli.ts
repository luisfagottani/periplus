#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { runBuild } from "./commands/build.ts";
import { parseChangedFiles, runCheck } from "./commands/check.ts";
import { runDev } from "./commands/dev.ts";
import { DEFAULT_SITE_DIR, runInit } from "./commands/init.ts";
import { runNew } from "./commands/new.ts";
import { runNode } from "./commands/node.ts";
import { DEFAULT_SKILLS_DIR, runSkill } from "./commands/skill.ts";
import { runStamp } from "./commands/stamp.ts";
import { runSuggest } from "./commands/suggest.ts";
import { loadContext } from "./context.ts";
import { packageRoot } from "./paths.ts";
import { type FailOn, renderText } from "./report.ts";

const HELP = `periplus — living documentation for product flows

Usage: periplus <command> [options]
       periplus --version | --help

  init [dir] [--template <source>] [--force]
      Installs the site (Astro + Starlight) in [dir] (default ${DEFAULT_SITE_DIR}) and writes hubDir/site to the config.
      --template downloads the theme with giget (e.g. gh:org/repo/templates/starlight); defaults to the bundled one.

  skill [--dir <dir>] [--force]
      Installs the agent skill (periplus-docs) at <dir>/periplus-docs/SKILL.md (default ${DEFAULT_SKILLS_DIR}).
      Never overwrites without --force; warns when the local copy differs from the packaged version.

  new <slug> --module-root <dir> [--id <flow_id>] [--title <t>] [--domain <d>]
      Creates flows/<slug>/index.mdx (the flow root).

  node <flow> [--path <dir>] [--branch <id>] [--type <type>] [--label <t>] [--suggest]
      Creates <Folder>.periplus.ts (+ .periplus.mdx body) in the screen folder (or adds a branch) and regenerates types.

  suggest [dir]
      Extracts candidates (APIs, navigations, errors) with file:line evidence to review and paste.

  stamp [files...] [--flow <flow>] [--stale]
      Marks docs as reviewed: updates codeFingerprint and lastReviewed.

  check [--fail-on error|stale|warning] [--format text|markdown|json] [--output <file>]
      Validates schema, components, links, missing error paths, stale docs and generated/.
      PR changed files: env PERIPLUS_CHANGED (JSON array or space-separated list).

  build [--check] [--no-hub]
      Generates manifests, types (+flow.types.ts, +periplus.types.ts), catalog, flow.context.md, Mermaid and site pages.

  dev
      build + watch (regenerates on every save of .periplus.ts / .periplus.mdx / index.mdx).
`;

function parse(argv: string[]) {
  return parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
      id: { type: "string" },
      title: { type: "string" },
      domain: { type: "string" },
      "module-root": { type: "string" },
      path: { type: "string" },
      branch: { type: "string" },
      type: { type: "string" },
      label: { type: "string" },
      suggest: { type: "boolean" },
      flow: { type: "string" },
      stale: { type: "boolean" },
      "fail-on": { type: "string" },
      format: { type: "string" },
      output: { type: "string" },
      check: { type: "boolean" },
      "no-hub": { type: "boolean" },
      force: { type: "boolean" },
      template: { type: "string" },
      dir: { type: "string" },
    },
  });
}

type Values = ReturnType<typeof parse>["values"];

/** Returns the exit code; -1 keeps the process alive (watch mode). */
type Command = (args: string[], values: Values) => number | Promise<number>;

const invocationCwd = () => process.env.INIT_CWD ?? process.cwd();

const init: Command = async (args, values) => {
  const result = await runInit({
    cwd: invocationCwd(),
    dir: args[0],
    force: values.force,
    template: values.template,
  });
  console.log(`+ ${result.written.length} file(s) in ${result.hubDir}`);
  if (result.skipped.length) {
    console.log(
      `= ${result.skipped.length} already existed (use --force to overwrite):\n  ${result.skipped.join("\n  ")}`
    );
  }
  const configMessage = {
    created: "+ periplus.config.json created",
    updated: "~ periplus.config.json: hubDir/site updated",
    unchanged: "= periplus.config.json already pointed to this folder",
  };
  console.log(configMessage[result.config]);
  console.log(
    `\nNext steps:\n  npm install --prefix ${result.hubDir}\n  periplus build\n  npm run dev --prefix ${result.hubDir}   # and, in another terminal: periplus dev\n  periplus skill   # agent skill to keep the docs up to date`
  );
  return 0;
};

const skill: Command = (_args, values) => {
  const result = runSkill({
    cwd: invocationCwd(),
    dir: values.dir,
    force: values.force,
  });
  const messages = {
    created: `+ ${result.file}`,
    updated: `~ ${result.file} updated to the packaged version`,
    unchanged: `= ${result.file} is already up to date`,
    outdated: `! ${result.file} differs from the packaged version (use --force to overwrite)`,
  };
  console.log(messages[result.status]);
  return 0;
};

const newFlow: Command = (args, values) => {
  if (!args[0]) {
    throw new Error("usage: new <slug> --module-root <dir>");
  }
  const ctx = loadContext();
  const file = runNew(ctx, args[0], {
    id: values.id,
    title: values.title,
    domain: values.domain,
    moduleRoot: values["module-root"],
  });
  runBuild(ctx);
  console.log(
    `+ ${file}\nNext: in each screen folder, run \`periplus node ${args[0]}\`.`
  );
  return 0;
};

const node: Command = (args, values) => {
  if (!args[0]) {
    throw new Error("usage: node <flow> [--path <dir>]");
  }
  const ctx = loadContext();
  const { file, created } = runNode(ctx, args[0], {
    path: values.path,
    branch: values.branch,
    type: values.type,
    label: values.label,
  });
  const build = runBuild(ctx);
  console.log(`${created ? "+" : "~"} ${file}`);
  console.log(`  types regenerated (${build.written.length} file(s)).`);
  if (values.suggest) {
    console.log(`  suggestions: ${runSuggest(ctx, values.path)}`);
  }
  console.log(
    "  Fill in outgoing/incoming/rules and run `periplus stamp` once reviewed."
  );
  return 0;
};

const suggest: Command = (args) => {
  console.log(`+ ${runSuggest(loadContext(), args[0])}`);
  return 0;
};

const stamp: Command = (args, values) => {
  const stamped = runStamp(loadContext(), {
    files: args,
    flow: values.flow,
    stale: values.stale,
  });
  if (!stamped.length) {
    console.log("Nothing to stamp.");
  }
  for (const file of stamped) {
    console.log(`✓ ${file}`);
  }
  return 0;
};

const check: Command = (_args, values) => {
  const failOn = (values["fail-on"] ?? "error") as FailOn;
  if (!["error", "stale", "warning"].includes(failOn)) {
    throw new Error(`invalid --fail-on: ${failOn}`);
  }
  const format = (values.format ?? "text") as "text" | "markdown" | "json";
  const { failed, report } = runCheck(loadContext(), {
    failOn,
    format,
    output: values.output,
    changedFiles: parseChangedFiles(process.env.PERIPLUS_CHANGED),
  });
  if (values.output) {
    console.log(`${failed ? "✗" : "✓"} report written to ${values.output}`);
  } else {
    console.log(report);
  }
  return failed ? 1 : 0;
};

const build: Command = (_args, values) => {
  const result = runBuild(loadContext(), {
    check: values.check,
    hub: !values["no-hub"],
  });

  if (values.check) {
    if (!result.stale.length) {
      console.log("✓ generated/ is up to date.");
      return 0;
    }
    console.error(
      `✗ run \`periplus build\`; stale files:\n  ${result.stale.join("\n  ")}`
    );
    return 1;
  }

  for (const file of result.written) {
    console.log(`↻ ${file}`);
  }
  for (const file of result.removed) {
    console.log(`- ${file}`);
  }
  console.log(
    `${result.analysis.models.length} flow(s), ${result.written.length} file(s) updated.`
  );
  const errors = result.analysis.issues.filter(
    (issue) => issue.level === "error"
  );
  if (errors.length) {
    console.log(`\n${renderText(errors)}`);
  }
  return 0;
};

const dev: Command = () => {
  runDev(loadContext());
  return -1;
};

const COMMANDS: Record<string, Command> = {
  init,
  skill,
  new: newFlow,
  node,
  suggest,
  stamp,
  check,
  build,
  dev,
};

function main(argv: string[]): number | Promise<number> {
  const { values, positionals } = parse(argv);
  const [command, ...args] = positionals;
  if (values.version) {
    const { version } = JSON.parse(
      fs.readFileSync(path.join(packageRoot(), "package.json"), "utf8")
    ) as { version: string };
    console.log(version);
    return 0;
  }
  if (!command || values.help) {
    console.log(HELP);
    return command ? 0 : 1;
  }
  const handler = Object.hasOwn(COMMANDS, command)
    ? COMMANDS[command]
    : undefined;
  if (!handler) {
    console.error(`unknown command: ${command}\n\n${HELP}`);
    return 1;
  }
  return handler(args, values);
}

Promise.resolve()
  .then(() => main(process.argv.slice(2)))
  .then(
    (code) => {
      if (code >= 0) {
        process.exitCode = code;
      }
    },
    (error: Error) => {
      console.error(`✗ ${error.message}`);
      process.exitCode = 1;
    }
  );
