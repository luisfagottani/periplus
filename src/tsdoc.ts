import path from "node:path";
import vm from "node:vm";

import ts from "typescript";

export const BODY_SUFFIX = ".periplus.mdx";

export interface EvaluatedDoc {
  data?: unknown;
  error?: string;
}

function forbiddenRequire(spec: string): never {
  throw new Error(
    `runtime imports are not allowed ("${spec}"); docs may only use \`import type\``
  );
}

/** Runs the `.periplus.ts` in isolation and returns its `export default` as plain data. */
export function evaluateTsDoc(source: string, fileName: string): EvaluatedDoc {
  const output = ts.transpileModule(source, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      isolatedModules: true,
    },
  });
  const syntax =
    output.diagnostics?.filter(
      (d) => d.category === ts.DiagnosticCategory.Error
    ) ?? [];
  if (syntax.length) {
    return {
      error: syntax
        .map((d) => ts.flattenDiagnosticMessageText(d.messageText, " "))
        .join("; "),
    };
  }

  const module = { exports: {} as Record<string, unknown> };
  try {
    vm.runInNewContext(
      output.outputText,
      { module, exports: module.exports, require: forbiddenRequire },
      {
        filename: fileName,
        timeout: 1000,
      }
    );
  } catch (error) {
    return { error: (error as Error).message };
  }

  if (module.exports.default === undefined) {
    return {
      error: "the doc needs `export default { ... } satisfies ScreenDoc`",
    };
  }
  // Objects created inside the vm context have foreign prototypes; the JSON round-trip returns data from this realm.
  return { data: JSON.parse(JSON.stringify(module.exports.default)) };
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const TS_EXTENSION = /\.ts$/;
const LEADING_INDENT = /^[ \t]*/;

export function quote(value: string): string {
  const mark = value.includes("'") && !value.includes('"') ? '"' : "'";
  const escaped = value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n");
  return `${mark}${escaped.replaceAll(mark, `\\${mark}`)}${mark}`;
}

/** JSON value as a TS literal (single quotes, unquoted keys when possible, trailing commas). */
export function toTsLiteral(value: unknown, indent = ""): string {
  const inner = `${indent}  `;
  if (typeof value === "string") {
    return quote(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null || value === undefined) {
    return "undefined";
  }
  if (Array.isArray(value)) {
    if (!value.length) {
      return "[]";
    }
    return `[\n${value.map((item) => `${inner}${toTsLiteral(item, inner)},`).join("\n")}\n${indent}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, v]) => v !== undefined
  );
  if (!entries.length) {
    return "{}";
  }
  const lines = entries.map(
    ([key, v]) =>
      `${inner}${IDENTIFIER.test(key) ? key : quote(key)}: ${toTsLiteral(v, inner)},`
  );
  return `{\n${lines.join("\n")}\n${indent}}`;
}

/** Import path (without extension) from `fromDir` to `target`, both absolute. */
export function relativeImport(fromDir: string, target: string): string {
  const relative = path
    .relative(fromDir, target)
    .split(path.sep)
    .join("/")
    .replace(TS_EXTENSION, "");
  return relative.startsWith(".") ? relative : `./${relative}`;
}

export function renderTsDoc(data: unknown, typesImport: string): string {
  return `import type { ScreenDoc } from ${quote(typesImport)};\n\nexport default ${toTsLiteral(data)} satisfies ScreenDoc;\n`;
}

function parse(source: string): ts.SourceFile {
  return ts.createSourceFile(
    "doc.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
}

function unwrap(node: ts.Expression): ts.Expression {
  let current = node;
  while (
    ts.isSatisfiesExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isParenthesizedExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function defaultObject(file: ts.SourceFile): ts.ObjectLiteralExpression {
  for (const statement of file.statements) {
    if (ts.isExportAssignment(statement)) {
      const expression = unwrap(statement.expression);
      if (ts.isObjectLiteralExpression(expression)) {
        return expression;
      }
    }
  }
  throw new Error("`export default { ... }` not found in the doc");
}

function propertyNamed(
  object: ts.ObjectLiteralExpression,
  name: string
): ts.PropertyAssignment | undefined {
  return object.properties.find(
    (prop): prop is ts.PropertyAssignment =>
      ts.isPropertyAssignment(prop) &&
      (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) &&
      prop.name.text === name
  );
}

function indentOf(source: string, position: number): string {
  const lineStart = source.lastIndexOf("\n", position - 1) + 1;
  return LEADING_INDENT.exec(source.slice(lineStart))?.[0] ?? "";
}

/** Inserts `text` (without a leading comma) after the last item of a list, fixing the comma. */
function insertAfterLast(
  source: string,
  last: ts.Node,
  closeAt: number,
  text: string
): string {
  const between = source.slice(last.end, closeAt);
  const comma = between.indexOf(",");
  const at = comma >= 0 ? last.end + comma + 1 : last.end;
  return `${source.slice(0, at)}${comma >= 0 ? "" : ","}${text}${source.slice(at)}`;
}

/** Replaces (or creates) top-level string properties of the default object without touching the rest. */
export function setTopLevelStrings(
  source: string,
  values: Record<string, string>
): string {
  let current = source;
  for (const [name, value] of Object.entries(values)) {
    const object = defaultObject(parse(current));
    const existing = propertyNamed(object, name);
    if (existing) {
      const init = existing.initializer;
      current = `${current.slice(0, init.getStart())}${quote(value)}${current.slice(init.end)}`;
      continue;
    }
    const last = object.properties.at(-1);
    if (!last) {
      throw new Error("empty default object");
    }
    const indent = indentOf(current, last.getStart());
    current = insertAfterLast(
      current,
      last,
      object.end - 1,
      `\n${indent}${name}: ${quote(value)},`
    );
  }
  return current;
}

/** Appends a branch to the `branches` array of the default object. */
export function appendBranch(
  source: string,
  branch: Record<string, unknown>
): string {
  const object = defaultObject(parse(source));
  const branches = propertyNamed(object, "branches");
  if (!(branches && ts.isArrayLiteralExpression(branches.initializer))) {
    throw new Error("`branches: [...]` property not found in the doc");
  }
  const array = branches.initializer;
  const last = array.elements.at(-1);
  if (!last) {
    const indent = indentOf(source, branches.getStart());
    const literal = toTsLiteral([branch], indent);
    return `${source.slice(0, array.getStart())}${literal}${source.slice(array.end)}`;
  }
  const indent = indentOf(source, last.getStart());
  return insertAfterLast(
    source,
    last,
    array.end - 1,
    `\n${indent}${toTsLiteral(branch, indent)},`
  );
}
