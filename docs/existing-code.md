# Existing code bases

[Touchstone](../README.md) · [All documentation](README.md)

Most organizations do not start from nothing. They have a system that works, nobody wrote down what it does, and the people who knew have gone. Touchstone can read an existing code base and write down what it does, as simple business sentences, in the same Given, When, Then form used everywhere else. Each sentence is proved by running it against the system as it is today.

This helps in three ways:

- **Understanding.** A manager or analyst can read `REQUIREMENTS.md` without reading code.
- **Organizing work.** Each area has a list of what it does, which parts are unclear, which look like bugs, and which are dead.
- **Migrating.** The sentences drive the system from outside (over HTTP, a command line, a screen, or the database), not through its code. The same sentences can run against a rewritten system, in another language or stack. Only the step definitions change. A migration is finished when the old sentences pass on the new system.

What this produces describes what the system does now. It is not what the business wants. A person decides that, and nothing here reaches `stories/` until a person puts it there.

## Reverse engineering a code base into ATDD requirements

This is the full procedure. You can follow it by hand with the commands, or ask an agent to follow it. The agent works from the `touchstone-discover` skill, which is installed with the other Touchstone skills.

### Before you start

- **Work on a copy.** Clone the repository to a machine or folder with no production credentials. The agent reads the code, starts the system, and runs tests against it. It is told not to change production code, and a hook blocks edits to `stories/`, but treat the copy as disposable.
- **The system must be able to run** locally or in a test environment, so that scenarios can drive it from outside: a web service you can call, a command line program, a screen you can open, or a database you can seed and read. If it cannot be started at all, say so first. The agent can then write the sentences and mark every one as unproven.
- **Install the tools.** The Touchstone skills (see [Installing the skills and hook](installing.md#installing-the-skills-and-hook)), Node.js 22 or later for the Touchstone commands (tested on 22 and 24), and a Cucumber runner for the language you prefer for the steps: cucumber-js, Cucumber-JVM, behave, godog or cucumber-rs. The steps may be in a different language from the system. A Python or JavaScript step can drive a COBOL, Java or .NET service over HTTP.

### Step 1. Take stock

```bash
npx @wosslabs/touchstone discover
```

This reads the code and writes `drafts/discovery/inventory.md` and `inventory.json`. No model is involved, so the result is the same every time. It lists the languages and sizes, the build files, the largest modules, and every entry point it recognizes: web routes, scheduled jobs, message consumers, commands, screens, database tables and procedures, COBOL programs and JCL jobs. Each entry has the file and line where it is defined.

Read it. If it says "No entry points found", the system uses a framework it does not know. Start from the build files and the largest modules instead, or add a pattern to `ci/discover.js`.

### Step 2. Ask for one area at a time

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

### Step 3. What the agent produces

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

### Step 4. The scenarios must pass

The agent runs the draft scenarios against the system as it is today:

```bash
npx cucumber-js --config cucumber.legacy.js
```

This is red before green turned around. Here a passing run is the proof. A scenario that fails is wrong about the system, so the sentence is fixed, never the code. If the agent cannot make a sentence true without guessing, it changes the tag to `@unclear` and says what it could not work out. Run the command yourself to see it.

### Step 5. Check the proof

```bash
npx @wosslabs/touchstone evidence --write
```

This fails when:

- a scenario has no `@evidence` and no honest label (`@unclear`, `@suspected-bug`, `@dead`);
- a pointer names a file that does not exist, a line past the end of a file, or a path outside the code base (including through a symbolic link);
- a scenario title is used twice, or a file is not valid Gherkin.

It also lists the entry points that no scenario covers. `--write` saves the report as `drafts/legacy/COVERAGE.md`. Add `--require-coverage` to make an uncovered entry point a failure. For each uncovered entry point in your area, the answer is either "write a scenario" or "left out on purpose, and here is why".

### Step 5b. Check that the sentences depend on their values (optional)

A sentence can pass and still not mean much. If it says "orders over 100.00 get 10% off" but nothing checks the discount, it would pass for any discount. Mutation catches this by changing each value in the sentences and expecting them to fail:

```bash
npx @wosslabs/touchstone mutate --all --features drafts/legacy \
  --command 'npx cucumber-js --config cucumber.legacy.js --name "$TOUCHSTONE_SCENARIO" --format message:"$TOUCHSTONE_MESSAGES"'
```

Read the survivors as questions about the sentences. See [Gherkin value mutation](value-mutation.md#gherkin-value-mutation) for what each result means and how a person accepts a harmless survivor.

### Step 6. Write the document

```bash
npx @wosslabs/touchstone requirements
```

This turns the checked scenarios into `drafts/legacy/REQUIREMENTS.md`: one section per feature, each scenario in plain steps, a status line (observed, unclear, looks like a bug, dead), and where in the code it comes from. A summary table counts them by kind. Nothing in it is invented at this stage, so it is safe to hand to someone who does not read code.

### Step 7. A person reviews

The agent stops here. It lists its open questions and does not answer them. Read `REQUIREMENTS.md` and check:

- **Is each statement true to how the business runs?** Correct the wording.
- **Each `@unclear`.** The code does this, and the reason is not in the code. Ask someone who knows, then write the answer into the scenario as a comment.
- **Each `@suspected-bug`.** The code does this, but it may not be wanted. Decide: keep it (it is now a rule), or fix it later as a separate change through the normal workflow, with a new sentence that fails first.
- **A few evidence pointers.** Open the file at the line and see whether it is the code that makes the decision.
- **The `@dead` ones.** Nothing reaches this code. Candidates for removal, or for a question about why it exists.
- **The coverage list.** Is anything important left out?

Then go back to step 2 with the next area. The coverage report tells you how far you are.

### Step 8. Approve what you want to keep

Approval is yours. When you accept a scenario, copy it into `stories/` and its steps into `features/`. From then on the normal Touchstone workflow protects it: the agent cannot edit it, and the pull request check fails if it is removed, reworded or switched off. You can leave the `@evidence` tags on or remove them.

Keep the draft files you have not approved. They are still useful as documentation, but they are not protected.

### Using the result to migrate

Because the steps drive the system from outside, the same sentences can be pointed at a replacement:

1. Change the part of the steps that starts or reaches the system. For example, make it read a `BASE_URL` from the environment instead of starting the old service.
2. Run the same scenarios against the new system.
3. Every failure is a difference in behavior, and every one needs a decision. Is it a bug in the new system, or old behavior that nobody wants?
4. The `@suspected-bug` scenarios need a decision before the new system can pass them. Either keep the old behavior, or change the sentence on purpose, with a person's approval.

The migration is finished when the approved sentences pass on the new system. For a gradual move, run the scenarios against both systems side by side while traffic moves across.

What this does not cover: performance, security, data migration, scheduled work that cannot be triggered from outside, integrations with systems that cannot be run in a test, and rules held only in the data. List those separately.

### Keeping the documents honest

Evidence pointers are line numbers, so they are correct for the commit they were written at. When the code changes, they can drift. Treat the draft requirements as a snapshot, and run the draft scenarios in your pipeline so that a change in behavior shows up as a failure. `examples/legacy-orders` has a CI job that does this: it runs the scenarios and then `touchstone evidence`.

### Troubleshooting

| What you see | What to do |
| --- | --- |
| `discover` finds no entry points | The framework is not recognized. Start from the build files and the largest modules, or add a pattern to `ci/discover.js`. |
| A draft scenario fails against the system | The sentence is wrong. Fix the sentence or the step, not the code. If you cannot tell, tag it `@unclear`. |
| `evidence` says "so it is a guess" | Add an `@evidence` tag that points at the code, or an honest label. |
| `evidence` says a line does not exist | The pointer is wrong or the file changed. Point at the lines that make the decision. |
| Coverage is low and the agent says it is done | Ask it to list the uncovered entry points and say for each whether it is left out on purpose. |
| The agent changed production code | Revert it. The skill forbids it. Run the agent in a copy so this cannot cost you anything. |
| The system cannot be started in a test | Say so first. The sentences can still be written, but every one is `@unclear` until it can be run. |

### Doing the parts by hand

`discover`, `evidence` and `requirements` are ordinary commands. Anyone can run them. The part that needs reading and judgment is turning code into sentences and writing the steps. A person can do that, an agent can do that, or an agent can draft and a person can review. The checks work the same way either way.

## Tags

| Tag | Meaning |
| --- | --- |
| `@evidence:src/orders.js:68-76` | The lines of code that make this true. Required unless one of the tags below is used. A tag on the `Feature:` line applies to every scenario in it. |
| `@suspected-bug` | The code does this, but it looks wrong (a quantity of zero counted as one, a threshold that is off by one). Described as it is, never repaired in the sentence. |
| `@unclear` | The code does this, but its reason is not in the code. A person must say what the business wants. |
| `@dead` | Nothing reaches this code. |

## What the checks prove

`touchstone evidence` fails when a scenario has neither evidence nor an honest label, when a pointer names a file outside the code base (including through a symbolic link) or a line that does not exist, when a title repeats, or when a file is not valid Gherkin. It also prints how many entry points are covered. `--require-coverage` turns uncovered entry points into a failure.

Running the scenarios against the system proves they are true of its behavior. The evidence tags show where to look. Neither proves the system does what the business intended, and a reader should treat `@suspected-bug` and `@unclear` as questions, not answers.

## A real run

`examples/legacy-orders` is a small, deliberately old-fashioned order service: 140 lines, seven routes, one nightly job, a homegrown router, and a few quirks. In one agent session (10 turns, about 30 cents) the skill:

- found all seven routes and the job without any model involved;
- wrote 29 scenarios for creating, paying, shipping and refunding orders, with both sides of each boundary (a total of exactly 100.00 gets no discount, 20 of an item is allowed and 21 is not, free shipping starts at 50.00 before the discount comes off, and a customer called `bob-gold` is not a gold customer);
- tagged two behaviors `@suspected-bug`: a quantity of zero is counted as one, and an item with no price is accepted and gives a total that is not a number;
- left out the dead export route and the nightly job, and said so;
- changed no production code. All 40 scenario runs pass against the untouched service.

Mutation was run on those 29 scenarios afterwards (a cap of 12 mutants per scenario, about a minute): 125 mutants, 74 killed, 41 survived, 10 invalid. Every value in the expected outcomes (discounts, totals, refund amounts) was checked: changing one made the scenario fail. The survivors were values that do not matter or that fall on the same side of a rule: the customer name `alice` (fifteen places, one group in the report), `40.00` becoming `40.01` when the result rounds to the same cent, `21` becoming `22` when both are refused. The prefix rule for `gold-` customers was tested properly: changing the first letter made the scenario fail. The ten invalid mutants were Examples cells that hold wording (such as `pay` or `the order is created`) rather than values. Changing them left a step with no definition.

The evidence pointers were correct on a spot check. The coverage report shows 4 of 8 entry points covered. The four it lists as uncovered are the two read-only routes, the dead route and the nightly job, which matches what the agent said it left out.

It is one small system, one model and one run. Treat it as a demonstration that the method works, not as a measure of how it copes with a large or unusual code base. The files are in `examples/legacy-orders/drafts/legacy/`, including `REQUIREMENTS.md`.

## Limits

- Entry points are found by pattern matching on well-known frameworks (Spring, JAX-RS, Servlet, Express and similar, NestJS, Flask, FastAPI, Django, Go `net/http`, gin and echo, ASP.NET, Rails, Laravel, Rust web frameworks, Spring Kafka, RabbitMQ, JMS, SQS, Celery, cron, argparse, click, commander, cobra, React and Vue routes, SQL, JPA, Django models, COBOL, JCL). A system built on something else gets an inventory that says so, and the agent starts from the build files and the largest modules. Add patterns to `ci/discover.js` for your framework.
- It is done one area at a time. A large system takes many rounds, and the coverage report shows how far you are.
- Business rules hidden in the database, in configuration, or in another system are only found if the agent reads them. The inventory lists tables and procedures but does not read their logic.
- Code, comments and documents in the code base are treated as untrusted text, and the skill tells the agent not to copy secrets or personal data into sentences or fixtures. That is guidance. Run it on a copy of the repository without production credentials.
