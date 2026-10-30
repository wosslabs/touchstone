# How to use Touchstone

You talk to the agent in your project. You do not type a special command for each step. The agent is supposed to follow the steps below. If it skips one, stop it with the sentence in **If the agent skips a step**.

Touchstone builds software one small feature at a time. You decide the feature. You decide the words. You look at the failure. The agent writes the code. The pipeline decides if the change can be merged.

You do not need Superpowers. Superpowers asks questions, then writes one design, then a plan that already contains code. Touchstone writes a feature list first. Only the feature you pick gets examples. Only that feature goes into the pull request.

## 1. You say what you want

Example:

```text
Build a checkout that can take a card payment.
```

The agent must not start coding.

If the repository already has code, the agent reads the part that does a similar job and names the files. It must not throw those files away and write new ones.

## 2. The agent lists features and waits

A feature is one thing a person can finish and check. It must fit in one pull request.

```text
Out of scope: refunds, receipts, saved cards.

1. Declined card. The customer sees "payment failed" and is not charged.
2. Successful card. The customer sees "paid" and the charge is recorded.
```

You answer with one line:

```text
Start with 1.
```

The agent must not write examples for feature 2 yet.

## 3. The agent writes examples for that feature only

It asks one question at a time. Then it writes a draft in `acceptance/drafts/`.

```text
Scenario: Declined card on the checkout screen
Given the bank declines the card
When the customer presses Pay
Then the words "payment failed" appear under the Pay button
And the amount on the screen does not change
```

`Given` is the start. `When` is what the person does. `Then` is what they see.

A screen example names the screen, the button, and the words. The agent later checks those words on the running screen. A fake button is not a check.

You edit the draft until the words are yours. Then you save that file under `acceptance/examples/`. The agent is not allowed to save it there.

## 4. The agent runs the example and waits

The software cannot do this yet, so the run must fail. You want this kind of failure:

```text
FAIL Declined card
Expected the customer not to be charged
The customer was charged 20.00
```

You do not want a programming error (`NameError`, missing file). That means the test is broken. Tell the agent:

```text
That failure is a programming error. Fix the test and run it again.
```

If the example passes on the first run, the test is empty or the software already does this. The agent must stop.

When the failure is the right one, you say:

```text
Yes. That failure is the missing behavior.
```

## 5. The agent writes a small change

It reads the existing code again. It changes the smallest part that makes this one example pass.

The order inside that work is:

1. A small unit test that fails.
2. The smallest code that makes the unit test pass.
3. Your approved example, run again, now passing.
4. The project's full test suite.

The same command must give the same result every time. A test that sometimes fails is not finished.

Then it opens one pull request for this feature only.

## 6. You accept or reject the pull request

Read the pull request. You should be able to explain every changed file in one sentence. If you cannot, the change is too big. Say:

```text
This pull request is too big. Split it.
```

The pipeline runs your examples. A green result on the agent's computer is not enough. Merge when the pipeline is green and you understand the change.

Then start the next feature. Say:

```text
Now feature 2.
```

## If the agent skips a step

| What you see | What you say |
| --- | --- |
| It starts coding from "build a shop" | Stop. List the features first. |
| It writes code for every feature | Stop. Only the feature I picked. |
| It saves the example into `acceptance/examples/` itself | Stop. I save that file. |
| It rewrites a whole file | Do not rewrite that file. Change the part this feature needs. |
| It says the tests should pass, with no output | Paste the command and the output. |
| The pull request also changes the pipeline | Take the pipeline change out. That is a separate review. |

## A bug, or a tiny edit

A bug is one feature. The example says what happens today and what should happen. You must see today's wrong behavior fail before any fix.

A rename, a typo, or a comment does not need a new example.

If you only restructure code, and the behavior stays the same, the agent must not change `acceptance/examples/`.

## Words

| Word | Meaning |
| --- | --- |
| Agent | The AI that writes code in your project. |
| Feature | One thing a person can finish in one pull request. |
| Example | A few lines that say what the person does and what they see. |
| Draft | An example the agent wrote. You edit it. |
| Unit test | A small test of one inside rule. It is not a replacement for your example. |
| Pull request | The proposed change. You accept it. The agent does not. |
| Pipeline | The checks that run on the pull request, outside the agent. |

## What Touchstone will not do

It will not put the software into production for you. Release and rollback stay in your pipeline.

It will not let the agent invent the requirement, grade its own examples, or replace a large area of the code because generating a new file looks faster.
