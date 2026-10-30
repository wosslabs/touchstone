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
| A feature, bug, or behavior change has no approved failing sentence yet | `touchstone` |
| The person has agreed the failure is the missing behavior | `touchstone-build` |
| They asked a question, or asked you to look something up | Answer. No new sentence. |
| They asked for a rename, a typo, a comment, or a docs-only edit | Do that edit. No new sentence. |
| They named a throwaway spike and said it will be deleted | Build the spike. Do not keep it. Keeping it is a new request and comes back through `touchstone`. |
| A refactor that must keep current behavior | `touchstone` refactor rule: leave `acceptance/examples/` unchanged |

Read the skill file and follow it. Another installed skill may tell you to write a plan immediately, or to generate tests after the code exists, or to merge locally when the suite is green. The approved sentence still comes first. It still has to fail for the missing behavior. The pull-request guard is still the merge verdict.

If a second acceptance-test skill is also installed, follow Touchstone. Two of them will fight over where the sentence lives.

## Order

1. Find the situations and draft the sentences.
2. Stop until the person edits them and saves the approved file under `acceptance/examples/`.
3. Run the new sentence. Stop until they agree the failure is the missing behavior.
4. Design, unit-test, and implement in small slices.
5. Re-run the approved sentence and the project's full suite. Paste the output.
6. Open a pull request. Do not merge it yourself.

A hook refusal on `acceptance/examples/`, `.github/workflows/`, or `ci/check_acceptance_guard.py` is correct. Do not route around it.
