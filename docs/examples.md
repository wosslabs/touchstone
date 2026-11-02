# Examples by language

[Touchstone](../README.md) · [All documentation](README.md)

## Examples by language

Every example is the same small todo list with the same approved story, so you can compare how the acceptance layer looks in each stack. Steps talk to the running system only. Unit tests are kept apart from acceptance scenarios. Each folder has its own README with commands and a workflow.

| Folder | Application | Cucumber runner | Red check, run end to end |
| --- | --- | --- | --- |
| `examples/web-todo` | Node web page | cucumber-js + Playwright | yes |
| `examples/typescript-todo` | TypeScript HTTP service | cucumber-js | yes (also the base for `npm run attacks`) |
| `examples/jvm-todo` | Spring Boot 4 | Cucumber-JVM | yes |
| `examples/python-todo` | Python `http.server` | behave | yes |
| `examples/golang-todo` | Go `net/http` | godog | yes |
| `examples/rust-todo` | Rust `tiny_http` | cucumber-rs | yes |
| `examples/mojo-todo` | Mojo command line program | behave drives the binary | command written, not run end to end |

All of them read the failure reason: cucumber-js and Cucumber-JVM through Cucumber messages, and behave, godog and cucumber-rs through a Cucumber JSON report.

Mojo has no Cucumber runner of its own, so Python's behave runs the scenarios and drives the compiled Mojo program as a black box.

### Java and Spring

`examples/jvm-todo` keeps acceptance steps in a separate source set, `src/acceptanceTest/java`, run by Failsafe. Unit tests stay in `src/test/java`. This separation is what lets the red check copy a pull request's scenarios onto the base commit: the new unit tests refer to production code that does not exist there yet, so they must not be compiled in that run.

From that folder, `./mvnw verify` runs everything, and `./mvnw verify -DskipUnitTests=true` runs only the scenarios. `templates/acceptance-guard-jvm.yml` is the matching workflow. `examples/jvm-todo/touchstone.json` is a ready-made gate preset for a Spring project: [ArchUnit](https://www.archunit.org/) for architecture rules and [PIT](https://pitest.org/) for mutation testing of the code. Its phases map to the three passes: `architect` runs the architecture gate, and `harden` may change tests only and must pass PIT.

In this setup the code that judges a change lives in places a pull request controls, so the preset protects it:

- **The architecture rule** is `ArchitectureTest.java`: the task list must not depend on the web layer or do I/O. It is listed under `protect`. Otherwise an agent told to fix the architecture gate could weaken the rule instead of the code. Deleting the test already fails closed, because the gate finds no test to run. Weakening it, so that it matches the class but can never be violated, does not, and was the real hole.
- **PIT's pass mark** is not in `pom.xml`. A pull request can edit the pom and lower the threshold, and I reproduced that: untested code scored 33% and still passed with the threshold set to 0. Instead `quality/pit-gate.js` runs PIT, then applies the pass mark, the classes that must be mutated, and a minimum number of mutations, all given in `touchstone.json`, which is read from the base commit. The script is under `protect`. It also compiles first: `pitest:mutationCoverage` alone does not, so a stale `target/` can be mutated instead of the code.
- **`pom.xml` stays out of `protect`**, because a pull request that adds a dependency would then fail. Keep it in CODEOWNERS. The pom can still run code, and can still exclude methods from PIT (`excludedMethods`) so that they are never mutated. The minimum-mutations check catches some narrowing, not that. A person has to review pom changes.

The Java attacks (`npm run attacks:jvm`, a CI job) check this: an honest change passes, and deleting the rule, weakening it, lowering PIT's threshold, narrowing its target classes, and rewriting the PIT script are each stopped. Run with `CONTROL=no-restore` to see what the protection is worth: the two weakening attacks then pass.

Copy `touchstone.json`, `quality/pit-gate.js`, the `ArchitectureTest.java` rule, and the ArchUnit and PIT entries in `pom.xml` as a starting point. The Maven wrapper pins the Maven version. The example uses an in-memory store, so it has no database and no Testcontainers. Add Testcontainers where your system has a real database.


## Held-back scenarios

An agent can tune its code to the examples it can see. To check that it learned the rule and not the examples, keep some scenarios where the agent cannot read them, for instance in a private repository. The `holdout-command` input runs them after the acceptance command. `templates/holdout-workflow.yml` shows one way to do this with a read-only deploy key. It has not been run on GitHub Actions yet, so treat it as a starting point.
