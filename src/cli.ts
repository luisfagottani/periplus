#!/usr/bin/env node
import { KEEP_ALIVE } from "./cli/command.ts";
import { main } from "./cli/main.ts";

main(process.argv.slice(2)).then((code) => {
  if (code !== KEEP_ALIVE) {
    process.exitCode = code;
  }
});
