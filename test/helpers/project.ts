import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { type Ctx, loadContext } from "../../src/context.ts";

/** Temporary periplus project on disk. */
export interface DemoProject {
  root: string;
  write: (relative: string, content: string) => void;
  read: (relative: string) => string;
  exists: (relative: string) => boolean;
  ctx: () => Ctx;
  cleanup: () => void;
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

const SCREEN = `import type { ScreenDoc } from '../../../../flows/demo/generated/+flow.types';

export default {
  flowId: 'demo_flow',
  branches: [
    {
      branchId: 'default',
      label: 'Home',
      incoming: [{ from: 'flow:entry', reason: 'opened the flow' }],
      outgoing: [{ outcome: 'end', reason: 'done' }],
    },
  ],
} satisfies ScreenDoc;
`;

/**
 * Creates a project with one flow (`demo`) and one documented screen (`HomeScreen`).
 *
 * @param options.withFlow - Set to `false` for a config-only project.
 */
export function createDemoProject({ withFlow = true } = {}): DemoProject {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "periplus-cli-"));
  const project: DemoProject = {
    root,
    write(relative, content) {
      const absolute = path.join(root, relative);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, content);
    },
    read: (relative) => fs.readFileSync(path.join(root, relative), "utf8"),
    exists: (relative) => fs.existsSync(path.join(root, relative)),
    ctx: () => loadContext({ root, cwd: root }),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };

  project.write(
    "periplus.config.json",
    JSON.stringify({ project: "demo", domains: { app: "App" } })
  );
  project.write(
    "src/mod/screens/HomeScreen/HomeScreen.tsx",
    "export const Home = () => null;\n"
  );
  if (withFlow) {
    project.write("flows/demo/index.mdx", INDEX);
    project.write("src/mod/screens/HomeScreen/HomeScreen.periplus.ts", SCREEN);
  }
  return project;
}
