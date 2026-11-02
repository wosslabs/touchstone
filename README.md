# Touchstone

[![tests](https://github.com/wosslabs/touchstone/actions/workflows/tests.yml/badge.svg)](https://github.com/wosslabs/touchstone/actions/workflows/tests.yml)
[![npm](https://img.shields.io/npm/v/@wosslabs/touchstone)](https://www.npmjs.com/package/@wosslabs/touchstone)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Touchstone is an open-source workflow for changing software with a coding agent. A person approves a sentence that describes a behavior. The agent shows that sentence failing against the system as it exists today. The agent writes production code only after a person agrees that the failure is the missing behavior.

```gherkin
Scenario: Declined card
  Given the bank declines the card
  When the customer confirms payment
  Then the customer sees "payment failed"
  And the customer is not charged
```

That sentence is the requirement. Someone who uses or supports the product can agree it is right without reading the code. Design and production code come after the failure has been seen.

Touchstone works with Claude Code, Cursor, and any agent that reads a `SKILL.md` file, including GitHub Copilot and Codex. It is not related to other software that uses the same name.

![Agents produce unlimited output. Touchstone's inner loop shapes it, its outer loop checks it without any AI, and a person decides only on one small pull request.](docs/images/outer-inner-loop.png)

## The idea: bite-sized agentic delivery

An agent can write code faster than anyone can read it. The scarce thing is a person's attention, so Touchstone is built around what a person can actually chew: one sentence, one failing test, one small pull request. This way of working is called **bite-sized agentic delivery**.

- The **inner loop** is the agent working: build until the scenario passes, then clean, fix the dependencies, and harden the tests. It is cheap and fast, and it is advisory. Nothing it says is trusted.
- The **outer loop** is deterministic. It runs in CI, with no AI in it, and it decides whether the change is good: the sentences are unchanged, the test failed first for the right reason, every value is really checked, the quality gates pass.
- The **person** decides only what only a person can: whether the sentence says what the business wants, whether the failure is the missing behavior, and whether to merge. A red result goes back to the agent, so you never spend attention on it.

Agents write specifications, plans and long diffs that nobody has time to read. Touchstone replaces reading with checking wherever a check is possible, and keeps what is left short. [What each role reads, and what this does not claim.](docs/bite-sized-agentic-delivery.md)

## How a change works

You talk to the agent in your repository. There are no special commands.

1. **Request.** Describe the product or the change in ordinary words. The agent reads your existing code first.
2. **One feature.** The agent lists the features and some unlikely events that could go wrong. You pick one feature.
3. **Sentences.** The agent drafts Given, When, Then sentences. You edit them and save them in `stories/`. The agent cannot edit that folder.
4. **A failing scenario.** The agent makes the sentences run and shows them failing for the missing behavior. You agree that this failure is the gap.
5. **Build.** The agent writes the smallest change that passes, then makes three passes over it: clean, architect, harden.
6. **Review.** The pipeline gives its verdict on one small pull request. You read it and merge.

[The full walkthrough, and what to say when the agent goes off track.](docs/how-a-change-works.md)

## Quick start

```bash
npx @wosslabs/touchstone init     # stories/, features/, drafts/, the workflow, CODEOWNERS, touchstone.json
npx @wosslabs/touchstone check    # trace each approved sentence to its test and its step
```

Then install the skills and the hook. In Claude Code:

```text
/plugin marketplace add wosslabs/touchstone
/plugin install touchstone@touchstone
```

Cursor, the workflow, CODEOWNERS and branch protection are in [Installing and setting up](docs/installing.md). To see it working on a small project first, follow [Getting started](docs/getting-started.md). The unscoped npm name `touchstone` belongs to a different package. Use `@wosslabs/touchstone`.

## What is in the box

An agent can turn a description into a plan, and the plan into code, in one pass. If it misread the requirement, the tests and the code both carry the mistake, and the test suite still passes. Touchstone splits the work so that a person owns the requirement and an independent check decides whether the change is done.

- **Seven skills** tell the agent when to stop, what to draft, how small a change should be, and how to refine it.
- **A hook** blocks agent edits to the approved sentences, the pipeline files, and the paths you list under `protect`.
- **A GitHub Action** runs on every pull request and posts a verdict. Its checks are in [What the pull request checks](docs/pull-request-checks.md).
- **A command line** runs the same checks on your machine: `check`, `guard`, `red`, `mutate`, `gates`, `discover`, `evidence`, `requirements`.
- **Examples** show the setup in seven stacks: Node, TypeScript, Java, Python, Go, Rust and Mojo.

A skill is only guidance, and the hook is only a safety net. The Action, CODEOWNERS and branch protection are what the agent cannot get around.

## Documentation

| Read this | For |
| --- | --- |
| [Getting started](docs/getting-started.md) | Try the example, run `init`, import existing features, the command line |
| [Bite-sized agentic delivery](docs/bite-sized-agentic-delivery.md) | Why it is built this way, and what each person reads |
| [How a change works](docs/how-a-change-works.md) | The six steps in full |
| [Installing and setting up](docs/installing.md) | Skills, hook, Cursor, workflow, CODEOWNERS |
| [What the pull request checks](docs/pull-request-checks.md) | Every check, red before green, the Action's inputs |
| [Gherkin value mutation](docs/value-mutation.md) | Proving that every value in a sentence is checked |
| [The gate config](docs/gate-config.md) | `touchstone.json`, protected files, the fence around an agent's phase |
| [The inner loop](docs/inner-loop.md) | Clean, architect, harden, and whether it helps |
| [Existing code bases](docs/existing-code.md) | Reverse engineering a legacy system into proven requirements |
| [Examples by language](docs/examples.md) | The same todo list in seven stacks, the Java preset |
| [Checking that agents follow the skills](docs/evals.md) | The eval harness and its results |
| [Project status](docs/project-status.md) | What is verified, known limits, releases, repository layout |

## Status

Early beta. What has been shown, and what has not:

- **Shown:** the Action turns thirteen deliberately bad changes red on GitHub and passes an honest one, including on real pull requests. The Java example has its own attack suite. Agents followed the skills in five-run evaluations. One agent session turned a small legacy service into 29 passing scenarios.
- **Not shown yet:** the Action on a real application's own pull requests. That people actually read less, which is the main claim. That the inner loop beats a one-sentence instruction. Any use outside this project.

All of it, with the numbers and the limits, is in [Project status](docs/project-status.md).

## Contributing

Issues and pull requests are welcome at [github.com/wosslabs/touchstone](https://github.com/wosslabs/touchstone).

```bash
npm ci --ignore-scripts
npm test
node cli/touchstone.js init --dir /tmp/touchstone-init-check

# the attack suite needs the TypeScript example's dependencies
(cd examples/typescript-todo && npm ci --ignore-scripts)
npm run attacks
```

The tests cover the hook's allow and deny decisions, the sentence guard, the trace, the red check, init and the eval checks. They do not show that an agent will follow the skill text. That is what the evals are for.


## License

MIT. Copyright 2026 wosslabs.

