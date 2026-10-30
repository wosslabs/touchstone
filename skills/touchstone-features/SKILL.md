---
name: touchstone-features
description: Use when the user describes a product, a release, or more than one thing a person can do, before any sentences, design, or code.
---

# Split the work into features

A product is a list of features. A feature is one thing a person can finish and check. "Build a shop" is a product. "The customer sees that a declined card was not charged" is a feature.

Do not write sentences for every feature. Do not write code. Do not write a design for the whole product.

## Look at the code first

If the repository already has code, read the parts that do a similar job before you propose anything. Name the files. A new structure is a guess until you know what is already there.

Do not replace a working area because writing it again looks easier. Say which existing part the next feature will extend.

## Write the list

Save `acceptance/drafts/features.md`.

Each row is one pull request. If you cannot name the few files it would touch, the row is too big. Split it.

```markdown
# Features

Out of scope: refunds, receipts, saved cards.

| Order | Feature | A person is done when they can... | Extends |
| --- | --- | --- | --- |
| 1 | Declined card | see "payment failed" and no charge | checkout screen, none yet |
| 2 | Successful card | see "paid" and the charge recorded | the same screen |
```

Order them so the first row is useful on its own. Later rows may use earlier ones. A row that says "and" is two features.

A screen is still a feature. Describe what the person sees and does, not the widgets' code.

## Stop

Show the list. Ask which row is first. End the turn.

Their answer is one row. The next skill is `touchstone`, for that row only. Leave the other rows in the draft.

## Excuses

| Excuse | What you do |
| --- | --- |
| I understand the whole product, so I can build it | Write the list and wait. |
| The codebase is messy, I will generate a clean one | Name the files you read. Extend them. |
| One pull request for the first version is faster | One row is the first version. The rest wait. |
| I will write all the sentences now | Sentences are for the chosen row only. |
