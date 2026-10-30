---
name: touchstone-build
description: Use when an approved behavior sentence has failed for the missing behavior and the person has agreed that failure is the right one; when writing the unit tests and code for that sentence; when opening the pull request.
---

# Build from a failing sentence

The approved sentence already failed for the missing behavior, and the person agreed that failure is the right one. If that has not happened, stop and follow the touchstone skill.

## Design

Write a short design, a few paragraphs: which parts of the system make the sentences true, and what you are leaving undecided. No file-by-file copy of the production code. The acceptance driver is already in place.

The sentences stay as approved. If the design cannot satisfy one of them, stop and ask. Do not edit the sentence yourself.

## Unit test, then code

For each slice of the design:

1. Write one unit test for the internal behavior.
2. Run it and confirm it fails because the behavior is missing.
3. Write the smallest production code that makes that test pass.
4. Run it and confirm it passes.

If production code for this change already exists, delete it and start from the failing unit test.

Unit tests may name functions and types. They do not replace the sentence in `acceptance/examples/`.

Keep each slice small enough that a person can explain it to someone who will support the system.

## The sentence passes

Re-run the approved scenario against the real system. Paste the command and the passing output. A passing unit test is not a substitute for that run.

## Pull request

Open a pull request. The acceptance guard on the pull request is the merge verdict. A green run on your machine is not that verdict.

Do not edit `acceptance/examples/`, `.github/workflows/`, or `ci/check_acceptance_guard.py`. Do not disable, delete, or loosen a test. If a sentence is wrong, ask the person to change it.

A hook refusal is the correct outcome. Do not route around it with the shell.

## Excuses

| Excuse | What you do |
| --- | --- |
| The unit tests already prove it | Re-run the approved sentence and paste that output. |
| I'll paste the code into the plan | The plan names the sentence that must pass. It does not carry the implementation. |
| I'll skip the unit-test failure | Delete the new production code and write the failing unit test first. |
| I'll merge from the local green run | Open the pull request and leave the verdict to the guard. |
| This slice needs a pipeline edit | Stop. That edit is a separate change for a person to approve. |
