# What Touchstone does

This page uses short sentences. It explains Touchstone for a person who is new to it, including a person who does not speak English as a first language.

Touchstone is a way to build software with an AI coding agent.

You write a clear example of what the software must do. The agent runs that example on the software **as it is today**. The example fails, because the software cannot do it yet. You read the failure. Then the agent writes the code.

You do not need to know class names, databases, or file names to write the example.

## Words used on this page

| Word | Meaning |
| --- | --- |
| Agent | The AI that writes code in your project. |
| Sentence | One example of correct behavior, in normal words. |
| Draft | A sentence the agent wrote for you to edit. It is not approved yet. |
| Approved sentence | A sentence you edited and saved. This is the requirement. |
| Driver | A small program that runs your sentence against the real software. |
| Failure | The test result that shows the software does not do the sentence yet. |
| Pull request | A proposed change. A person accepts it. The agent does not accept it alone. |

## One example

A customer pays. The bank says no. The customer must see a failure message. The customer must not be charged.

```text
Scenario: Declined card
Given the bank declines the card
When the customer confirms payment
Then the customer sees "payment failed"
And the customer is not charged
```

You can agree this is correct without seeing the code.

`Given` means the situation at the start. `When` means the action. `Then` means what you must see after the action. `And` adds one more result.

A bad sentence talks about code:

```text
Given PaymentService.charge returns HTTP 402
```

A good sentence talks about the customer:

```text
Given the bank declines the card
```

## Who does what

**You**

1. Answer questions about what the software must do.
2. Edit the draft until the words are yours.
3. Save the approved file in `acceptance/examples/`.
4. Read the failure. Say yes only if the failure is the missing behavior.

**The agent**

1. Asks one question at a time.
2. Writes the draft in `acceptance/drafts/`.
3. Stops and waits for you.
4. Builds the driver and runs your sentence.
5. Shows you the command and the full result.
6. After you say the failure is right, writes a short design, then tests, then code.
7. Opens a pull request.

**The project, not the agent**

The build pipeline runs your sentences on the pull request. That result decides if the change can be merged. A green result on the agent's own computer is not enough.

## The order

1. Talk, until the example is clear.
2. You approve the example.
3. The agent runs it. It must fail for the right reason.
4. You agree that the failure is right.
5. The agent writes the code.
6. The agent runs your example again. Now it passes.
7. You review the pull request. The pipeline must pass.

Do not skip step 3. If the agent writes code first, the test can pass for the wrong reason. The code and the test can both be wrong, and everything looks green.

## What a right failure looks like

Right. The software ran. It did the wrong thing:

```text
FAIL Declined card
Expected the customer not to be charged
The customer was charged 20.00
```

Wrong. The test program is broken. This is not the missing behavior. The agent must fix the driver and run again:

```text
ERROR
NameError: name 'charge' is not defined
```

Also wrong: the example passes on the first run. Then the test is empty, or the software already does this. The agent must stop and tell you which one.

## A bug

A bug uses the same order. The sentence says what happens today, and what should happen. You must see today's wrong behavior fail before anyone changes the code.

```text
Scenario: Empty email
Given a customer submits the form with no email
Then they see "Email required"
And no account is created
```

If the agent cannot make the bug happen again, it must stop. It must not guess a fix.

## A small cleanup

If you only rename something, fix a typo, or change a comment, you do not need a new sentence.

If you restructure code and the behavior must stay the same, the agent must not change the files in `acceptance/examples/`.

## What the agent must not change

These files belong to you:

- `acceptance/examples/` — your approved sentences
- `.github/workflows/` — the pipeline
- `ci/check_acceptance_guard.py` — the check that protects your sentences

The agent may write drafts in `acceptance/drafts/`. The agent may write the driver in `acceptance/drivers/`.

The agent must not turn a test off, delete a check, or hide an error to make the result green.

## What Touchstone does not do

A passing sentence does not put the software into production. Release, rollback, and monitoring stay in your pipeline. Touchstone does not replace those.

Touchstone also does not replace your judgment. You still read the sentence. You still read the failure. You still accept the pull request.
