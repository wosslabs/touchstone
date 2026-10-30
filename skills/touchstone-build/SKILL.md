---
name: touchstone-build
description: Use when an approved behavior sentence has failed for the missing behavior and the person has agreed that failure is the right one; when writing the unit tests and code for that sentence; when opening the pull request.
---

# Build from a failing sentence

The approved sentence already failed for the missing behavior, and the person agreed that failure is the right one. If that has not happened, stop and follow the `touchstone` skill.

No production code without a failing unit test first. If the code is already written, delete it and start from the test. Do not keep it as a reference.

## Find the project's commands

Before the first unit test, find how this repository builds and tests. Read the build file, the README, or CI. Prefer the repo's wrapper (`./mvnw`, `./gradlew`, `make test`) over a tool you assume is installed.

Use the focused command inside the loop. Use the full suite before you claim the slice is done. A green run of the one test you wrote is not a green suite.

## Read the code you will change

Before the design, read the existing code this feature will touch. Name the module you will extend. If you cannot name it, you have not looked.

Change that module. Do not throw the file away and write a new one. Regenerating a file spends a large change to avoid reading the one that is already there.

This pull request is the one feature they chose. It does not include the next row from `acceptance/drafts/features.md`. If you cannot explain every changed file in one sentence, stop and split the feature.

## Design

Write a short design in `acceptance/drafts/<short-name>-design.md`. A few paragraphs:

- Which parts of the system make each approved sentence true
- What is out of scope
- The order of vertical slices: one sentence, end to end, before the next sentence

Do not build every table, then every endpoint, then the customer path. The first slice is one approved sentence working through the real system.

Do not paste function bodies. A design longer than the sentences it serves has started to be the program.

The sentences stay as approved. If the design cannot satisfy one of them, stop and ask. Do not edit the sentence yourself.

Show the design. For a one-sentence change, the design can be one paragraph in the same message as the first failing unit test. For more than one sentence, save the design and follow it.

## One slice at a time

Each slice does one thing, leaves the suite green, and is committed on its own. Do not mix a refactor into a behavior slice. If you notice unrelated mess, write it down and leave it.

Inside a slice:

1. Write one unit test for the internal behavior. One behavior. A name that says what the customer-visible rule is, even though the test may name functions.
2. Run it. Confirm it fails because the behavior is missing, not because of a typo or a missing import. Paste the command and the failing output.
3. Write the smallest production code that makes that test pass. No options, flags, or frameworks the sentence does not require.
4. Run it and confirm it passes. Paste the output.
5. If you clean up names or duplication, run the test again. Cleanup does not add behavior.
6. Run the project's full suite. Any failure, including one you did not cause, goes in the report by name.

A unit test that only counts mock calls does not pin the behavior. Assert the outcome.

A test must give the same result every time you run it. Do not read the real clock, do not use an unseeded random value, and do not call a network service outside the application under test. A test that sometimes fails is not finished. Fix the test until the same command produces the same result.

```text
Bad:  expect(chargeMock).toHaveBeenCalled()
Good: the charge total for that customer is unchanged
```

If the test is hard to write, the design is too coupled. Simplify the boundary. Do not mock the whole system to make the test easy.

After a slice is green, commit it. Do not accumulate a large uncommitted pile.

If a test or the build goes red in the middle of a slice, stop adding behavior. Read the output. Reproduce the failure. Fix the cause. A skipped test is not a fix.

## Bugs

The approved sentence is the reproducer. Do not start from a patch. If the failure is in one layer and the wrong data is produced in another, fix the layer that produces the wrong data.

If you cannot reproduce it, stop. Say what you tried. Do not ship a guess.

## The sentence passes

Re-run every approved scenario for this change against the real system, then the full suite. Paste both commands and both outputs in the same message.

Do not say "should pass", "looks correct", or "done" without that output. A run from earlier in the session does not count. The code has changed since then.

## Before the pull request

Read the diff. These findings block the pull request:

- A new skip, ignore, or disable
- An assertion removed, or a catch that ignores an error
- A stub left where the sentence required real behavior
- Any change under `acceptance/examples/`, `.github/workflows/`, or `ci/check_acceptance_guard.py`

You can explain the slice to a person who will support it: what it does, and what it does not do. If you cannot, the slice is too big. Split it before you open the pull request.

If the harness can start a fresh reviewer, give that reviewer the approved sentences and the diff. Do not give it this session's history. Fix a break in behavior before you open the pull request. A naming nit can wait.

## Pull request

Open a pull request. The acceptance guard on that pull request is the merge verdict. A green run on your machine is not that verdict. Do not merge the branch locally and call the work integrated.

The pull request says which sentences it makes true, and pastes the command output from the full suite. It does not include a second copy of the implementation in the description.

## Excuses

| Excuse | What you do |
| --- | --- |
| The unit tests already prove it | Re-run the approved sentence and paste that output. |
| I'll paste the code into the design | The design names parts and sentences. The implementer writes the body. |
| I'll skip the unit-test failure | Delete the new production code and write the failing unit test first. |
| I'll keep the first version as a reference | Delete it. |
| The suite is slow, my file is enough | Run the full suite before the pull request. Name every failure. |
| I'll merge from the local green run | Open the pull request. Leave the verdict to the guard. |
| This slice needs a pipeline edit | Stop. That edit is a separate change for a person to approve. |
| I'll clean up the neighboring file while I'm here | Note it. Do not put it in this slice. |
| The bug is obvious without a failing run | The sentence has to fail first. If it will not fail, you do not understand the bug yet. |

## Red flags

- Production code before its unit test
- A unit test that passes on the first run
- More than one behavior in a single slice
- A design made of function bodies
- "Should pass" with no command output in the same message
- A local merge treated as the finish
- A skipped test, an empty catch, or a deleted assertion in the diff

## Checklist

- [ ] Each new unit test failed for the missing behavior before the code that passes it
- [ ] Each slice is one sentence's worth of behavior, committed on a green suite
- [ ] The approved scenarios pass against the real system, and you pasted that output
- [ ] The full suite output is in the pull request
- [ ] The diff does not touch protected paths, skips, or loosened assertions
- [ ] You can explain the slice without reading the code line by line
