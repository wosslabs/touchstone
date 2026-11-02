# Installing and setting up

[Touchstone](../README.md) · [All documentation](README.md)

## Installing the skills and hook

Install the plugin once. The files described in [Setting up a repository](#setting-up-a-repository) are then copied into each application, and a person owns those copies.

### Claude Code

```text
/plugin marketplace add wosslabs/touchstone
/plugin install touchstone@touchstone
```

### Cursor

Copy `skills/` to `.cursor/skills/` in your application, or install this folder as a local plugin. The plugin manifest points at `hooks/hooks-cursor.json`. If the plugin hook does not load, copy the script into the application and merge the hook file with any hooks you already have:

```text
hooks/protect-acceptance.js   ->  .cursor/hooks/protect-acceptance.js
templates/cursor-hooks.json   ->  .cursor/hooks.json
```

### The skills

Seven skills are installed together:

| Skill | When it applies |
| --- | --- |
| `using-touchstone` | At the start of a session, before any other workflow plans or writes code |
| `touchstone-features` | The request is a product, a release, or more than one visible outcome |
| `touchstone` | One feature is chosen and has no approved failing sentence yet |
| `touchstone-build` | You have agreed that the failure is the missing behavior |
| `touchstone-refine` | The feature is built and green, before the pull request |
| `touchstone-discover` | You want the requirements of an existing code base written down |
| `touchstone-repair` | A run failed with a programming error, an undefined step, or an app that did not start |

Touchstone is a complete workflow. If another workflow plugin is also installed, Touchstone still comes first, and planning starts only after the sentence has failed for the missing behavior.

### What the hook blocks

The hook refuses agent edits to `stories/`, `.github/workflows/`, `.claude/`, `.cursor/hooks/`, `CODEOWNERS`, `touchstone.json`, the paths listed under `protect` in it, and Touchstone's own check scripts. It also blocks obvious shell writes such as `rm`, `mv`, redirects, and `find ... -delete`.

The hook is a safety net, not a lock. A determined agent can get around it, for example by building a path inside a shell variable. The real controls are CODEOWNERS and branch protection, which the agent cannot bypass.


## Setting up a repository

`npx @wosslabs/touchstone init` does the first part of this for you. You still need to replace the team name in CODEOWNERS and install your browser or runtime.

1. **Keep approved sentences in `stories/`.** Markdown and `.feature` files both work. The agent may draft in `drafts/`. You copy a draft into `stories/` when it says what you mean.
2. **Add the workflow.** Copy `templates/acceptance-guard.yml` to `.github/workflows/acceptance-guard.yml`. It calls `wosslabs/touchstone@v0`. Give the workflow permission to write pull request comments. For a Java project use `templates/acceptance-guard-jvm.yml`, and see [Examples by language](examples.md#examples-by-language) for other stacks.
3. **Set up CODEOWNERS.** Copy the paths from `templates/CODEOWNERS` into your `CODEOWNERS` file and replace `@YOUR_GITHUB_ORG/YOUR_TEAM` with the people who may change approved sentences and the pipeline. Turn on branch protection so that those paths need a review from that team. The template also covers the build files and the step definitions. Keep the lines that match your layout and delete the rest.
4. **Add Cucumber, or another Cucumber-compatible runner.** Commit your lockfile so the pipeline installs the same versions every time. Unit tests stay in your own test tool. The acceptance layer is Cucumber. Its steps may drive a browser with Playwright, call the running service over HTTP, or run a command line program. The feature file does not name the driver.

### How checks find your tests

Stories and features are parsed with the official [`@cucumber/gherkin`](https://github.com/cucumber/gherkin) parser. A story that is not valid Gherkin fails the trace.

Step definitions are found by scanning `features/`, `src/test/` and `src/acceptanceTest/` for `.js`, `.ts`, `.py`, `.java`, `.kt`, `.go` and `.rs` files. If a feature exists and no step definition is found, the trace fails instead of passing quietly. A step whose body does nothing (empty, `pass`, `return`, `return nil`) also fails.

### Why acceptance steps should call the system from outside

Keep acceptance steps in their own place (`features/`, or `src/acceptanceTest/` for Java), and make them talk to the running system only, through a browser, HTTP, or the command line. Then the red check can copy a pull request's scenarios onto the previous commit and run them, without needing the unit tests that go with the new code. If your steps import code that the pull request adds, that check cannot work. You can list extra paths to copy with the `overlay` input.
