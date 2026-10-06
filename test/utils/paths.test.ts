import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "vitest";

import { packageRoot, packageVersion } from "../../src/utils/paths.ts";

describe("packageRoot", () => {
  it("should find the periplus package.json", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(packageRoot(), "package.json"), "utf8")
    ) as { name: string; version: string };

    assert.equal(manifest.name, "periplus");
    assert.equal(packageVersion(), manifest.version);
  });
});
