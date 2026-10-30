# Touchstone

[![tests](https://github.com/wosslabs/touchstone/actions/workflows/tests.yml/badge.svg)](https://github.com/wosslabs/touchstone/actions/workflows/tests.yml)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Touchstone is an open-source workflow for changing software with a coding agent. A person approves a behavior sentence. The agent shows that sentence failing against the system as it exists today. The agent writes production code only after a person has agreed that the failure is the missing behavior.

```gherkin
Scenario: Declined card
  Given the bank declines the card
  When the customer confirms payment
  Then the customer sees "payment failed"
  And the customer is not charged
```

That sentence is the requirement. Someone who will use or support the product can agree it is right without reading the implementation. Design and production code come after the failure has been seen.

Touchstone is the sentence a change is tested against. This project is separate from other software that uses the same name.

It runs in Claude Code, Cursor, and any agent that reads a `SKILL.md` file, including GitHub Copilot and Codex.

## Getting started

The example application already traces two sentences to Cucumber and Playwright. From a clone of this repository:

```bash
cd examples/todo
npm install
npx playwright install chromium
node ../../ci/check-trace.js --repo .
npm test
npm run acceptance
```

`check-trace.js` prints each scenario, the approved file, the feature file, and the step definition. `npm run acceptance` opens the screen and checks the words.

In an application of your own, a person runs:

```bash
npx @wosslabs/touchstone init
```

Before this package is published, the same command from a clone is `node cli/touchstone.js init`. Init creates three directories and adds the pull-request workflow.

| Directory | What it holds |
| --- | --- |
| `stories/` | The approved acceptance criteria for one user story. You save this file. The agent cannot edit it. |
| `features/` | The Cucumber feature and the step definitions that run that story. |
| `drafts/` | A story the agent has written and you have not accepted yet. |

If the application already has Cucumber features, a person can import them:

```bash
npx @wosslabs/touchstone init --features path/to/features
```

That puts each feature in `features/` and a copy under `drafts/imported/`. Accept the story by saving that copy in `stories/`. The feature file stays in `features/`. The trace fails until the story and the feature use the same words.

The unscoped npm name `touchstone` belongs to another package. This package is `@wosslabs/touchstone`.

## Why this order

An agent can turn a description into a plan and then into code in one pass. When the requirement was misread, the test and the implementation both encode that misreading, and the suite still goes green. Touchstone separates the work so that a person owns the requirement and an independent check owns the verdict.

Three pieces ship together:

- **Skills** tell the agent when to stop, what to draft, and how small a change must stay.
- **A hook** refuses agent writes to the approved sentences and to the pipeline files.
- **Continuous integration** fails a pull request when an approved sentence disappears, when a scenario no longer matches its sentence, or when a test is switched off.

A skill is guidance. The hook and the workflow still apply when the agent does not follow it.

## Responsibilities

You choose the feature. You edit the sentences until they say what you mean, and you save the approved file yourself. You look at the first failure and say whether it is the missing behavior. The agent reads the code you already have, writes the smallest change that makes that feature pass, and opens one pull request. You merge it. The agent does not.

One feature is one thing a person can finish and check, and it fits in one pull request. A product such as "build a checkout" is a list of features. Only the feature you pick receives examples, and only that feature goes into the pull request.

## Workflow

You talk to the agent in the application repository. There is no special command for each step. The skills are installed once, and the agent is expected to follow the sequence below. If it skips a step, stop it with one of the sentences in [Exceptions](#exceptions).

### 1. Request

Describe the product or the change in ordinary language.

```text
Build a checkout that can take a card payment.
```

The agent must not start coding from that request. If the repository already contains code, it reads the part that already does a similar job and names those files. It extends that code. It does not discard a working module and generate a replacement because a new file is easier to write.

### 2. Feature list

The agent saves a feature list in `drafts/stories.md`. Each row is one pull request. The list also says what is out of scope, so later work is not quietly pulled into the first change.

```text
Out of scope: refunds, receipts, saved cards.

1. Declined card. The customer sees "payment failed" and is not charged.
2. Successful card. The customer sees "paid" and the charge is recorded.
```

You choose one row:

```text
Start with 1.
```

The agent does not write examples for the other rows yet. Those features wait until you ask for them.

### 3. Acceptance criteria

The agent asks one question at a time, and it includes its current guess so you can correct it. "Sounds good" is not approval. When the situations are clear, it writes a draft in `drafts/`.

```gherkin
Scenario: Declined card on the checkout screen
  Given the bank declines the card
  When the customer presses Pay
  Then the words "payment failed" appear under the Pay button
  And the amount on the screen does not change
```

`Given` is the situation at the start. `When` is what the person does. `Then` and `And` are what they can observe afterward. A screen example names the screen, the control, and the words a person can read. A sentence that names a class, a table, a URL, or a status code is describing the implementation, and it is not ready to approve.

Edit the draft until the words are yours. Then save that file under `stories/`. The agent is not allowed to create or edit that directory. Saving the file is the approval.

### 4. Failing scenario

The acceptance check uses two tools. [Cucumber](https://cucumber.io/) holds the approved sentences in `features/<name>.feature`. [Playwright](https://playwright.dev/) opens the running screen, uses the control the sentence names, and reads the visible words the sentence names. The words left in an input are not the words on a list. A mock in place of the screen is not the check.

The agent copies your sentences into the feature file. It does not reword them to make the check easier. It also runs:

```bash
node ci/check-trace.js
```

That command prints one row for each scenario: the title, the approved example file, the Cucumber feature file, and the number of steps. It fails when a sentence has no scenario, a scenario has no approved sentence, a title is used twice, or the lines differ.

The product cannot do the new behavior yet, so Cucumber must fail. The failure you want names the missing behavior:

```text
FAIL Declined card
Expected the customer not to be charged
The customer was charged 20.00
```

A programming error is a broken check. A missing import, a connection failure, or a stack trace means the driver never reached the behavior. Tell the agent:

```text
That failure is a programming error. Fix the test and run it again.
```

If the scenario passes on the first run, the check is empty or the behavior is already present. The agent stops and says which of those it is.

When the failure is the one you wanted, say so:

```text
Yes. That failure is the missing behavior.
```

The agent does not start the design or the production code in that same turn.

### 5. Implementation

After you agree, the agent reads the existing code again and names the module it will extend. It writes a short design in `drafts/`, then works in this order:

1. One unit test for the internal behavior. The test fails because the behavior is missing, not because of a typo or a missing import.
2. The smallest production code that makes that unit test pass.
3. The approved scenarios, run again with Cucumber and Playwright. They now pass.
4. The trace check, which still links your file to the feature file.
5. The application's full test suite.

Each slice is one sentence, end to end, before the next sentence. The same command must produce the same result every time. A test that reads the real clock, uses an unseeded random value, or calls a network service outside the application is not finished.

The agent then opens one pull request for this feature. The description names each scenario, the example file, the feature file, and the module that changed, and it includes the command output from the trace check, Cucumber, and the full suite. The agent does not merge the pull request.

### 6. Review

Read the change. You should be able to explain every changed file in one sentence. If you cannot, the change is too big:

```text
This pull request is too big. Split it.
```

The pipeline on the pull request is the merge verdict. A green run on the agent's computer is not that verdict. Merge when the pipeline is green and you understand the change.

Then ask for the next feature:

```text
Now feature 2.
```

## Exceptions

| What you see | What you say |
| --- | --- |
| It starts coding from a product request such as "build a shop" | Stop. List the features first. |
| It writes code for every feature on the list | Stop. Only the feature I picked. |
| It saves the example into `stories/` itself | Stop. I save that file. |
| It rewrites a whole module | Do not rewrite that file. Change the part this feature needs. |
| It says the tests should pass, and does not paste the output | Paste the command and the output. |
| The pull request also changes the pipeline | Take the pipeline change out. That is a separate review. |

## Other work

A bug is one feature. The example states what happens today and what should happen. You see today's wrong behavior fail before any fix is written. If the agent cannot reproduce it, it stops and reports what it tried.

A rename, a typo, a comment, or a documentation-only edit does not need a new example.

A refactor keeps the current behavior. The agent does not add, delete, or rewrite anything in `stories/`. If a sentence would have to change, the agent stops and asks.

A spike you have named as throwaway work is deleted when the spike is over. Keeping it is a new request, and it comes back through this workflow.

## Installation

Install the plugin once. The files in [Setup](#setup) are copied into each application you deploy, and a person owns those copies.

### Claude Code

```text
/plugin marketplace add wosslabs/touchstone
/plugin install touchstone@touchstone
```

The marketplace file in this repository registers the plugin. The included hook refuses agent edits to `stories/`, `.github/workflows/`, `ci/check-acceptance-guard.js`, and `ci/check-trace.js`.

### Cursor

Copy `skills/` to `.cursor/skills/` in the application, or install this folder as a local plugin. The plugin manifest points at `hooks/hooks-cursor.json`.

Five skills are installed together:

| Skill | When it applies |
| --- | --- |
| `using-touchstone` | At the start of a session, before any other workflow plans or writes code |
| `touchstone-features` | The request is a product, a release, or more than one user-visible outcome |
| `touchstone` | One feature is chosen and does not yet have an approved failing sentence |
| `touchstone-build` | You have agreed that the failure is the missing behavior |
| `touchstone-repair` | The acceptance run failed with a programming error, an undefined step, or a screen that did not start |

If the plugin hook does not load, copy the script into the application:

```text
hooks/protect-acceptance.js   ->  .cursor/hooks/protect-acceptance.js
templates/cursor-hooks.json   ->  .cursor/hooks.json
```

Merge that `hooks.json` with hooks the application already has.

Touchstone is a complete workflow. If another workflow plugin is also installed, Touchstone still comes first. Planning starts only after the sentence has failed for the missing behavior.

## Setup

`npx @wosslabs/touchstone init` does the first four steps. You still replace the team name and install the browser.

1. Keep approved sentences in `stories/`. Markdown and `.feature` files both count. The agent may draft in `drafts/`. You copy a draft into `stories/` when it says what you mean.
2. Copy `ci/check-acceptance-guard.js` and `ci/check-trace.js` into the application's `ci/` directory so a laptop can run the same checks as the pull request.
3. Copy `templates/acceptance-guard.yml` to `.github/workflows/acceptance-guard.yml`. The workflow calls `wosslabs/touchstone@v1`, which runs both checks and posts the trace as a pull request comment. Tag `v1` on this repository before that workflow can succeed. Give the workflow permission to write pull request comments.
4. Copy the paths in `templates/CODEOWNERS` into the application's `CODEOWNERS`. Replace `@YOUR_GITHUB_ORG/YOUR_TEAM` with the people who may change behavior sentences and the pipeline. Turn on branch protection so those paths require a review from that team.
5. Add Cucumber and Playwright to the application. The acceptance script is `npm run acceptance`, and it runs `cucumber-js`. Commit `package-lock.json` so the pipeline installs the same versions. Unit tests stay in the application's own test tool. Cucumber is the acceptance layer. Playwright drives a web screen, as in `examples/todo`. An HTTP step calls the running service. A mobile step runs Maestro and reads the visible text. The feature file does not name the driver. The trace still names the file that defines the step.

The workflow compares the pull request with its base commit. It fails the pull request when lines disappear from `stories/`, when the Cucumber feature no longer matches those sentences, when a skipped or disabled test is added, or when `npm run acceptance` fails.

A person who is retiring a sentence adds a line in that same approved file:

```text
Touchstone-Allow-Drop: the charge sentence moved to another story
```

The agent does not write that line. Branch protection is what keeps the exception with a person.

## Traceability

Each change should answer four questions without anyone reading the chat.

| Question | Where the answer lives |
| --- | --- |
| What did a person agree? | `stories/`, which the agent cannot edit |
| Which test runs those words? | `features/*.feature`, checked by `ci/check-trace.js` |
| Which step performed the sentence? | The definition file named by `ci/check-trace.js` |
| What did the pipeline report? | The pull request comment from `wosslabs/touchstone`, then `npm run acceptance` |

Every approved scenario has to appear, with the same lines, in a Cucumber feature. When step definitions exist, every line has to match one of them. A sentence with no scenario, a scenario with no sentence, a reused title, or a step with no definition fails the pull request. The comment is updated on each run, so the pull request shows the current trace rather than an earlier one.

## Layout

| Path | Purpose |
| --- | --- |
| `skills/` | Instructions the agent follows, including `touchstone-repair` when the driver is broken |
| `hooks/` | The session notice and the write protection for approved sentences and pipeline files |
| `ci/check-acceptance-guard.js` | Fails a merge when approved sentences shrink or a test is switched off |
| `ci/check-trace.js` | Fails a merge when a sentence, its Cucumber scenario, and its step definition diverge |
| `action.yml` | The GitHub Action other repositories run with `uses: wosslabs/touchstone@v1` |
| `cli/touchstone.js` | `init` for a new application, published as `@wosslabs/touchstone` |
| `examples/todo` | A small application whose sentences, features, and Playwright steps already trace |
| `templates/` | Workflow, code owners, and Cursor hook files to copy into an application |
| `tests/` | Tests for the hook, both checks, and init |

## Scope

A passing sentence is not a production deployment. Release controls, rollback, migration checks, architecture rules, and mutation testing remain in the application pipeline, on paths the agent does not own.

The agent does not invent the requirement, grade its own examples, or replace a large area of the code because generating a new file is faster.

## Background

Touchstone is inspired by acceptance-test-driven development, behavior-driven development, and current practice in agent-assisted software engineering, including the work of Dave Farley and open-source agent workflows such as Superpowers, agent-skills, GitHub Spec Kit, BMAD, and Disciplined Agentic Engineering.

The text in this repository is original.

## Development

```bash
node --test tests/*.test.js
node cli/touchstone.js init --dir /tmp/touchstone-init-check
```

The tests cover the hook's allow and deny decisions, the sentence guard, the trace from a sentence to its step definition, and init. They do not demonstrate that an agent will follow the skill text.

Issues and pull requests are welcome at [github.com/wosslabs/touchstone](https://github.com/wosslabs/touchstone).

## License

MIT. Copyright 2026 wosslabs.
