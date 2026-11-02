# Gherkin value mutation

[Touchstone](../README.md) · [All documentation](README.md)

A sentence that states a value ("10% off over 101.00") should fail when that value is wrong. Mutation checks that it does. For each scenario it changes one value at a time, runs the scenario, and expects it to fail:

| Value | Changed to |
| --- | --- |
| a number | one unit of its last digit higher: `100.00` becomes `100.01`, `20` becomes `21` |
| a string | the same string with a letter added (`bob` becomes `bobx`), and with the first letter replaced (`xob`). The second catches prefix rules like `gold-`. |
| `true` or `false` | the other one |

A mutant that makes the scenario fail is **killed**. A mutant that leaves it passing is a **survivor**: nothing the scenario checks depends on that value. Either the step ignores the value, or an assertion can never fail. This is the check for "a step definition can still be weakened". A `Then` step that stops asserting anything makes every value in its scenarios survive.

```bash
npx @wosslabs/touchstone mutate --base <sha> \
  --command 'npx cucumber-js --name "$TOUCHSTONE_SCENARIO" --format message:"$TOUCHSTONE_MESSAGES"'
```

The command is the same kind as `red-command`: it runs the scenario named by `$TOUCHSTONE_SCENARIO`. If it writes Cucumber messages or a JSON report to `$TOUCHSTONE_MESSAGES`, a mutant only counts as killed by an assertion-style failure. A run that merely broke (an undefined step, a programming error, a failing hook) is reported as **invalid** and says nothing either way.

What gets mutated:

- With `--base`, the new or changed scenarios. If a step definition changed, every scenario, because the change could have weakened any of them.
- With `--all`, every scenario. Use `--features <dir>` to point at a different folder, for example `drafts/legacy`.
- At most 30 mutants per scenario (`--max-mutants`), sampled evenly. The report says when it sampled.
- The unmutated scenario must pass twice first. A scenario that fails or flakes is skipped, so a flaky test never looks like a kill.

**Survivors are questions for a person, not failures to hide.** Many are fine: a customer's name that does not matter, or `40.00` becoming `40.01` when the result is rounded to the same cent. For each one, either tighten the step so it depends on the value, or accept it. A person accepts it by adding a line to a file under `stories/`:

```text
# touchstone-equivalent: Orders over 100 get 10% off | alice | the name is only shown on the receipt
```

The agent cannot add that line, because it cannot edit `stories/`. Identical survivors are grouped in the report, so one customer name that appears in fifteen scenarios is one line.

`mutate` works in place on the feature files, and restores them afterwards, even if it is interrupted (a leftover `.touchstone-orig` file is restored on the next run). Run it on a clean checkout.

Modes: `off`, `warn` (report, never fail) and `fail` (a survivor that has not been accepted fails the pull request). Start with `warn`. In `fail` mode, the mode comes from `touchstone.json` at the base commit, so a pull request cannot switch it off for itself.

Limits: it only changes values that appear in the scenario, so a rule with no number or string in its sentences is not tested. It costs one scenario run per mutant. It checks that the scenarios notice wrong values. It does not test the production code, which needs a mutation tool for your language.
