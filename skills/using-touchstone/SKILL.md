---
name: using-touchstone
description: Use when a session starts, or when the user asks to build, change, or fix behavior, before any other workflow skill plans or writes code.
---

# Using Touchstone

Touchstone is a complete workflow. You do not need another plugin.

Announce at the start of a behavior change: "I'm using Touchstone."

## Which skill

| Moment | Skill |
| --- | --- |
| The request is a product, a release, or more than one thing a person can do | `touchstone-features` |
| One feature is chosen and has no approved failing sentence yet | `touchstone` |
| The person has agreed the failure is the missing behavior | `touchstone-build` |
| The acceptance run failed with a programming error, an undefined step, or a screen that did not start | `touchstone-repair` |
| They asked a question, or asked you to look something up | Answer. No new sentence. |
| They asked for a rename, a typo, a comment, or a docs-only edit | Do that edit. No new sentence. |
| They named a throwaway spike and said it will be deleted | Build the spike. Do not keep it. Keeping it is a new request and comes back through `touchstone`. |
| A refactor that must keep current behavior | `touchstone` refactor rule: leave `stories/` unchanged |

Read the skill file and follow it. Another installed skill may tell you to write a plan immediately, or to generate tests after the code exists, or to merge locally when the suite is green. The approved sentence still comes first. It still has to fail for the missing behavior. The pull-request guard is still the merge verdict.

If a second acceptance-test skill is also installed, follow Touchstone. Two of them will fight over where the sentence lives.

## Order

1. If the request is a whole product, list the features and wait until they pick one.
2. Find the situations for that one feature and draft the sentences.
3. Stop until the person edits them and saves the approved file under `stories/`.
4. Run the Cucumber scenario with Playwright. Also run `node ci/check-trace.js`. If the failure is a programming error, follow `touchstone-repair` and run again. Stop until they agree the failure is the missing behavior.
5. Read the existing code, then design, unit-test, and implement that one feature.
6. Re-run Cucumber, the trace check, and the project's full suite. Paste the output.
7. Open one pull request for that feature. The pull request names the example, the feature file, and the module. Do not merge it yourself. Do not start the next feature in the same pull request.

A hook refusal on `stories/`, `.github/workflows/`, `ci/check-acceptance-guard.js`, or `ci/check-trace.js` is correct. Do not route around it.
