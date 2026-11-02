# How a change works

[Touchstone](../README.md) · [All documentation](README.md)

You talk to the agent in your application repository. There are no special commands. The skills are installed once, and the agent follows the steps below. If it skips one, stop it with a sentence from [When the agent goes off track](#when-the-agent-goes-off-track).

## Your role

You choose the feature. You edit the sentences until they say what you mean, and you save the approved file yourself. You look at the first failure and decide whether it is the missing behavior. The agent reads your existing code, writes the smallest change that makes the feature pass, and opens one pull request. You merge it. The agent does not.

A feature is one thing a person can finish and check, and it fits in one pull request. A request like "build a checkout" is a list of features. Only the feature you pick gets sentences, and only that feature goes into the pull request.

## 1. Request

Describe the product or the change in ordinary words.

```text
Build a checkout that can take a card payment.
```

The agent must not start coding from that. If the repository has code, it reads the part that does a similar job and names those files. It extends that code. It does not throw away a working module and generate a new one because a new file is easier to write.

## 2. Feature list and stressors

The agent saves a feature list in `drafts/stories.md`. Each row is one pull request. The list also says what is out of scope, so later work is not quietly pulled into the first change.

```text
Out of scope: refunds, receipts, saved cards.

1. Declined card. The customer sees "payment failed" and is not charged.
2. Successful card. The customer sees "paid" and the charge is recorded.
```

A list built from requirements only covers situations someone already thought of. So the agent also writes `drafts/stressors.md`: 15 to 25 unlikely but possible events, such as the bank timing out, the person pressing Add twice, or the card network being down. You decide which ones matter. A chosen stressor becomes a failure sentence in step 3. A stressor about structure, such as a module that must survive a supplier change, belongs in an architecture test instead, and the agent says so.

You then choose one row:

```text
Start with 1.
```

The agent does not write sentences for the other rows yet.

## 3. Acceptance sentences

The agent asks one question at a time and includes its current guess so you can correct it. "Sounds good" is not approval. When the situations are clear, it writes a draft in `drafts/`.

```gherkin
Scenario: Declined card on the checkout screen
  Given the bank declines the card
  When the customer presses Pay
  Then the words "payment failed" appear under the Pay button
  And the amount on the screen does not change
```

`Given` is the starting situation. `When` is what the person does. `Then` and `And` are what they can see afterward. A sentence about a screen names the screen, the control, and the words a person can read. A sentence that names a class, a table, a URL or a status code describes the implementation and is not ready to approve.

Edit the draft until the words are yours, then save the file under `stories/`. The agent may not create or edit that directory. Saving the file is the approval.

## 4. A failing scenario

The agent copies your sentences into a Cucumber feature file without rewording them, writes the step definitions, and runs:

```bash
npx @wosslabs/touchstone check
```

The trace fails when a sentence has no scenario, a scenario has no approved sentence, a title appears twice, a step has no definition, or the lines differ in any way. Background steps, tags, tables and examples all count.

The product cannot do the new behavior yet, so the scenario must fail. The failure you want names the missing behavior:

```text
FAIL Declined card
Expected the customer not to be charged
The customer was charged 20.00
```

A programming error is a broken test, not a missing feature. A missing import, a refused connection or a stack trace means the test never reached the behavior. Tell the agent:

```text
That failure is a programming error. Fix the test and run it again.
```

If the scenario passes on the first run, the test is empty or the behavior already exists. The agent stops and says which. When the failure is the one you wanted, say so:

```text
Yes. That failure is the missing behavior.
```

The agent does not start the design or the production code in the same turn.

## 5. Implementation

After you agree, the agent reads the existing code again and names the module it will extend. It writes a short design in `drafts/` and works in this order:

1. One unit test for the internal behavior. It fails because the behavior is missing, not because of a typo.
2. The smallest production code that makes that unit test pass.
3. The approved scenarios, run again. They now pass.
4. The trace check, which still links your file to the feature file.
5. The application's full test suite.

Each slice is one sentence, end to end, before the next. The same command must give the same result every time. A test that reads the real clock, uses an unseeded random value, or calls an outside network service is not finished.

The agent then opens one pull request. The description names each scenario, the story file, the feature file and the module that changed, and includes the output of the trace check, the scenarios and the full suite. The agent does not merge.

## 6. Review

Read the change. You should be able to explain every changed file in one sentence. If you cannot, the change is too big:

```text
This pull request is too big. Split it.
```

The pipeline on the pull request is the verdict. A green run on the agent's computer is not. Merge when the pipeline is green and you understand the change. Then ask for the next feature:

```text
Now feature 2.
```

## When the agent goes off track

| What you see | What you say |
| --- | --- |
| It starts coding from a product request such as "build a shop" | Stop. List the features first. |
| It writes code for every feature on the list | Stop. Only the feature I picked. |
| It saves the sentences into `stories/` itself | Stop. I save that file. |
| It rewrites a whole module | Do not rewrite that file. Change the part this feature needs. |
| It says the tests should pass, and does not paste the output | Paste the command and the output. |
| The pull request also changes the pipeline | Take the pipeline change out. That is a separate review. |

## Other kinds of work

- **A bug** is one feature. The sentence states what happens today and what should happen. You see the wrong behavior fail before any fix is written. If the agent cannot reproduce the bug, it stops and reports what it tried.
- **A rename, typo, comment or documentation edit** does not need a new sentence.
- **A refactor** keeps the current behavior. The agent does not add, delete or rewrite anything in `stories/`. If a sentence would have to change, it stops and asks.
- **A spike** that you named as throwaway work is deleted when it is over. Keeping it is a new request and goes through this workflow.
