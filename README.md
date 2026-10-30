# Touchstone

Touchstone is the step spec-driven coding agents skip. You approve a behavior sentence. The agent shows you that sentence failing against the system as it is today. Then it writes code.

```text
Scenario: Declined card
Given the bank declines the card
When the customer confirms payment
Then the customer sees "payment failed"
And the customer is not charged
```

The sentence is the requirement. You can agree it is right without seeing the code. The design and the production code come after you have seen it fail for that reason.

A skill tells the agent to stop. The hook and the CI check are what still work when the agent does not listen. Touchstone ships all three. The skill is the coach. The hook and the workflow are the referee.

This repository is not the other open-source projects that use the name Touchstone. Here the name means the sentence you test a change against.

## Install the skill

### Claude Code

```text
/plugin marketplace add wosslabs/touchstone
/plugin install touchstone@touchstone
```

The marketplace file in this repo registers that plugin. The included hook refuses agent edits to `acceptance/examples/`, `.github/workflows/`, and `ci/check_acceptance_guard.py`.

### Cursor

Copy the `skills/` directory to `.cursor/skills/` in the application, or install this folder as a local plugin. The plugin manifest points at `hooks/hooks-cursor.json`. Three skills ship together: `using-touchstone`, `touchstone`, and `touchstone-build`.

If the plugin hook does not load, copy the script into the application and use the template:

```text
hooks/protect-acceptance.py   ->  .cursor/hooks/protect-acceptance.py
templates/cursor-hooks.json   ->  .cursor/hooks.json
```

Merge `hooks.json` with hooks the application already has. Do not replace them blindly.

## Set up the application you deploy

The skill is installed once. These files live in each application, and a person owns them.

1. Keep approved sentences in `acceptance/examples/`. The agent may draft in `acceptance/drafts/`. You copy a draft into `acceptance/examples/` when it says what you mean.
2. Copy `ci/check_acceptance_guard.py` to `ci/check_acceptance_guard.py`.
3. Copy `templates/acceptance-guard.yml` to `.github/workflows/acceptance-guard.yml`.
4. Copy the paths in `templates/CODEOWNERS` into the application's `CODEOWNERS`, and turn on branch protection so those paths need a person.

The workflow fails the pull request when lines disappear from `acceptance/examples/`, or when a change adds a skipped or disabled test. It compares the pull request with its base commit. A person who is retiring a sentence adds a line in that same file:

```text
Touchstone-Allow-Drop: the charge sentence moved to another story
```

The agent is not supposed to write that file. Branch protection is what makes the exception yours.

## What the agent is told to do

Touchstone is enough on its own. A session starts by reading `using-touchstone`, which sends a behavior change through the other two skills.

1. Ask until the situations are clear, then draft them in customer language. No class names, tables, URLs, or status codes.
2. Stop until you edit and approve them.
3. Build a driver that runs the approved sentence against the real system. A mock in place of that system is not the check.
4. Paste the failure and stop again. The failure has to be the missing behavior. A compile error is a broken driver. A pass on the first run means the check is empty or the behavior already exists.
5. After you agree the failure is the right one, `touchstone-build` writes a short design, then unit tests, then the smallest code. It re-runs the approved sentence and opens a pull request.
6. The agent leaves the approved sentences, the workflow, and the guard script alone. A skipped test is not a failure it showed you. The guard on the pull request is the merge verdict.

A bug is one sentence about what happens today and one about what should happen. A refactor leaves `acceptance/examples/` unchanged.

Another workflow plugin may also be installed. Touchstone still goes first. A plan from that plugin starts only after the sentence has failed for the missing behavior.

## Where the ideas came from

Superpowers, Addy Osmani's agent-skills, GitHub Spec Kit, BMAD, and Disciplined Agentic Engineering are MIT-licensed. Their text may be copied if their copyright notice stays with the copy. Touchstone does not copy those files. Each of those workflows moves from a document to a plan, and pasting the files in would bring that jump back.

What Touchstone kept, in its own words:

- From Superpowers: watch a test fail before production code, delete code that was written first, stop the turn for a person, and write down the excuses.
- From agent-skills: end the turn after the requirement is written, so approval happens later. Ask before changing CI. Keep the change small enough to explain.
- From Spec Kit: write the acceptance scenarios with the story, and let a person review before implementation. Touchstone runs those scenarios and requires the failure. Spec Kit leaves the tests optional.
- From BMAD: have the acceptance check before implementation. Touchstone does not generate tests that start out skipped.
- From Disciplined Agentic Engineering: keep the sentences in customer language, keep unit tests separate from those sentences, and do not let the agent edit an approved sentence.
- From Dave Farley's published acceptance-testing method: a sentence, a small vocabulary, a driver, and the real system. His Claude skill ships with a paid course and was not read or copied.
- Kiro's product documentation was not copied. The order here is the requirement, then a failing check, then the design.

## What installing this does not do

A passing sentence is not a production deploy. Canary releases, rollback, migration checks, architecture rules, and mutation testing stay in your pipeline. Touchstone does not write them for you. Add them in the application, on paths the agent does not own.

## Development

```bash
python3 -m unittest discover -s tests -v
```

The tests cover the hook's allow and deny decisions and the CI guard. They do not claim an agent will follow the skill.

## License

MIT. Copyright 2026 wosslabs.
