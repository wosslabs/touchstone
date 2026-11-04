# Contributing to Touchstone

Thanks for helping. By contributing, you agree that your contributions are
licensed under the [MIT License](LICENSE).

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Development setup

- **Node.js** (the version CI uses in `.github/workflows/tests.yml`) and npm

```bash
git clone https://github.com/wosslabs/touchstone.git
cd touchstone
npm ci --ignore-scripts
npm test
node cli/touchstone.js init --dir /tmp/touchstone-init-check

# Attack suite needs the TypeScript example's dependencies
(cd examples/typescript-todo && npm ci --ignore-scripts)
npm run attacks
```

## Pull requests

1. Open an issue first for anything larger than a small fix.
2. Create a focused branch from `main`.
3. Add or update tests for behavior changes.
4. Run `npm test` (and `npm run attacks` when you change CI checks, the hook, or examples).
5. Fill out the PR template.

Prefer small, reviewable PRs. Do not commit secrets, tokens, or local IDE config.

## Reporting security issues

See [SECURITY.md](SECURITY.md). Do not file public issues for vulnerabilities.

## Questions

Open a GitHub Issue after checking [docs/project-status.md](docs/project-status.md)
and the docs index in the README. GitHub Discussions are not enabled.
