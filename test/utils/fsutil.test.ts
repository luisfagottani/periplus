import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "vitest";

import {
  kebab,
  pascal,
  walkFiles,
  writeIfChanged,
} from "../../src/utils/fsutil.ts";

describe("kebab", () => {
  it("should convert camel, Pascal, snake and spaced text", () => {
    assert.equal(kebab("CheckoutCart"), "checkout-cart");
    assert.equal(kebab("PIXPayment"), "pix-payment");
    assert.equal(kebab("checkout_cart"), "checkout-cart");
    assert.equal(kebab("checkout cart"), "checkout-cart");
  });
});

describe("pascal", () => {
  it("should join separated words in PascalCase", () => {
    assert.equal(pascal("checkout_cart"), "CheckoutCart");
    assert.equal(pascal("pix-payment flow"), "PixPaymentFlow");
  });
});

describe("filesystem helpers", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "periplus-fs-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("walkFiles should list files sorted, skipping heavy folders", () => {
    for (const file of ["b.ts", "a/c.ts", "node_modules/x.ts", "dist/y.ts"]) {
      writeIfChanged(path.join(dir, file), "");
    }

    const files = walkFiles(dir).map((file) => path.relative(dir, file));

    assert.deepEqual(files, [path.join("a", "c.ts"), "b.ts"]);
  });

  it("walkFiles should filter and tolerate missing folders", () => {
    writeIfChanged(path.join(dir, "a.ts"), "");
    writeIfChanged(path.join(dir, "a.md"), "");

    assert.equal(walkFiles(dir, (file) => file.endsWith(".md")).length, 1);
    assert.deepEqual(walkFiles(path.join(dir, "missing")), []);
  });

  it("writeIfChanged should only write when the content differs", () => {
    const file = path.join(dir, "deep/out.txt");

    assert.equal(writeIfChanged(file, "one"), true);
    assert.equal(writeIfChanged(file, "one"), false);
    assert.equal(writeIfChanged(file, "two"), true);
    assert.equal(fs.readFileSync(file, "utf8"), "two");
  });
});
