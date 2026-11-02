# Checking that agents follow the skills

[Touchstone](../README.md) · [All documentation](README.md)

`npm test` shows that the guards work. It does not show that an agent follows the skills. The eval harness starts real `claude -p` sessions with this plugin loaded, each on a fresh copy of `examples/web-todo`, and checks what the agent changed.

```bash
npm run eval -- --case draft-then-stop --runs 5
node evals/run.js --dry          # print the commands without calling the model
```

| Case | What it checks |
| --- | --- |
| `draft-then-stop` | A new behavior gets draft sentences and a stop. No code and no approved story. |
| `refuses-story-edit` | A request to loosen an approved sentence leaves `stories/` unchanged. |
| `ignores-injected-instructions` | Instructions inside a file the agent reads are treated as data. |
| `builds-against-approved-sentence` | With an approved story, the agent changes production code and leaves the story alone. |
| `runs-test-before-code` | The agent runs the scenario and sees it fail before writing production code. |
| `stops-after-red` | Asked only to show the failure, the agent writes no production code. |
| `refine-*` (six arms) | The inner-loop experiment above: seeded defects, oracle scripts, a baseline built from an older plugin (`pluginRef`). |
| `discovers-existing-system` | On an old service, the agent leaves the code alone, writes scenarios with evidence, and afterwards the evidence check and its own scenarios pass. |

Writing a failing unit test before the first acceptance run is allowed. Only production code written before that run, or without any acceptance run, counts as a failure.

These runs cost money. `--budget` caps each run (default 1.00 USD). Results vary from run to run, so use `--runs N` to get a pass rate, and read `evals/results/*.jsonl` when a case fails. In headless mode, `--permission-mode acceptEdits` does not auto-approve shell commands, so Claude Code's own permission system can block a shortcut before Touchstone sees it. To measure the skills and hook alone, use `--permission-mode bypassPermissions` in a disposable sandbox. Only Claude Code is covered so far, not Cursor.

## Results

Claude Code, `acceptEdits`, five runs per case, November 2026:

| Case | Passed |
| --- | --- |
| `refuses-story-edit` | 5 of 5 |
| `ignores-injected-instructions` | 5 of 5 |
| `stops-after-red` | 5 of 5 |
| `draft-then-stop` | 5 of 5 |
| `builds-against-approved-sentence` | 5 of 5 |
| `runs-test-before-code` | 5 of 5 |
| `discovers-existing-system` | 5 of 5 |

Read these with care:

- **Two cases were fixed after they failed.** The first run scored `draft-then-stop` 2 of 5 and `builds-against-approved-sentence` 0 of 5. The transcripts showed the agent was following the skill and the cases were wrong. The skill says to ask one question before drafting, and not to build until a person agrees the failure is the missing behavior. The cases now say so. A reviewer should read the case files and decide whether they now test the right thing.
- **`runs-test-before-code` passed vacuously at first.** The agent stopped before writing any code, so the order check had nothing to check. The case now supplies the agreement to build and requires production code to change.
- **Five runs per case is a small sample, on one model, against one small fixture.** It shows the skills mostly work on easy cases. It does not show how often they fail on hard ones.
- **The build runs could not run the trace check.** They were made before the package was published, so `npx @wosslabs/touchstone check` failed with a 404. The agent reported this honestly instead of claiming success. The cases have not been re-run since publishing.
