# Security Policy

## Supported versions

Only the latest published version of `periplus` receives security fixes.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report it privately through GitHub: open the repository's **Security** tab and click **Report a vulnerability** ([direct link](https://github.com/luisfagottani/periplus/security/advisories/new)). Include the affected version, a description of the impact and steps to reproduce.

You can expect an initial response within 7 days. Once the issue is confirmed, a fix is released as soon as possible and the advisory is published with credit to the reporter (unless you prefer to stay anonymous).

## Scope

Periplus is a development tool: it reads your source files, evaluates `*.periplus.ts` docs in an isolated VM context and writes generated files. Reports about code execution through crafted docs, path traversal when writing files, or the `init --template` download are especially welcome.
