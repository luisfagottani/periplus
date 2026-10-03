import fs from "node:fs";
import path from "node:path";

const NON_ALPHANUMERIC = /[^A-Za-z0-9]+/;
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".astro"]);

/** Lists files recursively (absolute paths), skipping heavy directories. */
export function walkFiles(
  dir: string,
  accept: (absolute: string) => boolean = () => true
): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) {
    return out;
  }

  const stack = [dir];
  while (stack.length) {
    const current = stack.pop() as string;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          stack.push(absolute);
        }
      } else if (entry.isFile() && accept(absolute)) {
        out.push(absolute);
      }
    }
  }

  return out.sort();
}

export function writeIfChanged(absolute: string, content: string): boolean {
  if (
    fs.existsSync(absolute) &&
    fs.readFileSync(absolute, "utf8") === content
  ) {
    return false;
  }
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
  return true;
}

export function kebab(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
}

export function pascal(value: string): string {
  return value
    .split(NON_ALPHANUMERIC)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
}
