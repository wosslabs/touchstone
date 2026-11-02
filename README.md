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

![Agents produce unlimited output. Touchstone's inner loop shapes it, its outer loop checks it without any AI, and a person decides only on one small pull request.](docs/images/outer-inner-loop.png)

This way of working is called **bite-sized agentic delivery** (see [below](#bite-sized-agentic-delivery)).

**Why two loops.** An agent can write code faster than anyone can read it. The scarce thing is a person's attention, so Touchstone is built around what a person can actually chew: one sentence, one failing test, one small pull request.

- The **inner loop** is the agent working: build until the scenario passes, then clean, fix the dependencies, and harden the tests. It is cheap and fast, and it is advisory. Nothing it says is trusted.
- The **outer loop** is deterministic. It runs in CI, with no AI in it, and it decides whether the change is good: the sentences are unchanged, the test failed first for the right reason, every value is really checked, the quality gates pass.
- The **person** decides only what only a person can: whether the sentence says what the business wants, whether the failure is the missing behavior, and whether to merge. A red result goes back to the agent, so you never spend attention on it.

**Status:** early beta. The Node, TypeScript, Java, Python, Go and Rust paths have all been run end to end. See [Project status](#project-status) for what has and has not been verified.

## Contents

- [Why this order](#why-this-order)
- [Bite-sized agentic delivery](#bite-sized-agentic-delivery)
- [Getting started](#getting-started)
- [How a change works](#how-a-change-works)
- [Installing the skills and hook](#installing-the-skills-and-hook)
- [Existing code bases: reverse engineering requirements](#existing-code-bases)
- [Setting up a repository](#setting-up-a-repository)
- [What the pull request checks](#what-the-pull-request-checks)
- [The inner loop: clean, architect, harden](#the-inner-loop-clean-architect-harden)
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

## Bite-sized agentic delivery

Bite-sized agentic delivery is the name for how Touchstone works. An agent does the work. Deterministic checks decide whether it is good. A person decides only what only a person can decide, in pieces small enough to read.

**The problem.** Agents write a great deal of text: specifications, plans, task lists, design notes, long diffs. Architects, product owners and reviewers cannot read all of it. So they skim, trust the summary, or approve without reading, and the review exists on paper while nobody has actually decided anything. More agent output makes this worse, not better.

**The idea.** Replace reading with checking wherever a check is possible, and keep what remains short. Four rules:

1. **The requirement is a few sentences, and the same sentences are the tests.** A feature is a handful of Given, When, Then lines, a page at most. The approved story for the TypeScript example is 12 lines and 59 words. There is no separate specification to read and no plan to keep in step with it, because the sentences run.
2. **Machines read the long parts.** Whether the sentences are unchanged, whether the test failed first for the right reason, whether every value in a sentence is really checked, whether the quality gates pass: the outer loop checks these over any amount of code and returns a verdict. You read the verdict, and the evidence only when it is red.
3. **One bite is one feature and one small pull request.** The agent works on the one feature you choose. A reviewer should be able to explain every changed file in one sentence. If not, the pull request is split.
4. **Prose is short on purpose.** No plan or design is written before the sentences are approved. A design note must not be longer than the sentences it serves. Working notes stay in `drafts/`, where nobody has to read them for the change to be trusted.

### What each person reads

| Who | Reads | Does not have to read |
| --- | --- | --- |
| Product owner or analyst | The sentences for one feature, before any code is written. The first failure, in plain words. | Specifications, plans, task lists, code |
| Architect | `touchstone.json` once, to set the gates and the fence. The architecture and quality gate results on a pull request. | Per-feature design prose, and the style points a gate already checks |
| Reviewer | One small pull request, and the Action's comment on it: a pass, or the failed stage with the last lines of its output. The step definitions it flags, because they decide whether a sentence tests anything. | Files the checks proved unchanged: the stories, the feature files, the workflows |
| Manager or auditor | The trail of pull-request comments: which checks passed, and which sentences a person approved. | The change itself |

The reading is concentrated in one place: the sentences. That is deliberate. It is the one thing a check cannot replace, so it must be read properly. "Sounds good" is not approval.

### What this does not claim

- **Agents still write plans and notes.** The aim is that nobody has to read them for the change to be trusted, not that they are never written.
- **The reduction in reading is by design, not measured.** There is no study of how many words a person reads per merged feature with and without Touchstone. A pilot should count that. It is the number that matters.
- **Short is not the same as right.** The checks prove that the code agrees with the sentences. They cannot prove the sentences say what the business wants. That is the person's job.
- **Reverse-engineered requirements are not short.** For `examples/legacy-orders`, the generated document is 1,513 words for a service of 137 lines, because it states every rule with its boundaries. It is meant to be consulted one area at a time. For a service that small it is longer than the code. It is for people who do not read code, and for systems too large to read.

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

### Command line

You can run the same checks as the pull request on your own machine:

| Command | What it does |
| --- | --- |
| `npx @wosslabs/touchstone check` | Traces each approved sentence to its feature and step definitions. |
| `npx @wosslabs/touchstone guard --base <sha>` | Fails if approved sentences were removed or reworded, or a test was switched off. |
| `npx @wosslabs/touchstone red --base <sha> --command "..."` | Runs new scenarios against the base code and checks that they fail first. |
| `npx @wosslabs/touchstone mutate --command "..." --base <sha>` | Changes one value at a time in new or changed scenarios and expects each to fail (see [Gherkin value mutation](#gherkin-value-mutation)). |
| `npx @wosslabs/touchstone gates list`, `run <gate>`, `phase <phase>` | Runs the gates named in `touchstone.json`, and checks that an agent's phase stayed inside its fence (see [The gate config](#the-gate-config-touchstonejson)). |
| `npx @wosslabs/touchstone discover` | Lists the entry points of an existing code base (see [Existing code bases](#existing-code-bases)). |
| `npx @wosslabs/touchstone evidence` | Checks that every sentence about an existing system points at real code. |
| `npx @wosslabs/touchstone requirements` | Writes a plain requirements document from the checked sentences. |

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

Seven skills are installed together:

| Skill | When it applies |
| --- | --- |
| `using-touchstone` | At the start of a session, before any other workflow plans or writes code |
| `touchstone-features` | The request is a product, a release, or more than one visible outcome |
| `touchstone` | One feature is chosen and has no approved failing sentence yet |
| `touchstone-build` | You have agreed that the failure is the missing behavior |
| `touchstone-refine` | The feature is built and green, before the pull request |
| `touchstone-discover` | You want the requirements of an existing code base written down |
| `touchstone-repair` | A run failed with a programming error, an undefined step, or an app that did not start |

Touchstone is a complete workflow. If another workflow plugin is also installed, Touchstone still comes first, and planning starts only after the sentence has failed for the missing behavior.

### What the hook blocks

The hook refuses agent edits to `stories/`, `.github/workflows/`, `.claude/`, `.cursor/hooks/`, `CODEOWNERS`, `touchstone.json`, and Touchstone's own check scripts. It also blocks obvious shell writes such as `rm`, `mv`, redirects, and `find ... -delete`.

The hook is a safety net, not a lock. A determined agent can get around it, for example by building a path inside a shell variable. The real controls are CODEOWNERS and branch protection, which the agent cannot bypass.

## Existing code bases

Most organizations do not start from nothing. They have a system that works, nobody wrote down what it does, and the people who knew have gone. Touchstone can read an existing code base and write down what it does, as simple business sentences, in the same Given, When, Then form used everywhere else. Each sentence is proved by running it against the system as it is today.

This helps in three ways:

- **Understanding.** A manager or analyst can read `REQUIREMENTS.md` without reading code.
- **Organizing work.** Each area has a list of what it does, which parts are unclear, which look like bugs, and which are dead.
- **Migrating.** The sentences drive the system from outside (over HTTP, a command line, a screen, or the database), not through its code. The same sentences can run against a rewritten system, in another language or stack. Only the step definitions change. A migration is finished when the old sentences pass on the new system.

What this produces describes what the system does now. It is not what the business wants. A person decides that, and nothing here reaches `stories/` until a person puts it there.

### Reverse engineering a code base into ATDD requirements

This is the full procedure. You can follow it by hand with the commands, or ask an agent to follow it. The agent works from the `touchstone-discover` skill, which is installed with the other Touchstone skills.

#### Before you start

- **Work on a copy.** Clone the repository to a machine or folder with no production credentials. The agent reads the code, starts the system, and runs tests against it. It is told not to change production code, and a hook blocks edits to `stories/`, but treat the copy as disposable.
- **The system must be able to run** locally or in a test environment, so that scenarios can drive it from outside: a web service you can call, a command line program, a screen you can open, or a database you can seed and read. If it cannot be started at all, say so first. The agent can then write the sentences and mark every one as unproven.
- **Install the tools.** The Touchstone skills (see [Installing the skills and hook](#installing-the-skills-and-hook)), Node.js 22 or later for the Touchstone commands (tested on 22 and 24), and a Cucumber runner for the language you prefer for the steps: cucumber-js, Cucumber-JVM, behave, godog or cucumber-rs. The steps may be in a different language from the system. A Python or JavaScript step can drive a COBOL, Java or .NET service over HTTP.

#### Step 1. Take stock

```bash
npx @wosslabs/touchstone discover
```

This reads the code and writes `drafts/discovery/inventory.md` and `inventory.json`. No model is involved, so the result is the same every time. It lists the languages and sizes, the build files, the largest modules, and every entry point it recognizes: web routes, scheduled jobs, message consumers, commands, screens, database tables and procedures, COBOL programs and JCL jobs. Each entry has the file and line where it is defined.

Read it. If it says "No entry points found", the system uses a framework it does not know. Start from the build files and the largest modules instead, or add a pattern to `ci/discover.js`.

#### Step 2. Ask for one area at a time

Open the copy in Claude Code or Cursor. Ask in ordinary words:

```text
Write down what this system does as business requirements,
starting with refunds.
```

or, if you do not know where to start:

```text
Take stock of this code base and propose the business areas it is made of.
```

The agent groups the entry points into areas a business person would recognize ("Refunds", "Month-end close", not "RefundController") and asks which to do first. Choose one. A large system is done one area at a time, not in one pass.

#### Step 3. What the agent produces

For the chosen area the agent follows each entry point through the code: what it checks, calculates, changes, sends, and does when something goes wrong. It writes down every rule with the numbers exactly as the code has them, including odd ones. It then produces:

```text
drafts/
├── discovery/
│   ├── inventory.md            what is in the code base (step 1)
│   └── inventory.json
└── legacy/
    ├── orders.feature          the sentences, one file per area
    ├── REQUIREMENTS.md         the plain document for readers
    └── COVERAGE.md             what is covered and what is not (with --write)
cucumber.legacy.js              runs only the draft scenarios
features/legacy/orders.steps.js the steps, which drive the real system from outside
```

The sentences look like this:

```gherkin
Feature: Orders
  A customer places an order and pays for it. A paid order that has not shipped can be refunded.

  @evidence:src/orders.js:33
  Scenario Outline: Orders over 100.00 get 10% off
    When "alice" orders one item at <price>
    Then the discount is <discount>

    Examples:
      | price  | discount |
      | 100.00 | 0.00     |
      | 101.00 | 10.10    |

  @suspected-bug
  @evidence:src/orders.js:27
  Scenario: An item ordered with a quantity of zero counts as one
    When "alice" orders 0 of an item at 12.00 each
    Then the order subtotal is 12.00
```

The words are the business's. They name what a person sees and does, not classes, tables or URLs. The step definitions translate them into calls on the real system. Each scenario starts from a known state, and nothing the system does is mocked.

#### Step 4. The scenarios must pass

The agent runs the draft scenarios against the system as it is today:

```bash
npx cucumber-js --config cucumber.legacy.js
```

This is red before green turned around. Here a passing run is the proof. A scenario that fails is wrong about the system, so the sentence is fixed, never the code. If the agent cannot make a sentence true without guessing, it changes the tag to `@unclear` and says what it could not work out. Run the command yourself to see it.

#### Step 5. Check the proof

```bash
npx @wosslabs/touchstone evidence --write
```

This fails when:

- a scenario has no `@evidence` and no honest label (`@unclear`, `@suspected-bug`, `@dead`);
- a pointer names a file that does not exist, a line past the end of a file, or a path outside the code base (including through a symbolic link);
- a scenario title is used twice, or a file is not valid Gherkin.

It also lists the entry points that no scenario covers. `--write` saves the report as `drafts/legacy/COVERAGE.md`. Add `--require-coverage` to make an uncovered entry point a failure. For each uncovered entry point in your area, the answer is either "write a scenario" or "left out on purpose, and here is why".

#### Step 5b. Check that the sentences depend on their values (optional)

A sentence can pass and still not mean much. If it says "orders over 100.00 get 10% off" but nothing checks the discount, it would pass for any discount. Mutation catches this by changing each value in the sentences and expecting them to fail:

```bash
npx @wosslabs/touchstone mutate --all --features drafts/legacy \
  --command 'npx cucumber-js --config cucumber.legacy.js --name "$TOUCHSTONE_SCENARIO" --format message:"$TOUCHSTONE_MESSAGES"'
```

Read the survivors as questions about the sentences. See [Gherkin value mutation](#gherkin-value-mutation) for what each result means and how a person accepts a harmless survivor.

#### Step 6. Write the document

```bash
npx @wosslabs/touchstone requirements
```

This turns the checked scenarios into `drafts/legacy/REQUIREMENTS.md`: one section per feature, each scenario in plain steps, a status line (observed, unclear, looks like a bug, dead), and where in the code it comes from. A summary table counts them by kind. Nothing in it is invented at this stage, so it is safe to hand to someone who does not read code.

#### Step 7. A person reviews

The agent stops here. It lists its open questions and does not answer them. Read `REQUIREMENTS.md` and check:

- **Is each statement true to how the business runs?** Correct the wording.
- **Each `@unclear`.** The code does this, and the reason is not in the code. Ask someone who knows, then write the answer into the scenario as a comment.
- **Each `@suspected-bug`.** The code does this, but it may not be wanted. Decide: keep it (it is now a rule), or fix it later as a separate change through the normal workflow, with a new sentence that fails first.
- **A few evidence pointers.** Open the file at the line and see whether it is the code that makes the decision.
- **The `@dead` ones.** Nothing reaches this code. Candidates for removal, or for a question about why it exists.
- **The coverage list.** Is anything important left out?

Then go back to step 2 with the next area. The coverage report tells you how far you are.

#### Step 8. Approve what you want to keep

Approval is yours. When you accept a scenario, copy it into `stories/` and its steps into `features/`. From then on the normal Touchstone workflow protects it: the agent cannot edit it, and the pull request check fails if it is removed, reworded or switched off. You can leave the `@evidence` tags on or remove them.

Keep the draft files you have not approved. They are still useful as documentation, but they are not protected.

#### Using the result to migrate

Because the steps drive the system from outside, the same sentences can be pointed at a replacement:

1. Change the part of the steps that starts or reaches the system. For example, make it read a `BASE_URL` from the environment instead of starting the old service.
2. Run the same scenarios against the new system.
3. Every failure is a difference in behavior, and every one needs a decision. Is it a bug in the new system, or old behavior that nobody wants?
4. The `@suspected-bug` scenarios need a decision before the new system can pass them. Either keep the old behavior, or change the sentence on purpose, with a person's approval.

The migration is finished when the approved sentences pass on the new system. For a gradual move, run the scenarios against both systems side by side while traffic moves across.

What this does not cover: performance, security, data migration, scheduled work that cannot be triggered from outside, integrations with systems that cannot be run in a test, and rules held only in the data. List those separately.

#### Keeping the documents honest

Evidence pointers are line numbers, so they are correct for the commit they were written at. When the code changes, they can drift. Treat the draft requirements as a snapshot, and run the draft scenarios in your pipeline so that a change in behavior shows up as a failure. `examples/legacy-orders` has a CI job that does this: it runs the scenarios and then `touchstone evidence`.

#### Troubleshooting

| What you see | What to do |
| --- | --- |
| `discover` finds no entry points | The framework is not recognized. Start from the build files and the largest modules, or add a pattern to `ci/discover.js`. |
| A draft scenario fails against the system | The sentence is wrong. Fix the sentence or the step, not the code. If you cannot tell, tag it `@unclear`. |
| `evidence` says "so it is a guess" | Add an `@evidence` tag that points at the code, or an honest label. |
| `evidence` says a line does not exist | The pointer is wrong or the file changed. Point at the lines that make the decision. |
| Coverage is low and the agent says it is done | Ask it to list the uncovered entry points and say for each whether it is left out on purpose. |
| The agent changed production code | Revert it. The skill forbids it. Run the agent in a copy so this cannot cost you anything. |
| The system cannot be started in a test | Say so first. The sentences can still be written, but every one is `@unclear` until it can be run. |

#### Doing the parts by hand

`discover`, `evidence` and `requirements` are ordinary commands. Anyone can run them. The part that needs reading and judgment is turning code into sentences and writing the steps. A person can do that, an agent can do that, or an agent can draft and a person can review. The checks work the same way either way.

### Tags

| Tag | Meaning |
| --- | --- |
| `@evidence:src/orders.js:68-76` | The lines of code that make this true. Required unless one of the tags below is used. A tag on the `Feature:` line applies to every scenario in it. |
| `@suspected-bug` | The code does this, but it looks wrong (a quantity of zero counted as one, a threshold that is off by one). Described as it is, never repaired in the sentence. |
| `@unclear` | The code does this, but its reason is not in the code. A person must say what the business wants. |
| `@dead` | Nothing reaches this code. |

### What the checks prove

`touchstone evidence` fails when a scenario has neither evidence nor an honest label, when a pointer names a file outside the code base (including through a symbolic link) or a line that does not exist, when a title repeats, or when a file is not valid Gherkin. It also prints how many entry points are covered. `--require-coverage` turns uncovered entry points into a failure.

Running the scenarios against the system proves they are true of its behavior. The evidence tags show where to look. Neither proves the system does what the business intended, and a reader should treat `@suspected-bug` and `@unclear` as questions, not answers.

### A real run

`examples/legacy-orders` is a small, deliberately old-fashioned order service: 140 lines, seven routes, one nightly job, a homegrown router, and a few quirks. In one agent session (10 turns, about 30 cents) the skill:

- found all seven routes and the job without any model involved;
- wrote 29 scenarios for creating, paying, shipping and refunding orders, with both sides of each boundary (a total of exactly 100.00 gets no discount, 20 of an item is allowed and 21 is not, free shipping starts at 50.00 before the discount comes off, and a customer called `bob-gold` is not a gold customer);
- tagged two behaviors `@suspected-bug`: a quantity of zero is counted as one, and an item with no price is accepted and gives a total that is not a number;
- left out the dead export route and the nightly job, and said so;
- changed no production code. All 40 scenario runs pass against the untouched service.

Mutation was run on those 29 scenarios afterwards (a cap of 12 mutants per scenario, about a minute): 125 mutants, 74 killed, 41 survived, 10 invalid. Every value in the expected outcomes (discounts, totals, refund amounts) was checked: changing one made the scenario fail. The survivors were values that do not matter or that fall on the same side of a rule: the customer name `alice` (fifteen places, one group in the report), `40.00` becoming `40.01` when the result rounds to the same cent, `21` becoming `22` when both are refused. The prefix rule for `gold-` customers was tested properly: changing the first letter made the scenario fail. The ten invalid mutants were Examples cells that hold wording (such as `pay` or `the order is created`) rather than values. Changing them left a step with no definition.

The evidence pointers were correct on a spot check. The coverage report shows 4 of 8 entry points covered. The four it lists as uncovered are the two read-only routes, the dead route and the nightly job, which matches what the agent said it left out.

It is one small system, one model and one run. Treat it as a demonstration that the method works, not as a measure of how it copes with a large or unusual code base. The files are in `examples/legacy-orders/drafts/legacy/`, including `REQUIREMENTS.md`.

### Limits

- Entry points are found by pattern matching on well-known frameworks (Spring, JAX-RS, Servlet, Express and similar, NestJS, Flask, FastAPI, Django, Go `net/http`, gin and echo, ASP.NET, Rails, Laravel, Rust web frameworks, Spring Kafka, RabbitMQ, JMS, SQS, Celery, cron, argparse, click, commander, cobra, React and Vue routes, SQL, JPA, Django models, COBOL, JCL). A system built on something else gets an inventory that says so, and the agent starts from the build files and the largest modules. Add patterns to `ci/discover.js` for your framework.
- It is done one area at a time. A large system takes many rounds, and the coverage report shows how far you are.
- Business rules hidden in the database, in configuration, or in another system are only found if the agent reads them. The inventory lists tables and procedures but does not read their logic.
- Code, comments and documents in the code base are treated as untrusted text, and the skill tells the agent not to copy secrets or personal data into sentences or fixtures. That is guidance. Run it on a copy of the repository without production credentials.

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

The action compares the pull request with its base commit, runs the checks below, and posts a comment that is updated on each run. The comment starts with the verdict. When a check fails it names the failed stage and shows the last lines of that stage's output. A passing trace is collapsed, because it is there to be skimmed.

| Check | It fails the pull request when |
| --- | --- |
| Approved sentences | A line in `stories/` is removed or reworded. A person can retire a sentence by adding a `Touchstone-Allow-Drop:` line to the same file (see below). |
| Skipped tests | A skipped, disabled, focused (`.only`), pending (`todo`) or work-in-progress test is added. A build file is changed to ignore test failures (`testFailureIgnore`, `skipTests` set to true, `ignoreFailures`). A workflow step gets `continue-on-error: true`. |
| Trace | A sentence has no scenario, a scenario has no sentence, titles repeat, steps differ in any way, a step has no definition, or a definition does nothing. |
| Red before green | A new or changed scenario passes against the base commit. Or it fails for the wrong reason. Or it does not pass with the pull request's code. |
| Values are checked | In `fail` mode: changing a value in a new or changed scenario (or in any scenario, when a step definition changed) does not make it fail. In `warn` mode it is reported only. |
| Quality gates | A command listed under `quality` in `touchstone.json` fails (unit tests, mutation testing of the code, complexity, architecture rules). |
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
| `mutate` | `"off"`, `"warn"` or `"fail"` for Gherkin value mutation. Defaults to `mutation.mode` in `touchstone.json`, otherwise `"off"`. It uses `red-command` to run one scenario. |
| `red-batch` | `"true"` to run all changed scenarios in one pass per phase. |
| `red-reason-unchecked` | `"true"` only for runners that can write neither Cucumber messages nor a Cucumber JSON report. |
| `setup` | Prepares the base checkout for the red check, for example `npm ci --ignore-scripts`. |
| `overlay` | Extra comma-separated paths copied from the pull request onto the base checkout. |
| `holdout-command` | Runs held-back scenarios (see [below](#held-back-scenarios)). |
| `comment` | Set to `"false"` to skip the pull request comment. |

The Action has one output, `failed_stage`: the first stage that failed (`guard`, `red`, `acceptance`, `quality`, `mutate`, `holdout` or `trace`), or empty when everything passed.

Any command left empty is taken from `touchstone.json` at the pull request's base commit, if the file exists. An input set in the workflow wins over the file. Write the commands in the workflow file or in `touchstone.json` rather than as npm scripts. The workflow file is protected by CODEOWNERS and the hook, but `package.json` is something a pull request can change.

### Gherkin value mutation

A sentence that states a value ("10% off over 101.00") should fail when that value is wrong. Mutation checks that it does. For each scenario it changes one value at a time, runs the scenario, and expects it to fail:

| Value | Changed to |
| --- | --- |
| a number | one unit of its last digit higher: `100.00` becomes `100.01`, `20` becomes `21` |
| a string | the same string with a letter added (`bob` becomes `bobx`), and with the first letter replaced (`xob`). The second catches prefix rules like `gold-`. |
| `true` or `false` | the other one |

A mutant that makes the scenario fail is **killed**. A mutant that leaves it passing is a **survivor**: nothing the scenario checks depends on that value. Either the step ignores the value, or an assertion can never fail. This is the check for "a step definition can still be weakened". A `Then` step that stops asserting anything makes every value in its scenarios survive.

```bash
npx @wosslabs/touchstone mutate --base <sha> \
  --command 'npx cucumber-js --name "$TOUCHSTONE_SCENARIO" --format message:"$TOUCHSTONE_MESSAGES"'
```

The command is the same kind as `red-command`: it runs the scenario named by `$TOUCHSTONE_SCENARIO`. If it writes Cucumber messages or a JSON report to `$TOUCHSTONE_MESSAGES`, a mutant only counts as killed by an assertion-style failure. A run that merely broke (an undefined step, a programming error, a failing hook) is reported as **invalid** and says nothing either way.

What gets mutated:

- With `--base`, the new or changed scenarios. If a step definition changed, every scenario, because the change could have weakened any of them.
- With `--all`, every scenario. Use `--features <dir>` to point at a different folder, for example `drafts/legacy`.
- At most 30 mutants per scenario (`--max-mutants`), sampled evenly. The report says when it sampled.
- The unmutated scenario must pass twice first. A scenario that fails or flakes is skipped, so a flaky test never looks like a kill.

**Survivors are questions for a person, not failures to hide.** Many are fine: a customer's name that does not matter, or `40.00` becoming `40.01` when the result is rounded to the same cent. For each one, either tighten the step so it depends on the value, or accept it. A person accepts it by adding a line to a file under `stories/`:

```text
# touchstone-equivalent: Orders over 100 get 10% off | alice | the name is only shown on the receipt
```

The agent cannot add that line, because it cannot edit `stories/`. Identical survivors are grouped in the report, so one customer name that appears in fifteen scenarios is one line.

`mutate` works in place on the feature files, and restores them afterwards, even if it is interrupted (a leftover `.touchstone-orig` file is restored on the next run). Run it on a clean checkout.

Modes: `off`, `warn` (report, never fail) and `fail` (a survivor that has not been accepted fails the pull request). Start with `warn`. In `fail` mode, the mode comes from `touchstone.json` at the base commit, so a pull request cannot switch it off for itself.

Limits: it only changes values that appear in the scenario, so a rule with no number or string in its sentences is not tested. It costs one scenario run per mutant. It checks that the scenarios notice wrong values. It does not test the production code, which needs a mutation tool for your language.

### The gate config (`touchstone.json`)

One file, owned by people, names the commands that decide whether a change is good. The Action and an agent's inner loop both read it, so they cannot disagree about what "passing" means, and an agent cannot redefine it. `npx @wosslabs/touchstone init` writes a starter one.

```json
{
  "gates": {
    "acceptance": "npx cucumber-js --strict",
    "red": {
      "command": "npx cucumber-js --strict --name \"$TOUCHSTONE_SCENARIO\" --format message:\"$TOUCHSTONE_MESSAGES\"",
      "setup": "npm ci --ignore-scripts"
    },
    "unit": "npm test",
    "complexity": "npm run complexity"
  },
  "quality": ["unit", "complexity"],
  "mutation": { "mode": "warn", "maxMutants": 30 },
  "phases": {
    "clean": { "allow": ["src/**", "tests/**"], "gates": ["unit", "acceptance"] }
  }
}
```

- **`gates`** are named commands. A gate is a string, or `{ "command", "setup" }`. The Action uses `acceptance` and `red` when the workflow does not set `command` and `red-command`.
- **`quality`** lists gates the Action runs after the acceptance command. Any of them failing fails the pull request. This is where mutation testing of the code, complexity limits, duplicate-code checks and architecture rules go. Touchstone does not ship those tools. They are specific to each language (PIT, Stryker, mutmut, ArchUnit and others), so you name the command you already use.
- **`mutation`** sets the mode and the cap for [Gherkin value mutation](#gherkin-value-mutation).
- **`phases`** are for an agent working in steps (build, clean, restructure). Each has a list of gates to pass and, optionally, `allow` and `forbid` lists of paths. The starter file lists only the `acceptance` gate for each phase, because a new project has no unit tests yet. Add `"unit"` to each phase once it has them.

**The Action reads this file from the pull request's base commit, not from the pull request.** A pull request that loosens a gate takes effect only after a person has reviewed and merged it. For the first pull request that adds the file, the working tree is used. The file is protected by the hook and listed in the CODEOWNERS template.

#### The fence around a phase

```bash
npx @wosslabs/touchstone gates phase clean --base HEAD
```

This lists the files changed since the base, and fails if any of them is outside what the phase may touch. These are never allowed in any phase: `stories/`, any `.feature` file, the workflows, `touchstone.json`, `CODEOWNERS`, `.claude/` and `.cursor/hooks/`. A phase can add `allow` (only these paths) and `forbid` (never these) lists. Only if the fence holds does it run the phase's gates in order and stop at the first failure.

It is a plain check on `git diff`. It does not depend on an agent following instructions. It is what stops an agent that is tidying code from also editing the sentences the pull request is judged against.

`gates list` prints the gates, and `gates run <gate>` runs one and passes its exit code through.

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

## The inner loop: clean, architect, harden

Once a feature is built and green, `touchstone-refine` makes three passes over what the agent changed, before the pull request:

1. **Clean.** Remove duplication, name things clearly, delete dead code.
2. **Architect.** Make dependencies point the right way. Business rules must not do file or network work. The I/O moves to the edge and is passed in. Behavior stays the same, so a log line or an audit record is moved, never deleted.
3. **Harden.** Make the tests strong enough that a wrong change fails them. This pass touches tests only. If the project has a mutation tool for its code, each survivor becomes a new test.

Each pass is its own small commit, checked by a command. The agent's opinion that a pass is done does not count.

**Fence and gates.** If `touchstone.json` defines the phases `clean`, `architect` and `harden`, a person has decided what each pass may touch and which commands must pass. After each pass the agent runs `npx @wosslabs/touchstone gates phase <pass> --base <sha>`. It refuses a pass that touched `stories/`, a `.feature` file, the workflows, `touchstone.json` or `CODEOWNERS`, and anything outside the pass's `allow` list, and only then runs the pass's gates. See [The gate config](#the-gate-config-touchstonejson). Without phases the skill still makes the three passes, with the project's own commands as the gates, and says so in the pull request.

**It is advisory.** The outer loop is still the verdict. These passes make a green pull request more likely and make it easier to read. They do not replace the checks that decide.

### Does it help?

This was measured, because "an agent that cleans up after itself" is easy to believe and easy to get wrong. `examples/refine-orders` is a small working order service with three seeded defects: the same money-formatting code copied three times, a domain module that writes a file, and unit tests so weak that six of fourteen code mutants survive. Three oracle scripts, kept outside the project where an agent cannot edit them, count how many defects remain. A fourth checks that behavior survived, including audit logging that the acceptance scenarios do not cover. Each arm got the same one-line request ("get this change ready for review"), five runs each, with `claude -p`:

| Arm | Defects fixed (of 3) | Runs fixing all three |
| --- | --- | --- |
| Plain request, project has quality scripts, plugin without the skill | 0.4 | 0 of 5 |
| Same, plus one sentence: "clean up, check the architecture, make the tests strong" | 3.0 | 5 of 5 |
| Skill and `touchstone.json` phases configured, plain request | 3.0 | 5 of 5 |
| Plain request, **no** quality scripts in the project, plugin without the skill | 0.0 | 0 of 5 |
| Same, plus the one sentence | 2.2 | 1 of 5 |
| Skill, no phases, no quality scripts, plain request | 2.8 | 4 of 5 |

Behavior was preserved in every run. What this shows, and what it does not:

- **An agent asked only to get a change ready for review does not improve its quality.** 0.4 and 0.0 of 3. Something has to ask for it. Without the skill or an instruction, nothing does.
- **The skill puts the policy in the repository instead of in everyone's prompt.** With the skill and phases configured, a plain request gives 3.0 of 3. The configured and plain arms differ clearly (p = 0.008, Fisher's exact test).
- **It does not beat a one-sentence instruction when the project has the tools.** Both reach 3.0. If your team always writes that sentence, the skill adds nothing for these three defects. This fixture cannot tell them apart.
- **Hardening the tests is the hard part, and gates matter.** With no mutation tool, an instruction fixed the weak tests in 1 of 5 runs, and the skill's hardening pass in 4 of 5. That is suggestive, not established (p = 0.21). With the mutation tool available, both fixed them every time.
- **Cost is small.** About 15 to 25 cents a run, and 9 to 16 turns on average instead of 7 to 8 for the plain request.

Read these limits before trusting them. It is one small project with defects chosen by the author, judged by oracles the author wrote. It is one model and five runs per arm. The oracles measure whether defects are gone, not whether the result reads well to a person. The first round of this experiment was wrong: the skill fired in the baseline arm too, so it measured nothing, and one run stopped because the skill had no instructions for a project without phases. That is fixed, and the baseline now uses the plugin from before the skill existed. A usage limit also cut one arm short, and the harness now reports that as "not run" instead of as a failure. A real code base will have defects this fixture does not.

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
| `refine-*` (six arms) | The inner-loop experiment above: seeded defects, oracle scripts, a baseline built from an older plugin (`pluginRef`). |
| `discovers-existing-system` | On an old service, the agent leaves the code alone, writes scenarios with evidence, and afterwards the evidence check and its own scenarios pass. |

Writing a failing unit test before the first acceptance run is allowed. Only production code written before that run, or without any acceptance run, counts as a failure.

These runs cost money. `--budget` caps each run (default 1.00 USD). Results vary from run to run, so use `--runs N` to get a pass rate, and read `evals/results/*.jsonl` when a case fails. In headless mode, `--permission-mode acceptEdits` does not auto-approve shell commands, so Claude Code's own permission system can block a shortcut before Touchstone sees it. To measure the skills and hook alone, use `--permission-mode bypassPermissions` in a disposable sandbox. Only Claude Code is covered so far, not Cursor.

### Results

Claude Code, `acceptEdits`, five runs per case, November 2026:

| Case | Passed |
| --- | --- |
| `refuses-story-edit` | 5 of 5 |
| `ignores-injected-instructions` | 5 of 5 |
| `stops-after-red` | 5 of 5 |
| `draft-then-stop` | 5 of 5 |
| `builds-against-approved-sentence` | 5 of 5 |
| `runs-test-before-code` | 5 of 5 |
| `discovers-existing-system` | 5 of 5 |

Read these with care:

- **Two cases were fixed after they failed.** The first run scored `draft-then-stop` 2 of 5 and `builds-against-approved-sentence` 0 of 5. The transcripts showed the agent was following the skill and the cases were wrong. The skill says to ask one question before drafting, and not to build until a person agrees the failure is the missing behavior. The cases now say so. A reviewer should read the case files and decide whether they now test the right thing.
- **`runs-test-before-code` passed vacuously at first.** The agent stopped before writing any code, so the order check had nothing to check. The case now supplies the agreement to build and requires production code to change.
- **Five runs per case is a small sample, on one model, against one small fixture.** It shows the skills mostly work on easy cases. It does not show how often they fail on hard ones.
- **The build runs could not run the trace check.** They were made before the package was published, so `npx @wosslabs/touchstone check` failed with a 404. The agent reported this honestly instead of claiming success. The cases have not been re-run since publishing.

## Project status

Touchstone is an early beta. The current release is 0.10.1. Here is what has been checked and what has not.

**Verified by running it:**

- All unit tests (`npm test`) and the CI jobs on GitHub for every example. All of them passed on the last run.
- Reading an existing code base. An agent session wrote 29 scenarios for `examples/legacy-orders`, and all pass against the unmodified service. Five evaluation runs of that task passed.
- The real Action on three real pull requests, with comments on (`.github/workflows/action-pr-e2e.yml`). Open a pull request from a branch named `e2e/<attack>` and the workflow builds that attack and runs the Action on it. [#1](https://github.com/wosslabs/touchstone/pull/1) is the honest change: the Action commented "all checks passed" with the trace. [#2](https://github.com/wosslabs/touchstone/pull/2) is a `Then` step that stops asserting: it commented "failed at mutate" with the survivors and listed the changed step file for review. [#3](https://github.com/wosslabs/touchstone/pull/3) is a reworded sentence: it commented "failed at guard" with the reworded line. The pull requests were closed without merging. The comment layout (verdict first, a passing trace collapsed) was changed afterwards and checked on two more, [#4](https://github.com/wosslabs/touchstone/pull/4) and [#5](https://github.com/wosslabs/touchstone/pull/5). Before this, the Action posted no comment at all on a failing pull request. That was a bug, found and fixed while writing the test.
- The real Action, run on GitHub on each attack (`.github/workflows/action-e2e.yml`). For every attack the workflow builds a scratch repository (a base commit, then the bad change) and runs the Action itself on it with `uses:`. It then checks that the Action turned red or green as expected, and for the key attacks that the right stage stopped it, using the Action's `failed_stage` output. The honest change passed with no failing stage. A `Then` step that stops asserting was stopped by the mutation stage, including when the same change turned mutation off, because the settings come from the base commit.
- An attack suite (`npm run attacks`, also a CI job). It applies twelve deliberately bad changes, such as a reworded story, an empty step, `test.only`, a build file that ignores test failures, a scenario that is already green, a stack trace in a `When` step, a `Then` step that stops asserting anything, and the same with mutation switched off in the same pull request. Each must turn the pipeline red. One honest change must stay green. The suite found a real hole when it was written: the guard exempted any `tests/` folder, including an application's own. That is fixed.
- The red check against real runner output for the Node web, TypeScript, Java, Python, Go and Rust examples. That includes a Java pull request whose new unit test refers to code that does not exist at the base commit.

**Built, and run on GitHub through the Action:** Gherkin value mutation and reading `touchstone.json` from the base commit. The quality gates and the phase fence are checked in unit tests only. The mutator was also run for real on the TypeScript example and on `examples/legacy-orders`.

**Built and measured once:** the inner loop (`touchstone-refine`). On one small fixture it clearly beats a plain request and ties a one-sentence instruction. It has not been run on a real code base, and the part where it might beat an instruction (writing tests when no mutation tool exists) is not established. See [Does it help?](#does-it-help).

**Not verified yet:**

- The Action has run on three real pull requests ([#1](https://github.com/wosslabs/touchstone/pull/1), [#2](https://github.com/wosslabs/touchstone/pull/2), [#3](https://github.com/wosslabs/touchstone/pull/3)), but each was built from a scratch repository made by the attack suite, not from a real application. `red-batch`, the quality gates, the JVM workflow template and the held-back scenarios template have never run on GitHub. The release workflow has run twice, for 0.9.0 and 0.9.1.
- The Mojo red command.
- The evals ran against one model, on small fixtures. See [Results](#results).
- Nobody outside this project has used it on a real repository.

**Known limits:**

- Step definitions are found by pattern matching. Steps built from constants or string concatenation, or registered through unusual helpers, will not be found.
- A step definition can still be weakened in ways the checks cannot see, for example by changing an assertion so it can never fail. Code review of step files is the defence.
- Acceptance sentences prove that the system does what you specified. They do not prove you specified the right things, and they say nothing about security, performance, or architecture. Release controls, rollback, migration checks, architecture tests and mutation testing belong in your own pipeline, on paths the agent does not own.

The attack suite runs offline. A good next step would be a public repository holding the same attacks as real pull requests, with a link to each run, so anyone can check them.

## Releases

The current release is 0.10.1, published to npm as `@wosslabs/touchstone`.

Pushing a tag such as `v0.10.2` runs `.github/workflows/release.yml`. It runs the tests, checks that the tag and every plugin manifest match `package.json`, checks that the workflow templates use the major tag it is about to move, and then moves that major tag (`v0`) to the same commit. It does not publish to npm. Publishing is a separate step done by a person, because it needs two-factor authentication and cannot be undone:

```bash
npm publish --access public
```

To release: bump the version in `package.json`, the two plugin manifests, `marketplace.json` and the lockfile (a unit test fails if they differ), commit, tag, push the tag, then publish.

While the project is 0.x, workflow templates use `wosslabs/touchstone@v0`. At 1.0.0 the templates switch to `@v1` in the same commit. To be safe from tag changes, pin the action to a full commit SHA instead.

## Repository layout

| Path | Purpose |
| --- | --- |
| `skills/` | Instructions the agent follows |
| `hooks/` | The session notice and the write protection |
| `ci/check-acceptance-guard.js` | Approved sentences and skipped tests |
| `ci/check-trace.js` | Sentence, scenario and step definition trace |
| `ci/check-red-green.js` | Red before green |
| `ci/mutate-gherkin.js` | Gherkin value mutation |
| `ci/config.js`, `ci/gates.js`, `ci/action-config.js` | The gate config (`touchstone.json`), running gates, the phase fence, and reading the config in the Action |
| `ci/red-reason.js` | Reads Cucumber messages or JSON reports and decides whether a failure is missing behavior |
| `ci/gherkin.js` | Shared Gherkin parsing |
| `action.yml` | The GitHub Action |
| `cli/touchstone.js` | `init`, `check`, `guard` and `red`, published as `@wosslabs/touchstone` |
| `examples/` | The same todo list in seven stacks |
| `templates/` | Workflow, CODEOWNERS and Cursor hook files to copy |
| `evals/` | The harness that tests whether agents follow the skills |
| `docs/` | The diagram (`docs/images/outer-inner-loop.png`, with its SVG source and render script in `docs/diagrams/`) |
| `examples/refine-orders` | The seeded-defect fixture for the inner-loop experiment |
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
