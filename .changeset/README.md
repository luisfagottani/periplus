# Changesets

Every pull request that changes the behavior of the published package needs a changeset:

```bash
pnpm changeset
```

Pick the bump (`patch`, `minor` or `major`) and write a short, user-facing summary. It ends up in `CHANGELOG.md` and in the GitHub release. See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full release flow.
