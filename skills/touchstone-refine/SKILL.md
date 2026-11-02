---
name: touchstone-refine
description: Use after a feature is built and green, before the pull request is opened, to clean the code, fix its dependency direction, and strengthen its tests in three separate passes.
---

# Refine a green change in three fenced passes

The sentence passes and the code works. Before the pull request, make three passes over what you changed: clean, architect, harden. Each pass has a fence (what it may touch) and gates (commands that must pass). Your own opinion that a pass is done counts for nothing. The command output is the result.

## Where the fence and the gates come from

- **If `touchstone.json` defines the phases `clean`, `architect` and `harden`,** a person has set the fence and the gates. Use `npx @wosslabs/touchstone gates phase <pass> --base <sha>` after each pass. It refuses a pass that touched a file it may not touch, then runs that pass's gates.
- **If it does not,** still make the three passes. The fence is then your own discipline: change only production code and tests of this feature, and never touch `stories/`, a `.feature` file, the workflows, `touchstone.json`, `CODEOWNERS`, or the project's quality scripts. For gates, use what the project already has: its test command, the acceptance run, and any scripts for duplication, architecture or mutation that you find in `package.json`, the build file or the README. Say in the pull request that no phases were configured. Do not stop.
- **If the project has no way to measure a pass,** read the code with the pass in mind and say what you could and could not check.

The pull request check is still the verdict. These passes make it more likely to be green. They do not replace it.

## Rules for every pass

- **Behavior stays exactly the same.** Do not add features. Do not change what the system does.
- **The sentences are not yours.** Never touch `stories/`, a `.feature` file, the workflows, `touchstone.json`, `CODEOWNERS`, or the project's quality scripts. The fence refuses it. If a gate cannot pass without crossing the fence, stop and say so.
- **Stay on this feature.** Work on the files this feature changed, and on code that duplicates them. Do not tidy the rest of the repository.
- **Check with commands, not by reading.** `npx @wosslabs/touchstone gates list` shows the gates a person configured.

Before each pass, note the commit you are on (`git rev-parse HEAD`). That is `<sha>`. After the pass, run its check, paste the output, and commit the pass on its own with a message that names it. Three small commits are easier to review than one large one.

## Pass 1. Clean

Make the code easier to read without changing what it does.

- Find duplication. If the project has a duplication gate, run it and read what it reports. Otherwise look for blocks that appear twice. Extract one shared function and have both places use it.
- Give unclear names their meaning. Split a function that does two jobs. Delete code nothing calls.
- Keep the existing tests green throughout. Do not delete or weaken a test.

With phases configured: `npx @wosslabs/touchstone gates phase clean --base <sha>`. Without: run the project's own checks for this pass.

## Pass 2. Architect

Make the dependencies point the right way. Policy, the rules of the business, must not depend on details: files, the network, a framework, the clock.

- Find policy code that does I/O or imports a framework. Move the I/O to the edge. Pass what the policy needs in as a parameter (a function or an object), and have the edge supply it.
- Keep the policy modules free of imports from the outside. Keep interfaces narrow.
- If the project has an architecture gate, run it and fix what it reports. If it has none and the rule matters, add a small automated check for it among the tests.
- Behavior stays the same. If the old code wrote a log line, sent a message, or saved a record, the new code still does, through the edge. Do not "fix" a dependency by deleting what the code did.

With phases configured: `npx @wosslabs/touchstone gates phase architect --base <sha>`. Without: run the project's own checks for this pass.

## Pass 3. Harden

Make the tests strong enough that a wrong change fails them. This pass touches tests only. If the fence refuses a production file, you are doing the wrong pass.

- If the project has a mutation gate for the code, run it. Each survivor is a change to the code that no test noticed. For each one, write a test that passes today and would fail for that change. Look at boundaries (the value just below and at a threshold), rounding, signs, empty and zero cases, and error paths.
- If there is no mutation gate, read each function you changed and ask what small wrong change would still pass. Write tests that catch those.
- A test that cannot fail is worth nothing. Do not weaken an assertion. Do not delete a test.

With phases configured: `npx @wosslabs/touchstone gates phase harden --base <sha>`. Without: run the project's own checks for this pass.

## Finish

Run every gate the project lists under `quality`, and the acceptance scenarios:

```bash
npx @wosslabs/touchstone gates list
npx @wosslabs/touchstone gates run <name>        # for each quality gate
```

In the pull request, name the three passes. For each one say what you changed and paste the phase command and its output. Say which gates the project has and which it lacks. If you could not do a pass, say why.

## Excuses

| Excuse | What you do |
| --- | --- |
| It is already clean | Run the gates. Paste the output. |
| A gate reports a problem, but fixing it would take a bigger rewrite | Do the smallest fix that makes the gate pass, or stop and say what blocks it. |
| The architecture gate fails because the logging lives in the policy code | Move the logging to the edge. Do not delete it. |
| The mutation gate fails, so I will change the production code until it passes | The harden pass is tests only. Write the missing test. |
| One big commit is faster | Three commits. The reviewer reads them one at a time. |
| The fence blocks the fix I need | Stop and say so. Do not edit the fence or the config. |
