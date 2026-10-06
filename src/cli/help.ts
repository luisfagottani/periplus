import { DEFAULT_SITE_DIR } from "../use-cases/init.ts";
import { DEFAULT_SKILLS_DIR } from "../use-cases/skill.ts";
import type { Theme } from "./ui/theme.ts";

/** Help entry for one command. */
export interface CommandHelp {
  name: string;
  /** Arguments and flags after the command name. */
  usage: string;
  /** One sentence per line. */
  description: readonly string[];
}

/** Help for every command, in the order shown by `periplus --help`. */
export const COMMAND_HELP: readonly CommandHelp[] = [
  {
    name: "init",
    usage: "[dir] [--template <source>] [--force]",
    description: [
      `Installs the site (Astro + Starlight) in [dir] (default ${DEFAULT_SITE_DIR}) and writes hubDir/site to the config.`,
      "--template downloads the theme with giget (e.g. gh:org/repo/templates/starlight); defaults to the bundled one.",
      "Without [dir] in an interactive terminal, asks for the folder and template.",
    ],
  },
  {
    name: "skill",
    usage: "[--dir <dir>] [--force]",
    description: [
      `Installs the agent skill (periplus-docs) at <dir>/periplus-docs/SKILL.md (default ${DEFAULT_SKILLS_DIR}).`,
      "Never overwrites without --force; warns when the local copy differs from the packaged version.",
    ],
  },
  {
    name: "new",
    usage:
      "<slug> --module-root <dir> [--id <flow_id>] [--title <t>] [--domain <d>]",
    description: [
      "Creates flows/<slug>/index.mdx (the flow root).",
      "Asks for the missing slug/module root in an interactive terminal.",
    ],
  },
  {
    name: "node",
    usage:
      "<flow> [--path <dir>] [--branch <id>] [--type <type>] [--label <t>] [--suggest]",
    description: [
      "Creates <Folder>.periplus.ts (+ .periplus.mdx body) in the screen folder (or adds a branch) and regenerates types.",
      "Lets you pick the flow from a list when <flow> is omitted in an interactive terminal.",
    ],
  },
  {
    name: "suggest",
    usage: "[dir]",
    description: [
      "Extracts candidates (APIs, navigations, errors) with file:line evidence to review and paste.",
    ],
  },
  {
    name: "stamp",
    usage: "[files...] [--flow <flow>] [--stale]",
    description: [
      "Marks docs as reviewed: updates codeFingerprint and lastReviewed.",
    ],
  },
  {
    name: "check",
    usage:
      "[--fail-on error|stale|warning] [--format text|markdown|json] [--output <file>]",
    description: [
      "Validates schema, components, links, missing error paths, stale docs and generated/.",
      "PR changed files: env PERIPLUS_CHANGED (JSON array or space-separated list).",
    ],
  },
  {
    name: "build",
    usage: "[--check] [--no-hub]",
    description: [
      "Generates manifests, types (+flow.types.ts, +periplus.types.ts), catalog, flow.context.md, Mermaid and site pages.",
    ],
  },
  {
    name: "dev",
    usage: "",
    description: [
      "build + watch (regenerates on every save of .periplus.ts / .periplus.mdx / index.mdx).",
    ],
  },
];

const GLOBAL_FLAGS: readonly [string, string][] = [
  ["-y, --yes", "never prompt; use flags and defaults (implied by CI=true)"],
  ["-h, --help", "show help (also `periplus <command> --help`)"],
  ["-v, --version", "print the installed version"],
];

const ENVIRONMENT: readonly [string, string][] = [
  ["NO_COLOR", "disable colors"],
  ["FORCE_COLOR", "force colors (e.g. when piping to a pager)"],
  ["CI", "non-interactive mode: no prompts, no spinners"],
  ["PERIPLUS_CHANGED", "files changed in the PR, used by `check`"],
];

function table(theme: Theme, rows: readonly [string, string][]): string[] {
  const width = Math.max(...rows.map(([left]) => left.length));
  return rows.map(
    ([left, right]) => `  ${theme.code(left.padEnd(width))}  ${right}`
  );
}

function commandBlock(theme: Theme, command: CommandHelp): string[] {
  const head = `  ${theme.bold(command.name)}${command.usage ? ` ${theme.dim(command.usage)}` : ""}`;
  return [head, ...command.description.map((line) => `      ${line}`)];
}

/**
 * Full help screen for `periplus --help`.
 *
 * @param theme - Palette (use the plain theme for non-terminal output).
 * @returns Multi-line help text.
 */
export function renderHelp(theme: Theme): string {
  return [
    `${theme.bold("periplus")} ${theme.dim("— living documentation for product flows")}`,
    "",
    `${theme.bold("Usage:")} periplus ${theme.code("<command>")} [options]`,
    "",
    theme.bold("Commands:"),
    ...COMMAND_HELP.flatMap((command) => [...commandBlock(theme, command), ""]),
    theme.bold("Global options:"),
    ...table(theme, GLOBAL_FLAGS),
    "",
    theme.bold("Environment:"),
    ...table(theme, ENVIRONMENT),
  ].join("\n");
}

/**
 * Help for a single command (`periplus <command> --help`).
 *
 * @param name - Command name.
 * @param theme - Palette.
 * @returns The help text, or `undefined` for unknown commands.
 */
export function renderCommandHelp(
  name: string,
  theme: Theme
): string | undefined {
  const command = COMMAND_HELP.find((entry) => entry.name === name);
  if (!command) {
    return;
  }
  return [
    `${theme.bold("Usage:")} periplus ${theme.bold(command.name)}${command.usage ? ` ${command.usage}` : ""}`,
    "",
    ...command.description.map((line) => `  ${line}`),
    "",
    theme.bold("Global options:"),
    ...table(theme, GLOBAL_FLAGS),
  ].join("\n");
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let [diagonal] = row;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diagonal = above;
    }
  }
  return row[b.length];
}

/**
 * Suggests the command the user probably meant (`biuld` → `build`).
 *
 * @param input - Unknown command typed by the user.
 * @param names - Known command names.
 * @returns The closest name within two edits, or `undefined`.
 */
export function closestCommand(
  input: string,
  names: readonly string[]
): string | undefined {
  let best: { name: string; distance: number } | undefined;
  for (const name of names) {
    const distance = editDistance(input.toLowerCase(), name);
    if (distance <= 2 && (!best || distance < best.distance)) {
      best = { name, distance };
    }
  }
  return best?.name;
}
