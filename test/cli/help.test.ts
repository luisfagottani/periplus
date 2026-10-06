import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { COMMAND_NAMES } from "../../src/cli/commands.ts";
import {
  COMMAND_HELP,
  closestCommand,
  renderCommandHelp,
  renderHelp,
} from "../../src/cli/help.ts";
import { createTheme, plainTheme } from "../../src/cli/ui/theme.ts";
import { hasAnsi } from "../helpers/streams.ts";

describe("help", () => {
  it("should document exactly the registered commands", () => {
    assert.deepEqual(
      COMMAND_HELP.map((entry) => entry.name).sort(),
      [...COMMAND_NAMES].sort()
    );
  });

  it("should list every command, the global flags and env vars", () => {
    const help = renderHelp(plainTheme);

    for (const name of COMMAND_NAMES) {
      assert.match(help, new RegExp(`^ {2}${name}\\b`, "m"));
    }
    assert.match(help, /-y, --yes/);
    assert.match(help, /NO_COLOR/);
    assert.match(help, /CI/);
    assert.equal(hasAnsi(help), false);
  });

  it("should color the help only with an enabled theme", () => {
    assert.equal(hasAnsi(renderHelp(createTheme(true))), true);
  });

  it("should render a single command and return undefined for unknown ones", () => {
    const help = renderCommandHelp("check", plainTheme) ?? "";

    assert.match(help, /^Usage: periplus check \[--fail-on/);
    assert.match(help, /PERIPLUS_CHANGED/);
    assert.equal(renderCommandHelp("nope", plainTheme), undefined);
  });
});

describe("closestCommand", () => {
  it("should suggest the nearest command within two edits", () => {
    assert.equal(closestCommand("biuld", COMMAND_NAMES), "build");
    assert.equal(closestCommand("CHEK", COMMAND_NAMES), "check");
  });

  it("should return undefined when nothing is close", () => {
    assert.equal(closestCommand("deploy", COMMAND_NAMES), undefined);
  });
});
