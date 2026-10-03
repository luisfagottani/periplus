import YAML from "yaml";

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/;

export interface ParsedMdx {
  data: unknown;
  body: string;
  yamlError?: string;
}

export function parseMdx(source: string): ParsedMdx {
  const match = FRONTMATTER.exec(source);
  if (!match) {
    return {
      data: undefined,
      body: source,
      yamlError: "missing frontmatter (the file must start with ---)",
    };
  }

  const doc = YAML.parseDocument(match[1]);
  if (doc.errors.length) {
    return {
      data: undefined,
      body: match[2],
      yamlError: doc.errors.map((e) => e.message).join("; "),
    };
  }

  return { data: doc.toJSON(), body: match[2].trim() };
}

export function stringifyMdx(data: unknown, body: string): string {
  const yaml = YAML.stringify(data, { lineWidth: 0 }).trimEnd();
  return `---\n${yaml}\n---\n\n${body.trim()}\n`;
}
