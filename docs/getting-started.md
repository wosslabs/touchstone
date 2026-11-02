# Getting started

[Touchstone](../README.md) · [All documentation](README.md)

The web example traces two sentences to Cucumber and Playwright. From a clone of this repository:

```bash
npm ci --ignore-scripts
cd examples/web-todo
npm install
npx playwright install chromium
node ../../ci/check-trace.js --repo .
npm test
npm run acceptance
```

The trace check prints each scenario with its approved file, its feature file, and the step definition that runs each line. `npm run acceptance` opens the page in a browser and checks the words.

In your own application, run:

```bash
npx @wosslabs/touchstone init
```

The package is published on npm as [`@wosslabs/touchstone`](https://www.npmjs.com/package/@wosslabs/touchstone). The unscoped name `touchstone` belongs to a different package. Use the scoped name.

Init creates three directories and a few files:

| Path | What it holds |
| --- | --- |
| `stories/` | The approved sentences for a user story. You save these files. The agent cannot edit them. |
| `features/` | The Cucumber feature files and the step definitions that run them. |
| `drafts/` | Stories the agent has written that you have not accepted yet. |
| `.github/workflows/acceptance-guard.yml` | The pull request workflow. |
| `CODEOWNERS` | A template listing the files that need a person's review. |

If your application already has Cucumber features, import them:

```bash
npx @wosslabs/touchstone init --features path/to/features
```

Each feature is copied into `features/`, and a second copy goes under `drafts/imported/`. Accept a story by saving its copy in `stories/`. The trace fails until the story and the feature use the same words.

## Command line

You can run the same checks as the pull request on your own machine:

| Command | What it does |
| --- | --- |
| `npx @wosslabs/touchstone check` | Traces each approved sentence to its feature and step definitions. |
| `npx @wosslabs/touchstone guard --base <sha>` | Fails if approved sentences were removed or reworded, or a test was switched off. |
| `npx @wosslabs/touchstone red --base <sha> --command "..."` | Runs new scenarios against the base code and checks that they fail first. |
| `npx @wosslabs/touchstone mutate --command "..." --base <sha>` | Changes one value at a time in new or changed scenarios and expects each to fail (see [Gherkin value mutation](value-mutation.md#gherkin-value-mutation)). |
| `npx @wosslabs/touchstone gates list`, `run <gate>`, `phase <phase>` | Runs the gates named in `touchstone.json`, and checks that an agent's phase stayed inside its fence (see [The gate config](gate-config.md#the-gate-config-touchstonejson)). |
| `npx @wosslabs/touchstone discover` | Lists the entry points of an existing code base (see [Existing code bases](existing-code.md#existing-code-bases)). |
| `npx @wosslabs/touchstone evidence` | Checks that every sentence about an existing system points at real code. |
| `npx @wosslabs/touchstone requirements` | Writes a plain requirements document from the checked sentences. |
