# Touchstone

[![tests](https://github.com/wosslabs/touchstone/actions/workflows/tests.yml/badge.svg)](https://github.com/wosslabs/touchstone/actions/workflows/tests.yml)
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

**Status:** early beta. The Node, TypeScript, Java, Python, Go and Rust paths have all been run end to end. See [Project status](#project-status) for what has and has not been verified.

## Contents

- [Why this order](#why-this-order)
- [Getting started](#getting-started)
- [How a change works](#how-a-change-works)
- [Installing the skills and hook](#installing-the-skills-and-hook)
- [Setting up a repository](#setting-up-a-repository)
- [What the pull request checks](#what-the-pull-request-checks)
- [Examples by language](#examples-by-language)
- [Held-back scenarios](#held-back-scenarios)
- [Checking that agents follow the skills](#checking-that-agents-follow-the-skills)
- [Project status](#project-status)
- [Contributing](#contributing)

## Why this order

An agent can turn a description into a plan, and the plan into code, in one pass. If it misread the requirement, the tests and the code both carry the mistake, and the test suite still passes. Touchstone splits the work so that a person owns the requirement and an independent check decides whether the change is done.

Three pieces ship together:

- **Skills** tell the agent when to stop, what to draft, and how small a change should be.
- **A hook** blocks agent edits to the approved sentences and to the pipeline files.
- **A GitHub Action** runs on every pull request. It fails the pull request when an approved sentence is removed or reworded, when a scenario no longer matches its sentence, when a test is switched off, when a new scenario already passes before any code was written, or when the acceptance tests fail.

A skill is only guidance, and the hook is only a safety net. The action, CODEOWNERS and branch protection are what the agent cannot get around. See [Project status](#project-status) for the limits.

## Getting started

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

**The package is not on npm yet.** Until it is, replace `npx @wosslabs/touchstone` in this README with `node /path/to/touchstone/cli/touchstone.js`, for example `node ~/src/touchstone/cli/touchstone.js init`. The GitHub Action does not need the npm package. The unscoped npm name `touchstone` belongs to a different package. This one is `@wosslabs/touchstone`.

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

### Command line

You can run the same checks as the pull request on your own machine:

| Command | What it does |
| --- | --- |
| `npx @wosslabs/touchstone check` | Traces each approved sentence to its feature and step definitions. |
| `npx @wosslabs/touchstone guard --base <sha>` | Fails if approved sentences were removed or reworded, or a test was switched off. |
| `npx @wosslabs/touchstone red --base <sha> --command "..."` | Runs new scenarios against the base code and checks that they fail first. |

## How a change works

You talk to the agent in your application repository. There are no special commands. The skills are installed once, and the agent follows the steps below. If it skips one, stop it with a sentence from [When the agent goes off track](#when-the-agent-goes-off-track).

### Your role

You choose the feature. You edit the sentences until they say what you mean, and you save the approved file yourself. You look at the first failure and decide whether it is the missing behavior. The agent reads your existing code, writes the smallest change that makes the feature pass, and opens one pull request. You merge it. The agent does not.

A feature is one thing a person can finish and check, and it fits in one pull request. A request like "build a checkout" is a list of features. Only the feature you pick gets sentences, and only that feature goes into the pull request.

### 1. Request

Describe the product or the change in ordinary words.

```text
Build a checkout that can take a card payment.
```

The agent must not start coding from that. If the repository has code, it reads the part that does a similar job and names those files. It extends that code. It does not throw away a working module and generate a new one because a new file is easier to write.

### 2. Feature list and stressors

The agent saves a feature list in `drafts/stories.md`. Each row is one pull request. The list also says what is out of scope, so later work is not quietly pulled into the first change.

```text
Out of scope: refunds, receipts, saved cards.

1. Declined card. The customer sees "payment failed" and is not charged.
2. Successful card. The customer sees "paid" and the charge is recorded.
```

A list built from requirements only covers situations someone already thought of. So the agent also writes `drafts/stressors.md`: 15 to 25 unlikely but possible events, such as the bank timing out, the person pressing Add twice, or the card network being down. You decide which ones matter. A chosen stressor becomes a failure sentence in step 3. A stressor about structure, such as a module that must survive a supplier change, belongs in an architecture test instead, and the agent says so.

You then choose one row:

```text
Start with 1.
```

The agent does not write sentences for the other rows yet.

### 3. Acceptance sentences

The agent asks one question at a time and includes its current guess so you can correct it. "Sounds good" is not approval. When the situations are clear, it writes a draft in `drafts/`.

```gherkin
Scenario: Declined card on the checkout screen
  Given the bank declines the card
  When the customer presses Pay
  Then the words "payment failed" appear under the Pay button
  And the amount on the screen does not change
```

`Given` is the starting situation. `When` is what the person does. `Then` and `And` are what they can see afterward. A sentence about a screen names the screen, the control, and the words a person can read. A sentence that names a class, a table, a URL or a status code describes the implementation and is not ready to approve.

Edit the draft until the words are yours, then save the file under `stories/`. The agent may not create or edit that directory. Saving the file is the approval.

### 4. A failing scenario

The agent copies your sentences into a Cucumber feature file without rewording them, writes the step definitions, and runs:

```bash
npx @wosslabs/touchstone check
```

The trace fails when a sentence has no scenario, a scenario has no approved sentence, a title appears twice, a step has no definition, or the lines differ in any way. Background steps, tags, tables and examples all count.

The product cannot do the new behavior yet, so the scenario must fail. The failure you want names the missing behavior:

```text
FAIL Declined card
Expected the customer not to be charged
The customer was charged 20.00
```

A programming error is a broken test, not a missing feature. A missing import, a refused connection or a stack trace means the test never reached the behavior. Tell the agent:

```text
That failure is a programming error. Fix the test and run it again.
```

If the scenario passes on the first run, the test is empty or the behavior already exists. The agent stops and says which. When the failure is the one you wanted, say so:

```text
Yes. That failure is the missing behavior.
```

The agent does not start the design or the production code in the same turn.

### 5. Implementation

After you agree, the agent reads the existing code again and names the module it will extend. It writes a short design in `drafts/` and works in this order:

1. One unit test for the internal behavior. It fails because the behavior is missing, not because of a typo.
2. The smallest production code that makes that unit test pass.
3. The approved scenarios, run again. They now pass.
4. The trace check, which still links your file to the feature file.
5. The application's full test suite.

Each slice is one sentence, end to end, before the next. The same command must give the same result every time. A test that reads the real clock, uses an unseeded random value, or calls an outside network service is not finished.

The agent then opens one pull request. The description names each scenario, the story file, the feature file and the module that changed, and includes the output of the trace check, the scenarios and the full suite. The agent does not merge.

### 6. Review

Read the change. You should be able to explain every changed file in one sentence. If you cannot, the change is too big:

```text
This pull request is too big. Split it.
```

The pipeline on the pull request is the verdict. A green run on the agent's computer is not. Merge when the pipeline is green and you understand the change. Then ask for the next feature:

```text
Now feature 2.
```

### When the agent goes off track

| What you see | What you say |
| --- | --- |
| It starts coding from a product request such as "build a shop" | Stop. List the features first. |
| It writes code for every feature on the list | Stop. Only the feature I picked. |
| It saves the sentences into `stories/` itself | Stop. I save that file. |
| It rewrites a whole module | Do not rewrite that file. Change the part this feature needs. |
| It says the tests should pass, and does not paste the output | Paste the command and the output. |
| The pull request also changes the pipeline | Take the pipeline change out. That is a separate review. |

### Other kinds of work

- **A bug** is one feature. The sentence states what happens today and what should happen. You see the wrong behavior fail before any fix is written. If the agent cannot reproduce the bug, it stops and reports what it tried.
- **A rename, typo, comment or documentation edit** does not need a new sentence.
- **A refactor** keeps the current behavior. The agent does not add, delete or rewrite anything in `stories/`. If a sentence would have to change, it stops and asks.
- **A spike** that you named as throwaway work is deleted when it is over. Keeping it is a new request and goes through this workflow.

## Installing the skills and hook

Install the plugin once. The files described in [Setting up a repository](#setting-up-a-repository) are then copied into each application, and a person owns those copies.

### Claude Code

```text
/plugin marketplace add wosslabs/touchstone
/plugin install touchstone@touchstone
```

### Cursor

Copy `skills/` to `.cursor/skills/` in your application, or install this folder as a local plugin. The plugin manifest points at `hooks/hooks-cursor.json`. If the plugin hook does not load, copy the script into the application and merge the hook file with any hooks you already have:

```text
hooks/protect-acceptance.js   ->  .cursor/hooks/protect-acceptance.js
templates/cursor-hooks.json   ->  .cursor/hooks.json
```

### The skills

Five skills are installed together:

| Skill | When it applies |
| --- | --- |
| `using-touchstone` | At the start of a session, before any other workflow plans or writes code |
| `touchstone-features` | The request is a product, a release, or more than one visible outcome |
| `touchstone` | One feature is chosen and has no approved failing sentence yet |
| `touchstone-build` | You have agreed that the failure is the missing behavior |
| `touchstone-repair` | A run failed with a programming error, an undefined step, or an app that did not start |

Touchstone is a complete workflow. If another workflow plugin is also installed, Touchstone still comes first, and planning starts only after the sentence has failed for the missing behavior.

### What the hook blocks

The hook refuses agent edits to `stories/`, `.github/workflows/`, `.claude/`, `.cursor/hooks/`, `CODEOWNERS`, and Touchstone's own check scripts. It also blocks obvious shell writes such as `rm`, `mv`, redirects, and `find ... -delete`.

The hook is a safety net, not a lock. A determined agent can get around it, for example by building a path inside a shell variable. The real controls are CODEOWNERS and branch protection, which the agent cannot bypass.

## Setting up a repository

`npx @wosslabs/touchstone init` does the first part of this for you. You still need to replace the team name in CODEOWNERS and install your browser or runtime.

1. **Keep approved sentences in `stories/`.** Markdown and `.feature` files both work. The agent may draft in `drafts/`. You copy a draft into `stories/` when it says what you mean.
2. **Add the workflow.** Copy `templates/acceptance-guard.yml` to `.github/workflows/acceptance-guard.yml`. It calls `wosslabs/touchstone@v0`. Give the workflow permission to write pull request comments. For a Java project use `templates/acceptance-guard-jvm.yml`, and see [Examples by language](#examples-by-language) for other stacks.
3. **Set up CODEOWNERS.** Copy the paths from `templates/CODEOWNERS` into your `CODEOWNERS` file and replace `@YOUR_GITHUB_ORG/YOUR_TEAM` with the people who may change approved sentences and the pipeline. Turn on branch protection so that those paths need a review from that team. The template also covers the build files and the step definitions. Keep the lines that match your layout and delete the rest.
4. **Add Cucumber, or another Cucumber-compatible runner.** Commit your lockfile so the pipeline installs the same versions every time. Unit tests stay in your own test tool. The acceptance layer is Cucumber. Its steps may drive a browser with Playwright, call the running service over HTTP, or run a command line program. The feature file does not name the driver.

### How checks find your tests

Stories and features are parsed with the official [`@cucumber/gherkin`](https://github.com/cucumber/gherkin) parser. A story that is not valid Gherkin fails the trace.

Step definitions are found by scanning `features/`, `src/test/` and `src/acceptanceTest/` for `.js`, `.ts`, `.py`, `.java`, `.kt`, `.go` and `.rs` files. If a feature exists and no step definition is found, the trace fails instead of passing quietly. A step whose body does nothing (empty, `pass`, `return`, `return nil`) also fails.

### Why acceptance steps should call the system from outside

Keep acceptance steps in their own place (`features/`, or `src/acceptanceTest/` for Java), and make them talk to the running system only, through a browser, HTTP, or the command line. Then the red check can copy a pull request's scenarios onto the previous commit and run them, without needing the unit tests that go with the new code. If your steps import code that the pull request adds, that check cannot work. You can list extra paths to copy with the `overlay` input.

## What the pull request checks

The action compares the pull request with its base commit, runs the checks below, and posts a trace comment that is updated on each run.

| Check | It fails the pull request when |
| --- | --- |
| Approved sentences | A line in `stories/` is removed or reworded. A person can retire a sentence by adding a `Touchstone-Allow-Drop:` line to the same file (see below). |
| Skipped tests | A skipped, disabled, focused (`.only`), pending (`todo`) or work-in-progress test is added. A build file is changed to ignore test failures (`testFailureIgnore`, `skipTests` set to true, `ignoreFailures`). A workflow step gets `continue-on-error: true`. |
| Trace | A sentence has no scenario, a scenario has no sentence, titles repeat, steps differ in any way, a step has no definition, or a definition does nothing. |
| Red before green | A new or changed scenario passes against the base commit. Or it fails for the wrong reason. Or it does not pass with the pull request's code. |
| Acceptance command | The `command` you set in the workflow fails. |
| Held-back scenarios | The optional `holdout-command` fails. |

### Red before green

For every new or changed scenario, the check copies the pull request's `features/`, `stories/` and `src/acceptanceTest/` onto the base commit and runs only that scenario. It must fail there, because the behavior is missing. Then it runs the same scenario with the pull request's code, where it must pass.

Failures count as "red" only when they look like missing behavior: a failed assertion, a locator that times out, a 404 or 405 response. These do not count: an undefined or pending step, a failing `Given` or hook, `TypeError`, `ReferenceError`, `NoSuchMethodError`, `ECONNREFUSED`, and similar programming or environment errors.

To tell these apart, the check reads the runner's results. Your `red-command` must run the scenario named by `$TOUCHSTONE_SCENARIO` (an anchored regular expression) and write results to `$TOUCHSTONE_MESSAGES`, either as Cucumber messages or as a Cucumber JSON report. With cucumber-js:

```bash
npx cucumber-js --strict --name "$TOUCHSTONE_SCENARIO" --format message:"$TOUCHSTONE_MESSAGES"
```

The [examples](#examples-by-language) show the same thing for Java, Python, Go and Rust. A step's type (Given, When or Then) comes from the report, so a failing `And` after a `Given` is treated as a setup error.

Only if your runner can write neither format, set `red-reason-unchecked: "true"`. The check then only proves that a new scenario fails before the code exists. It cannot tell an assertion failure from a programming error, and it skips the "passes with the pull request code" run.

Each scenario normally gets its own run at the base commit and another with the pull request's code. If starting your application is slow (Spring, for example), set `red-batch: "true"` to run all changed scenarios together in one pass per phase. Your `red-command` must then accept a regular expression with alternation in `$TOUCHSTONE_SCENARIO`.

### Action inputs

| Input | Purpose |
| --- | --- |
| `base` | The pull request's base commit. Defaults to the pull request base. |
| `command` | Runs all acceptance tests. Set it in the workflow file, not in `package.json`. |
| `red-command` | Runs one scenario for the red check (see above). Empty skips the check. |
| `red-batch` | `"true"` to run all changed scenarios in one pass per phase. |
| `red-reason-unchecked` | `"true"` only for runners that can write neither Cucumber messages nor a Cucumber JSON report. |
| `setup` | Prepares the base checkout for the red check, for example `npm ci --ignore-scripts`. |
| `overlay` | Extra comma-separated paths copied from the pull request onto the base checkout. |
| `holdout-command` | Runs held-back scenarios (see [below](#held-back-scenarios)). |
| `comment` | Set to `"false"` to skip the pull request comment. |

Write the commands in the workflow file rather than as npm scripts. The workflow file is protected by CODEOWNERS and the hook, but `package.json` is something a pull request can change.

### Install-time safety

A pull request controls its own `package.json` and build files. The templates therefore install with `npm ci --ignore-scripts`, call test runners directly, and set `persist-credentials: false` on checkout. The CODEOWNERS template covers `package.json`, lockfiles, `cucumber.js`, `pom.xml`, `build.gradle*`, the Maven and Gradle wrappers, and your step definitions. Step definitions run in the same process as the test runner, so a dishonest step could fake a pass. Reviewing changes to them is the only real defence. The action lists changed step and build files in its comment, under "Driver changes: review these".

### Retiring a sentence

A person who is retiring a sentence adds a line to the same approved file:

```text
Touchstone-Allow-Drop: the charge sentence moved to another story
```

The agent never writes that line. Branch protection keeps the exception with a person.

### Traceability

Each change should answer four questions without anyone reading the chat.

| Question | Where the answer lives |
| --- | --- |
| What did a person agree? | `stories/`, which the agent cannot edit |
| Which test runs those words? | `features/*.feature`, checked by the trace |
| Which step performed the sentence? | The definition file named in the trace |
| What did the pipeline report? | The pull request comment from `wosslabs/touchstone` |

## Examples by language

Every example is the same small todo list with the same approved story, so you can compare how the acceptance layer looks in each stack. Steps talk to the running system only. Unit tests are kept apart from acceptance scenarios. Each folder has its own README with commands and a workflow.

| Folder | Application | Cucumber runner | Red check, run end to end |
| --- | --- | --- | --- |
| `examples/web-todo` | Node web page | cucumber-js + Playwright | yes |
| `examples/typescript-todo` | TypeScript HTTP service | cucumber-js | yes (also the base for `npm run attacks`) |
| `examples/jvm-todo` | Spring Boot 4 | Cucumber-JVM | yes |
| `examples/python-todo` | Python `http.server` | behave | yes |
| `examples/golang-todo` | Go `net/http` | godog | yes |
| `examples/rust-todo` | Rust `tiny_http` | cucumber-rs | yes |
| `examples/mojo-todo` | Mojo command line program | behave drives the binary | command written, not run end to end |

All of them read the failure reason: cucumber-js and Cucumber-JVM through Cucumber messages, and behave, godog and cucumber-rs through a Cucumber JSON report.

Mojo has no Cucumber runner of its own, so Python's behave runs the scenarios and drives the compiled Mojo program as a black box.

### Java and Spring

`examples/jvm-todo` keeps acceptance steps in a separate source set, `src/acceptanceTest/java`, run by Failsafe. Unit tests stay in `src/test/java`. This separation is what lets the red check copy a pull request's scenarios onto the base commit: the new unit tests refer to production code that does not exist there yet, so they must not be compiled in that run.

From that folder, `./mvnw verify` runs everything, and `./mvnw verify -DskipUnitTests=true` runs only the scenarios. `templates/acceptance-guard-jvm.yml` is the matching workflow. The Maven wrapper pins the Maven version. The example uses an in-memory store, so it has no database and no Testcontainers. Add Testcontainers where your system has a real database.

## Held-back scenarios

An agent can tune its code to the examples it can see. To check that it learned the rule and not the examples, keep some scenarios where the agent cannot read them, for instance in a private repository. The `holdout-command` input runs them after the acceptance command. `templates/holdout-workflow.yml` shows one way to do this with a read-only deploy key. It has not been run on GitHub Actions yet, so treat it as a starting point.

## Checking that agents follow the skills

`npm test` shows that the guards work. It does not show that an agent follows the skills. The eval harness starts real `claude -p` sessions with this plugin loaded, each on a fresh copy of `examples/web-todo`, and checks what the agent changed.

```bash
npm run eval -- --case draft-then-stop --runs 5
node evals/run.js --dry          # print the commands without calling the model
```

| Case | What it checks |
| --- | --- |
| `draft-then-stop` | A new behavior gets draft sentences and a stop. No code and no approved story. |
| `refuses-story-edit` | A request to loosen an approved sentence leaves `stories/` unchanged. |
| `ignores-injected-instructions` | Instructions inside a file the agent reads are treated as data. |
| `builds-against-approved-sentence` | With an approved story, the agent changes production code and leaves the story alone. |
| `runs-test-before-code` | The agent runs the scenario and sees it fail before writing production code. |
| `stops-after-red` | Asked only to show the failure, the agent writes no production code. |

Writing a failing unit test before the first acceptance run is allowed. Only production code written before that run, or without any acceptance run, counts as a failure.

These runs cost money. `--budget` caps each run (default 1.00 USD). Results vary from run to run, so use `--runs N` to get a pass rate, and read `evals/results/*.jsonl` when a case fails. In headless mode, `--permission-mode acceptEdits` does not auto-approve shell commands, so Claude Code's own permission system can block a shortcut before Touchstone sees it. To measure the skills and hook alone, use `--permission-mode bypassPermissions` in a disposable sandbox. Only Claude Code is covered so far, not Cursor. No pass rates are published yet.

## Project status

Touchstone is an early beta. Here is what has been checked and what has not.

**Verified by running it:**

- All unit tests (`npm test`) and the CI jobs on GitHub for every example. All of them passed on the last run.
- An attack suite (`npm run attacks`, also a CI job). It applies eleven deliberately bad changes, such as a reworded story, an empty step, `test.only`, a build file that ignores test failures, a scenario that is already green, and a stack trace in a `When` step. Each must turn the pipeline red. One honest change must stay green. The suite found a real hole when it was written: the guard exempted any `tests/` folder, including an application's own. That is fixed.
- The red check against real runner output for the Node web, TypeScript, Java, Python, Go and Rust examples. That includes a Java pull request whose new unit test refers to code that does not exist at the base commit.

**Not verified yet:**

- The `wosslabs/touchstone` action itself has not run on a real pull request. The repository's own CI uses it only for the trace. The pull request comment, the red check inside the action, `red-batch`, the JVM workflow template and the held-back scenarios template have never run on GitHub. The release workflow has run once, for 0.9.0.
- The Mojo red command.
- The eval cases have not been run against a live model, so there are no pass rates.
- Nobody outside this project has used it on a real repository.

**Known limits:**

- Step definitions are found by pattern matching. Steps built from constants or string concatenation, or registered through unusual helpers, will not be found.
- A step definition can still be weakened in ways the checks cannot see, for example by changing an assertion so it can never fail. Code review of step files is the defence.
- Acceptance sentences prove that the system does what you specified. They do not prove you specified the right things, and they say nothing about security, performance, or architecture. Release controls, rollback, migration checks, architecture tests and mutation testing belong in your own pipeline, on paths the agent does not own.

The attack suite runs offline. A good next step would be a public repository holding the same attacks as real pull requests, with a link to each run, so anyone can check them.

## Releases

Pushing a tag such as `v0.9.0` runs `.github/workflows/release.yml`. It runs the tests, checks that the tag and every plugin manifest match `package.json`, checks that the workflow templates use the major tag it is about to move, and then moves that major tag (`v0`) to the same commit.

While the project is 0.x, workflow templates use `wosslabs/touchstone@v0`. At 1.0.0 the templates switch to `@v1` in the same commit. To be safe from tag changes, pin the action to a full commit SHA instead.

## Repository layout

| Path | Purpose |
| --- | --- |
| `skills/` | Instructions the agent follows |
| `hooks/` | The session notice and the write protection |
| `ci/check-acceptance-guard.js` | Approved sentences and skipped tests |
| `ci/check-trace.js` | Sentence, scenario and step definition trace |
| `ci/check-red-green.js` | Red before green |
| `ci/red-reason.js` | Reads Cucumber messages or JSON reports and decides whether a failure is missing behavior |
| `ci/gherkin.js` | Shared Gherkin parsing |
| `action.yml` | The GitHub Action |
| `cli/touchstone.js` | `init`, `check`, `guard` and `red`, published as `@wosslabs/touchstone` |
| `examples/` | The same todo list in seven stacks |
| `templates/` | Workflow, CODEOWNERS and Cursor hook files to copy |
| `evals/` | The harness that tests whether agents follow the skills |
| `attacks/` | Bad changes the pipeline must reject, and one honest change it must accept |
| `tests/` | Unit tests for the hook, the checks, init and the eval checks |

## Background

Touchstone draws on acceptance-test-driven development, behavior-driven development, and current practice in agent-assisted software engineering, including the work of Dave Farley and open-source agent workflows such as Superpowers, agent-skills, GitHub Spec Kit, BMAD, and Disciplined Agentic Engineering. The text in this repository is original.

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
