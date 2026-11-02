# Bite-sized agentic delivery

[Touchstone](../README.md) · [All documentation](README.md)

Bite-sized agentic delivery is the name for how Touchstone works. An agent does the work. Deterministic checks decide whether it is good. A person decides only what only a person can decide, in pieces small enough to read.

**The problem.** Agents write a great deal of text: specifications, plans, task lists, design notes, long diffs. Architects, product owners and reviewers cannot read all of it. So they skim, trust the summary, or approve without reading, and the review exists on paper while nobody has actually decided anything. More agent output makes this worse, not better.

**The idea.** Replace reading with checking wherever a check is possible, and keep what remains short. Four rules:

1. **The requirement is a few sentences, and the same sentences are the tests.** A feature is a handful of Given, When, Then lines, a page at most. The approved story for the TypeScript example is 12 lines and 59 words. There is no separate specification to read and no plan to keep in step with it, because the sentences run.
2. **Machines read the long parts.** Whether the sentences are unchanged, whether the test failed first for the right reason, whether every value in a sentence is really checked, whether the quality gates pass: the outer loop checks these over any amount of code and returns a verdict. You read the verdict, and the evidence only when it is red.
3. **One bite is one feature and one small pull request.** The agent works on the one feature you choose. A reviewer should be able to explain every changed file in one sentence. If not, the pull request is split.
4. **Prose is short on purpose.** No plan or design is written before the sentences are approved. A design note must not be longer than the sentences it serves. Working notes stay in `drafts/`, where nobody has to read them for the change to be trusted.

## What each person reads

| Who | Reads | Does not have to read |
| --- | --- | --- |
| Product owner or analyst | The sentences for one feature, before any code is written. The first failure, in plain words. | Specifications, plans, task lists, code |
| Architect | `touchstone.json` once, to set the gates and the fence. The architecture and quality gate results on a pull request. | Per-feature design prose, and the style points a gate already checks |
| Reviewer | One small pull request, and the Action's comment on it: a pass, or the failed stage with the last lines of its output. The step definitions it flags, because they decide whether a sentence tests anything. | Files the checks proved unchanged: the stories, the feature files, the workflows |
| Manager or auditor | The trail of pull-request comments: which checks passed, and which sentences a person approved. | The change itself |

The reading is concentrated in one place: the sentences. That is deliberate. It is the one thing a check cannot replace, so it must be read properly. "Sounds good" is not approval.

## What this does not claim

- **Agents still write plans and notes.** The aim is that nobody has to read them for the change to be trusted, not that they are never written.
- **The reduction in reading is by design, not measured.** There is no study of how many words a person reads per merged feature with and without Touchstone. A pilot should count that. It is the number that matters.
- **Short is not the same as right.** The checks prove that the code agrees with the sentences. They cannot prove the sentences say what the business wants. That is the person's job.
- **Reverse-engineered requirements are not short.** For `examples/legacy-orders`, the generated document is 1,513 words for a service of 137 lines, because it states every rule with its boundaries. It is meant to be consulted one area at a time. For a service that small it is longer than the code. It is for people who do not read code, and for systems too large to read.
