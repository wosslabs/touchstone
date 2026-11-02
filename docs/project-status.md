# Project status

[Touchstone](../README.md) · [All documentation](README.md)

## Project status

Touchstone is an early beta. The current release is shown by the version badge on the [README](../README.md) and on [npm](https://www.npmjs.com/package/@wosslabs/touchstone). Here is what has been checked and what has not.

**Verified by running it:**

- All unit tests (`npm test`) and the CI jobs on GitHub for every example. All of them passed on the last run.
- Reading an existing code base. An agent session wrote 29 scenarios for `examples/legacy-orders`, and all pass against the unmodified service. Five evaluation runs of that task passed.
- The real Action on three real pull requests, with comments on (`.github/workflows/action-pr-e2e.yml`). Open a pull request from a branch named `e2e/<attack>` and the workflow builds that attack and runs the Action on it. [#1](https://github.com/wosslabs/touchstone/pull/1) is the honest change: the Action commented "all checks passed" with the trace. [#2](https://github.com/wosslabs/touchstone/pull/2) is a `Then` step that stops asserting: it commented "failed at mutate" with the survivors and listed the changed step file for review. [#3](https://github.com/wosslabs/touchstone/pull/3) is a reworded sentence: it commented "failed at guard" with the reworded line. The pull requests were closed without merging. The comment layout (verdict first, a passing trace collapsed) was changed afterwards and checked on two more, [#4](https://github.com/wosslabs/touchstone/pull/4) and [#5](https://github.com/wosslabs/touchstone/pull/5). Before this, the Action posted no comment at all on a failing pull request. That was a bug, found and fixed while writing the test.
- The real Action, run on GitHub on each attack (`.github/workflows/action-e2e.yml`). For every attack the workflow builds a scratch repository (a base commit, then the bad change) and runs the Action itself on it with `uses:`. It then checks that the Action turned red or green as expected, and for the key attacks that the right stage stopped it, using the Action's `failed_stage` output. The honest change passed with no failing stage. A `Then` step that stops asserting was stopped by the mutation stage, including when the same change turned mutation off, because the settings come from the base commit.
- An attack suite (`npm run attacks`, also a CI job). It applies thirteen deliberately bad changes to a TypeScript project, and a second suite (`npm run attacks:jvm`) applies five more to the Java example, such as a reworded story, an empty step, `test.only`, a build file that ignores test failures, a scenario that is already green, a stack trace in a `When` step, a `Then` step that stops asserting anything, the same with mutation switched off in the same pull request, and a quality gate's script rewritten to always pass in the change that adds what it catches. Each must turn the pipeline red. One honest change must stay green. The suite found a real hole when it was written: the guard exempted any `tests/` folder, including an application's own. That is fixed.
- The red check against real runner output for the Node web, TypeScript, Java, Python, Go and Rust examples. That includes a Java pull request whose new unit test refers to code that does not exist at the base commit.

**Built, and run on GitHub through the Action:** Gherkin value mutation, reading `touchstone.json` from the base commit, the quality gates, and putting protected files back to their base version. The last two were checked on an attack where a pull request rewrites a quality script (and on [#6](https://github.com/wosslabs/touchstone/pull/6)). The phase fence is checked in unit tests only. The Java attacks (`npm run attacks:jvm`) run the same restore and gates in CI, but through the scripts, not through the Action. The mutator was also run for real on the TypeScript example and on `examples/legacy-orders`.

**Built and measured once:** the inner loop (`touchstone-refine`). On one small fixture it clearly beats a plain request and ties a one-sentence instruction. It has not been run on a real code base, and the part where it might beat an instruction (writing tests when no mutation tool exists) is not established. See [Does it help?](inner-loop.md#does-it-help).

**Not verified yet:**

- The Action has run on three real pull requests ([#1](https://github.com/wosslabs/touchstone/pull/1), [#2](https://github.com/wosslabs/touchstone/pull/2), [#3](https://github.com/wosslabs/touchstone/pull/3)), but each was built from a scratch repository made by the attack suite, not from a real application. `red-batch`, the JVM workflow template and the held-back scenarios template have never run on GitHub. The release workflow has run for every release since 0.9.0.9.1, 0.10.0, 0.10.1, 0.11.0 and 0.11.1.
- The Mojo red command.
- The evals ran against one model, on small fixtures. See [Results](evals.md#results).
- Nobody outside this project has used it on a real repository.

**Known limits:**

- Step definitions are found by pattern matching. Steps built from constants or string concatenation, or registered through unusual helpers, will not be found.
- A step definition can still be weakened in ways the checks cannot see. Value mutation catches the common case, a `Then` that stops asserting: every value in its scenarios survives. It does not catch a step that checks the wrong thing but still depends on its value, or a quality script you forgot to list under `protect`. Review of step files is the remaining defence.
- Acceptance sentences prove that the system does what you specified. They do not prove you specified the right things, and they say nothing about security, performance, or architecture. Release controls, rollback, migration checks, architecture tests and mutation testing belong in your own pipeline, on paths the agent does not own.

The attack pull requests ([#1](https://github.com/wosslabs/touchstone/pull/1) to [#6](https://github.com/wosslabs/touchstone/pull/6)) are real, public and linked, but a script built them. The next step is to run the Action on a real application's own pull requests.


## Releases

Releases are published to npm as `@wosslabs/touchstone`. The current version is on the badge at the top of the [README](../README.md).

Pushing a tag such as `v0.12.0` runs `.github/workflows/release.yml`. It runs the tests, checks that the tag and every plugin manifest match `package.json`, checks that the workflow templates use the major tag it is about to move, and then moves that major tag (`v0`) to the same commit. It does not publish to npm. Publishing is a separate step done by a person, because it needs two-factor authentication and cannot be undone:

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
