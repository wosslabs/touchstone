---
name: touchstone
description: Use when starting a feature, bugfix, or behavior change before design or code; when asked for acceptance tests, examples, Given/When/Then, or ATDD; when a test might be weakened, skipped, or written to match code that already exists.
---

# Touchstone

A behavior change starts from a sentence a person can agree to without seeing the code. You show that sentence failing against the system as it is today. Then you write code.

No production code, design, or implementation plan until those sentences are approved and the new check has failed for the missing behavior.

## Which kind of change

**New behavior.** Draft the sentences, stop for edits, watch the approved sentence fail, then implement.

**Bug.** Write what happens today and what should happen. Show today's behavior failing. Then fix it.

**Refactor.** Do not add, delete, or rewrite anything in `acceptance/examples/`. The current sentences stay true. If a sentence has to change, stop and ask.

## New behavior

### 1. Draft

Write `acceptance/drafts/<short-name>.md`.

One situation per block. Use words a customer would use. Given / When / Then when that form is clearer.

```markdown
Scenario: Declined card
Given the bank declines the card
When the customer confirms payment
Then the customer sees "payment failed"
And the customer is not charged
```

Do not name classes, functions, tables, columns, HTTP paths, status codes, frameworks, or source files.

### 2. Stop

Show the draft. Ask them to edit the file until the sentences are what they mean. End the turn.

Approval is the edited sentences. Do not design, plan, or write code in this turn.

### 3. The approved file is theirs

They save the approved file under `acceptance/examples/`. You do not create or edit that directory, and you do not edit `.github/workflows/`. Drafts stay in `acceptance/drafts/`.

### 4. Make it executable

Add a driver under `acceptance/drivers/` that carries out the sentence against the running system. A mock in place of that system is not the check. The scenario words stay the approved sentences.

### 5. Show the failure

Run the new scenario only. Paste the command and the output.

The failure you paste is the missing behavior: the customer was charged, or the failure message never appeared. A compile error, a missing import, or a refused connection is a broken driver. Fix the driver and run it again.

If the scenario already passes, stop. Say whether the behavior is already there or the driver never reached the system, and wait.

If you already wrote production code for this change, delete it before this run.

### 6. Design, then code

After the failure is the right one, write a short design: which parts of the system make the sentences true. Then implement the smallest change. Unit tests may describe internal structure. They do not replace the approved sentences.

Re-run the scenario and paste the passing output.

### 7. Leave the check alone

You do not edit `acceptance/examples/`, `.github/workflows/`, or `ci/check_acceptance_guard.py`. You do not disable, delete, or loosen a test to get a green result. If a sentence is wrong, ask them to change it.

A refusal from the hook is the correct outcome. Do not route around it with the shell.

A later plan is done when the named example passes. The plan does not rewrite the example and does not include a full copy of the production code.

## Excuses

| Excuse | What you do |
| --- | --- |
| The feature is small | One sentence is enough. Write it. |
| I'll add the test after it works | Delete the new production code and return to step 5. |
| The test passed immediately | Stop. The check is empty, or the behavior already exists. |
| I'll update the example to match the code | Stop. Ask them to change the example. |
| I'll turn this test off for now | Stop. A skipped test is not a failure you showed them. |
| The pipeline needs a tweak in this same change | Stop. A pipeline change is a separate edit for a person to approve. |
