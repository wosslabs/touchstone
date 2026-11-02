# The gate config (`touchstone.json`)

[Touchstone](../README.md) · [All documentation](README.md)

One file, owned by people, names the commands that decide whether a change is good. The Action and an agent's inner loop both read it, so they cannot disagree about what "passing" means, and an agent cannot redefine it. `npx @wosslabs/touchstone init` writes a starter one.

```json
{
  "gates": {
    "acceptance": "npx cucumber-js --strict",
    "red": {
      "command": "npx cucumber-js --strict --name \"$TOUCHSTONE_SCENARIO\" --format message:\"$TOUCHSTONE_MESSAGES\"",
      "setup": "npm ci --ignore-scripts"
    },
    "unit": "npm test",
    "complexity": "node quality/complexity.js"
  },
  "quality": ["unit", "complexity"],
  "protect": ["quality/**"],
  "mutation": { "mode": "warn", "maxMutants": 30 },
  "phases": {
    "clean": { "allow": ["src/**", "tests/**"], "gates": ["unit", "acceptance"] }
  }
}
```

- **`gates`** are named commands. A gate is a string, or `{ "command", "setup" }`. The Action uses `acceptance` and `red` when the workflow does not set `command` and `red-command`.
- **`quality`** lists gates the Action runs after the acceptance command. Any of them failing fails the pull request. This is where mutation testing of the code, complexity limits, duplicate-code checks and architecture rules go. Touchstone does not ship those tools. They are specific to each language (PIT, Stryker, mutmut, ArchUnit and others), so you name the command you already use.
- **`protect`** lists the paths that judge a change: the scripts your quality gates run, for example. A pull request must not be able to rewrite them. See [Protected files](#protected-files).
- **`mutation`** sets the mode and the cap for [Gherkin value mutation](value-mutation.md#gherkin-value-mutation).
- **`phases`** are for an agent working in steps (build, clean, restructure). Each has a list of gates to pass and, optionally, `allow` and `forbid` lists of paths. The starter file lists only the `acceptance` gate for each phase, because a new project has no unit tests yet. Add `"unit"` to each phase once it has them.

**The Action reads this file from the pull request's base commit, not from the pull request.** A pull request that loosens a gate takes effect only after a person has reviewed and merged it. For the first pull request that adds the file, the working tree is used. The file is protected by the hook and listed in the CODEOWNERS template.

## Protected files

A quality gate is only as strong as the script it runs. If a pull request can rewrite `quality/arch-check.js` to `process.exit(0)`, the architecture gate passes whatever the code does. The unit tests are different: they are part of the change, and the harden pass and value mutation exist to judge them. The scripts that do the judging are not.

List those scripts under `protect`:

```json
"protect": ["quality/**"]
```

Three things then happen:

1. **The hook refuses agent edits** to those paths. Running a protected script (`node quality/dup-check.js`) is still allowed.
2. **The Action puts the base commit's version of every protected file back** before it runs the checks. A pull request that changes, deletes or adds a file there still gets judged by the old one. The comment lists such files under "Protected files changed: a person must review these", because the change takes effect only after it is merged. The list is read from the base commit, so a pull request cannot empty it.
3. **The phase fence forbids them** too, so an agent's hardening pass cannot weaken the tool it is measured by.

`npx @wosslabs/touchstone gates codeowners --team @org/team` prints the CODEOWNERS lines for every protected path, so a person has to approve changes to them.

**Call the tool directly in a gate, not through an npm script.** `"architecture": "npm run arch"` runs whatever `arch` means in the pull request's own `package.json`, and a pull request can change that file. `"architecture": "node quality/arch-check.js"` runs a path you have protected. `touchstone gates list` warns about gates that run an npm script. Do not put `package.json` itself under `protect`: a pull request that adds a dependency would then fail.

## The fence around a phase

```bash
npx @wosslabs/touchstone gates phase clean --base HEAD
```

This lists the files changed since the base, and fails if any of them is outside what the phase may touch. These are never allowed in any phase: `stories/`, any `.feature` file, the workflows, `touchstone.json`, `CODEOWNERS`, `.claude/` and `.cursor/hooks/`. A phase can add `allow` (only these paths) and `forbid` (never these) lists. Only if the fence holds does it run the phase's gates in order and stop at the first failure.

It is a plain check on `git diff`. It does not depend on an agent following instructions. It is what stops an agent that is tidying code from also editing the sentences the pull request is judged against.

`gates list` prints the gates, and `gates run <gate>` runs one and passes its exit code through.
