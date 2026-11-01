---
name: touchstone
description: Use when starting a feature, bugfix, or behavior change before design or code; when asked for acceptance tests, examples, Given/When/Then, or ATDD; when a test might be weakened, skipped, or written to match code that already exists.
---

# Touchstone

A behavior change starts from a sentence a person can agree to without seeing the code. You show that sentence failing against the system as it is today. Then, and only then, you write code.

No production code, design, or implementation plan until those sentences are approved and the new check has failed for the missing behavior.

## When to use

Use this skill for one chosen feature, a bug, or a change in what the system does. If the request is a product or more than one feature, stop and follow `touchstone-features` first.

Do not use it for a rename, a typo, a comment, a docs-only edit, or a question. A refactor that must keep current behavior follows the refactor rule below and does not add sentences.

## Which kind of change

**New behavior.** Find the situations, draft the sentences, stop for edits, watch the approved sentence fail, then hand off to `touchstone-build`.

**Bug.** Write what happens today and what should happen. Show today's behavior failing. Do not start from a guessed fix. If you cannot make today's behavior happen again, stop and say what you tried. Do not invent a fix for a failure you have not seen.

**Refactor.** Do not add, delete, or rewrite anything in `stories/`. The current sentences stay true. If a sentence has to change, stop and ask.

## Four layers

Keep them separate. The sentence does not mention the layers under it.

1. **Sentence.** What a customer can observe. This file is theirs.
2. **Vocabulary.** The few words the driver understands (`declines the card`, `confirms payment`). You may add a word here. You may not smuggle a class name back into the sentence.
3. **Driver.** Code that performs those words against the running system.
4. **System.** The real application. A mock in its place is not this layer.

## New behavior

### 1. Find the situations, then draft

Ask one question at a time. Attach your guess, so they can correct it. Wait for the answer.

Play one situation back in their words, including what is out of scope. "Sounds good" and "whatever you think" are not approval. Ask what is wrong or missing.

If `drafts/stressors.md` exists, read the stressors the person chose for this row. Each one is a situation to draft as a failure-mode sentence. Do not add stressors they did not choose.

Do not offer a menu of features they did not ask for. Do not fill a gap in silence. If you are assuming the database, the client, or who the sentence is for, say the assumption and let them correct it.

When the situations are clear, write `drafts/<short-name>.md`. One situation per block. Enough situations to change a decision. Not the whole product.

```markdown
Scenario: Declined card
Given the bank declines the card
When the customer confirms payment
Then the customer sees "payment failed"
And the customer is not charged
```

A bad sentence names the implementation. A good sentence names what the customer sees.

```markdown
Bad:  Given PaymentService.charge returns HTTP 402
Good: Given the bank declines the card

Bad:  Then the row in charges has status DECLINED
Good: Then the customer is not charged
```

Do not name classes, functions, tables, columns, HTTP paths, status codes, frameworks, or source files.

When a person will look at a screen, name the screen, the control they use, and the words they see.

```markdown
Scenario: Declined card on the checkout screen
Given the bank declines the card
When the customer presses Pay
Then the words "payment failed" appear under the Pay button
And the amount on the screen does not change
```

Playwright opens the running screen and checks those words. A description of a picture is not a check. A fake button that never shows the screen is not a check.

If someone will have to diagnose this failure later, add a sentence for what they would look up. Name the event and the id. Do not name a logging library, and do not put secrets in the sentence.

```markdown
Scenario: A decline can be found
Given the bank declines the card
When the customer confirms payment
Then a payment_failed event is recorded with that payment's id
And the declined-payment count goes up by one
```

### 2. Stop

Show the draft. Ask them to edit the file until the sentences are what they mean. End the turn.

Approval is the edited sentences saved by them. Do not design, plan, or write code in this turn.

### 3. The approved file is theirs

They save the approved file under `stories/`. You do not create or edit that directory, and you do not edit `.github/workflows/`, `ci/check-acceptance-guard.js`, or `ci/check-trace.js`. Drafts stay in `drafts/`.

### 4. Make it executable

The acceptance check is Cucumber and Playwright. Cucumber is the sentence. Playwright is the driver that performs the sentence on the running screen.

- Copy the approved scenario titles and the Given, When, Then, and And lines into `features/<short-name>.feature`. Do not rewrite them.
- Put the step definitions in `features/`. Those steps are the vocabulary. They open the screen with Playwright, use the control the sentence names, and read the visible words the sentence names. Words left in an input are not words on a list.
- Add an `acceptance` script that runs `cucumber-js`. If `@cucumber/cucumber` and `playwright` are not already dependencies, install them and install Playwright's Chromium. Record the versions in the application's `package.json`.

