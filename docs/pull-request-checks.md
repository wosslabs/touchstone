# What the pull request checks

[Touchstone](../README.md) · [All documentation](README.md)

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

## Red before green

For every new or changed scenario, the check copies the pull request's `features/`, `stories/` and `src/acceptanceTest/` onto the base commit and runs only that scenario. It must fail there, because the behavior is missing. Then it runs the same scenario with the pull request's code, where it must pass.

Failures count as "red" only when they look like missing behavior: a failed assertion, a locator that times out, a 404 or 405 response. These do not count: an undefined or pending step, a failing `Given` or hook, `TypeError`, `ReferenceError`, `NoSuchMethodError`, `ECONNREFUSED`, and similar programming or environment errors.

To tell these apart, the check reads the runner's results. Your `red-command` must run the scenario named by `$TOUCHSTONE_SCENARIO` (an anchored regular expression) and write results to `$TOUCHSTONE_MESSAGES`, either as Cucumber messages or as a Cucumber JSON report. With cucumber-js:

```bash
npx cucumber-js --strict --name "$TOUCHSTONE_SCENARIO" --format message:"$TOUCHSTONE_MESSAGES"
```

The [examples](examples.md#examples-by-language) show the same thing for Java, Python, Go and Rust. A step's type (Given, When or Then) comes from the report, so a failing `And` after a `Given` is treated as a setup error.

Only if your runner can write neither format, set `red-reason-unchecked: "true"`. The check then only proves that a new scenario fails before the code exists. It cannot tell an assertion failure from a programming error, and it skips the "passes with the pull request code" run.

Each scenario normally gets its own run at the base commit and another with the pull request's code. If starting your application is slow (Spring, for example), set `red-batch: "true"` to run all changed scenarios together in one pass per phase. Your `red-command` must then accept a regular expression with alternation in `$TOUCHSTONE_SCENARIO`.

## Action inputs

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
| `holdout-command` | Runs held-back scenarios (see [below](examples.md#held-back-scenarios)). |
| `comment` | Set to `"false"` to skip the pull request comment. |

The Action has one output, `failed_stage`: the first stage that failed (`guard`, `red`, `acceptance`, `quality`, `mutate`, `holdout` or `trace`), or empty when everything passed.

Any command left empty is taken from `touchstone.json` at the pull request's base commit, if the file exists. An input set in the workflow wins over the file. Write the commands in the workflow file or in `touchstone.json` rather than as npm scripts. The workflow file is protected by CODEOWNERS and the hook, but `package.json` is something a pull request can change.

## Install-time safety

A pull request controls its own `package.json` and build files. The templates therefore install with `npm ci --ignore-scripts`, call test runners directly, and set `persist-credentials: false` on checkout. The CODEOWNERS template covers `package.json`, lockfiles, `cucumber.js`, `pom.xml`, `build.gradle*`, the Maven and Gradle wrappers, and your step definitions. Step definitions run in the same process as the test runner, so a dishonest step could fake a pass. Reviewing changes to them is the only real defence. The action lists changed step and build files in its comment, under "Driver changes: review these".

## Retiring a sentence

A person who is retiring a sentence adds a line to the same approved file:

```text
Touchstone-Allow-Drop: the charge sentence moved to another story
```

The agent never writes that line. Branch protection keeps the exception with a person.

## Traceability

Each change should answer four questions without anyone reading the chat.

| Question | Where the answer lives |
| --- | --- |
| What did a person agree? | `stories/`, which the agent cannot edit |
| Which test runs those words? | `features/*.feature`, checked by the trace |
| Which step performed the sentence? | The definition file named in the trace |
| What did the pipeline report? | The pull request comment from `wosslabs/touchstone` |
