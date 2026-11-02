# The inner loop: clean, architect, harden

[Touchstone](../README.md) · [All documentation](README.md)

Once a feature is built and green, `touchstone-refine` makes three passes over what the agent changed, before the pull request:

1. **Clean.** Remove duplication, name things clearly, delete dead code.
2. **Architect.** Make dependencies point the right way. Business rules must not do file or network work. The I/O moves to the edge and is passed in. Behavior stays the same, so a log line or an audit record is moved, never deleted.
3. **Harden.** Make the tests strong enough that a wrong change fails them. This pass touches tests only. If the project has a mutation tool for its code, each survivor becomes a new test.

Each pass is its own small commit, checked by a command. The agent's opinion that a pass is done does not count.

**Fence and gates.** If `touchstone.json` defines the phases `clean`, `architect` and `harden`, a person has decided what each pass may touch and which commands must pass. After each pass the agent runs `npx @wosslabs/touchstone gates phase <pass> --base <sha>`. It refuses a pass that touched `stories/`, a `.feature` file, the workflows, `touchstone.json` or `CODEOWNERS`, and anything outside the pass's `allow` list, and only then runs the pass's gates. See [The gate config](gate-config.md#the-gate-config-touchstonejson). Without phases the skill still makes the three passes, with the project's own commands as the gates, and says so in the pull request.

**It is advisory.** The outer loop is still the verdict. These passes make a green pull request more likely and make it easier to read. They do not replace the checks that decide.

## Does it help?

This was measured, because "an agent that cleans up after itself" is easy to believe and easy to get wrong. `examples/refine-orders` is a small working order service with three seeded defects: the same money-formatting code copied three times, a domain module that writes a file, and unit tests so weak that six of fourteen code mutants survive. Three oracle scripts, kept outside the project where an agent cannot edit them, count how many defects remain. A fourth checks that behavior survived, including audit logging that the acceptance scenarios do not cover. Each arm got the same one-line request ("get this change ready for review"), five runs each, with `claude -p`:

| Arm | Defects fixed (of 3) | Runs fixing all three |
| --- | --- | --- |
| Plain request, project has quality scripts, plugin without the skill | 0.4 | 0 of 5 |
| Same, plus one sentence: "clean up, check the architecture, make the tests strong" | 3.0 | 5 of 5 |
| Skill and `touchstone.json` phases configured, plain request | 3.0 | 5 of 5 |
| Plain request, **no** quality scripts in the project, plugin without the skill | 0.0 | 0 of 5 |
| Same, plus the one sentence | 2.2 | 1 of 5 |
| Skill, no phases, no quality scripts, plain request | 2.8 | 4 of 5 |

Behavior was preserved in every run. What this shows, and what it does not:

- **An agent asked only to get a change ready for review does not improve its quality.** 0.4 and 0.0 of 3. Something has to ask for it. Without the skill or an instruction, nothing does.
- **The skill puts the policy in the repository instead of in everyone's prompt.** With the skill and phases configured, a plain request gives 3.0 of 3. The configured and plain arms differ clearly (p = 0.008, Fisher's exact test).
- **It does not beat a one-sentence instruction when the project has the tools.** Both reach 3.0. If your team always writes that sentence, the skill adds nothing for these three defects. This fixture cannot tell them apart.
- **Hardening the tests is the hard part, and gates matter.** With no mutation tool, an instruction fixed the weak tests in 1 of 5 runs, and the skill's hardening pass in 4 of 5. That is suggestive, not established (p = 0.21). With the mutation tool available, both fixed them every time.
- **Cost is small.** About 15 to 25 cents a run, and 9 to 16 turns on average instead of 7 to 8 for the plain request.

The experiment ran when the fixture's gates called `npm run dup` and similar. They now call `node quality/dup-check.js` directly, to match the advice under [Protected files](gate-config.md#protected-files). The scripts themselves did not change.

Read these limits before trusting them. It is one small project with defects chosen by the author, judged by oracles the author wrote. It is one model and five runs per arm. The oracles measure whether defects are gone, not whether the result reads well to a person. The first round of this experiment was wrong: the skill fired in the baseline arm too, so it measured nothing, and one run stopped because the skill had no instructions for a project without phases. That is fixed, and the baseline now uses the plugin from before the skill existed. A usage limit also cut one arm short, and the harness now reports that as "not run" instead of as a failure. A real code base will have defects this fixture does not.
