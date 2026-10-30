---
name: touchstone-repair
description: Use when an acceptance run fails with a programming error, an undefined step, a missing browser, or a screen that did not start, before treating that output as the missing behavior.
---

# Repair a broken acceptance run

The approved sentence is already in `stories/`. Cucumber or the trace check ran, and the failure is not the missing behavior. A missing import, an undefined step, a connection error, a missing browser, or a stack trace means the driver never reached the system.

Do not write or change production code in this skill. Do not edit `stories/`, `.github/workflows/`, `ci/check-acceptance-guard.js`, or `ci/check-trace.js`.

## What you fix

Fix only the driver and the tool setup:

- Install `@cucumber/cucumber` and `playwright`, and install Playwright's Chromium, when the failure says they are missing.
- Start the application the way a person would, then point the step at that running screen or service.
- Add the step definition for a sentence that is already approved. The words in the definition match the sentence. They do not replace it.
- Keep the feature file the same as the approved example. If `node ci/check-trace.js` says the words differ, change the feature file back. Ask the person to change the example.

An HTTP service and a mobile screen use the same sentences. The step calls the running service, or Maestro, instead of opening a browser. The trace still names the definition file.

## Show the run again

Run `npm run acceptance` and `node ci/check-trace.js`. Paste both commands and both outputs.

Stop when the failure names the missing behavior, such as a missing title on the list or a customer who was charged. That is the hand-off back to the person. Do not start `touchstone-build` in the same turn.

If the scenario passes on this rerun, stop. Say whether the behavior is already there or the driver still does not reach the system.