A unit test, a hand-rolled HTTP client, or a mock is not this check. The unit test comes later, in `touchstone-build`, and it does not replace the scenario.

A driver that never reaches the system is not a check:

```text
Bad:  assert mockCharge.wasCalled
      The application never starts.

Good: Start the application.
      Confirm payment the way a customer does.
      Assert the customer sees "payment failed" and was not charged.
```

An empty catch that hides the error, a stub that returns the expected message, and a test that asserts on the mock instead of the outcome are the same failure. Fix the driver.

### 5. Show the failure

Run `npm run acceptance` for the new scenario only. Also run `npx @wosslabs/touchstone check`. Paste both commands and both outputs in the same message. "It failed" is not output.

The trace script prints one row per scenario: the approved example file, the Cucumber feature file, and the step count. That row is the link from the sentence to the check. If it says the words differ, fix the feature file. Do not change the example.

The failure you want names the missing behavior:

```text
FAIL Declined card
Expected the customer not to be charged
The customer was charged 20.00
```

A broken driver looks different. Follow `touchstone-repair`, fix the driver, and run it again. Do not treat this as the red bar:

```text
ERROR
NameError: name 'charge' is not defined
```

If the scenario already passes, stop. Say whether the behavior is already there or the driver never reached the system, and wait.

If you already wrote production code for this change, delete it before this run. Do not keep it as a reference. Do not adapt it while you write the driver. Delete means delete.

End the turn. Design starts only after they agree this failure is the missing behavior.

### 6. Hand off

When they agree the failure is the missing behavior, follow the `touchstone-build` skill. Do not start it in the same turn as the failure output.

### 7. Leave the check alone

You do not edit `stories/`, `.github/workflows/`, `ci/check-acceptance-guard.js`, or `ci/check-trace.js`. You do not disable, delete, or loosen a test to get a green result. If a sentence is wrong, ask them to change it.

These are the cheap ways to a green bar. Do not use them:

- Skip, ignore, or disable the new test
- Delete an assertion or catch the error and continue
- Replace the system with a stub that already returns the right words
- Weaken `ci/check-acceptance-guard.js`, `ci/check-trace.js`, or the workflow in the same change

A refusal from the hook is the correct outcome. Do not route around it with the shell.

A later plan is done when the named example passes. The plan does not rewrite the example and does not include a copy of the production code.

## Bug shape

Draft both sides, then follow the same steps. The failure you show is today's behavior.

```markdown
Scenario: Empty email
Given a customer submits the form with no email
Then they see "Email required"
And no account is created
```

```text
FAIL Empty email
Expected "Email required"
The form accepted the customer
```

## Excuses

| Excuse | What you do |
| --- | --- |
| The feature is small | One sentence is enough. Write it. |
| The ask is clear enough | If you cannot say what the customer sees, ask one question. |
| They said sounds good | That is not the edited file. Wait for the file under `stories/`. |
| I'll add the test after it works | Delete the new production code and return to step 5. |
| I'll keep the code as a reference | Delete it. A reference gets adapted. That is a test written after the code. |
| The test passed immediately | Stop. The check is empty, or the behavior already exists. |
| The error is a missing import, close enough | That is a broken driver. Fix it and run again. |
| I'll update the example to match the code | Stop. Ask them to change the example. |
| I'll turn this test off for now | Stop. A skipped test is not a failure you showed them. |
| I'll check the HTTP body instead of the screen | Stop. Playwright has to open the screen and read the words. |
| I'll reword the feature so the trace passes | Stop. The feature copies the approved example. Ask them to change the example. |
| The pipeline needs a tweak in this same change | Stop. A pipeline change is a separate edit for a person to approve. |
| I cannot reproduce the bug, but the fix is obvious | Stop. Report what you tried. |

## Red flags

Stop when you notice one of these:

- Three questions in one message
- A sentence that names a class, a table, a URL, or a status code
- Production code already in the tree for this change
- A passing scenario on the first run, treated as success
- A stack trace treated as the missing behavior
- A mock, a stub, or an empty catch standing in for the system
- An edit to `stories/` or the workflow from this session

## Checklist

Before you hand off to `touchstone-build`:

- [ ] The sentences use customer words, and the person saved them under `stories/`
- [ ] Cucumber has the approved words, and Playwright opens the real screen
- [ ] You pasted `npm run acceptance` and `npx @wosslabs/touchstone check`
- [ ] The output names the missing behavior, not a compile error
- [ ] They agreed that failure is the right one
- [ ] Any production code written early was deleted
