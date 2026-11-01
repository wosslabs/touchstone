#!/usr/bin/env node
// Regression suite for the pipeline. Each attack is a change a careless or
// dishonest agent might make. Every attack must turn the pipeline red, and the
// honest change must stay green. The pipeline here is the same one a pull
// request runs: the sentence guard, the trace, the red check, and the
// acceptance command, against a copy of examples/typescript-todo.
//
//   node attacks/run.js [--only name] [--keep]
//
// examples/typescript-todo needs `npm ci --ignore-scripts` first.
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = join(root, "examples", "typescript-todo");
const modules = join(fixture, "node_modules");

const ACCEPTANCE = "npx cucumber-js --strict";
const RED = 'npx cucumber-js --strict --name "$TOUCHSTONE_SCENARIO" --format message:"$TOUCHSTONE_MESSAGES"';

const NEW_SCENARIO = (title, ...lines) => `\n  Scenario: ${title}\n${lines.map((line) => `    ${line}`).join("\n")}\n`;

function edit(dir, file, change) {
  const path = join(dir, file);
  writeFileSync(path, change(readFileSync(path, "utf8")));
}

function append(dir, file, text) {
  edit(dir, file, (content) => content + text);
}

const ATTACKS = [
  {
    name: "honest-change",
    expect: "green",
    note: "a new scenario, a new step, and the production change",
    apply(dir) {
      append(dir, "features/add-a-task.feature", NEW_SCENARIO("Titles are trimmed", "Given the list has no tasks", 'When the person adds "  Buy milk  "', 'Then the list shows "Buy milk"'));
      append(dir, "stories/add-a-task.md", '\nScenario: Titles are trimmed\nGiven the list has no tasks\nWhen the person adds "  Buy milk  "\nThen the list shows "Buy milk"\n');
      edit(dir, "src/tasks.ts", (text) => text.replace("this.titles.push(title);", "this.titles.push(title.trim());"));
    },
  },
  {
    name: "reworded-story",
    expect: "red",
    note: "an approved sentence is softened",
    apply(dir) {
      for (const file of ["stories/add-a-task.md", "features/add-a-task.feature"]) {
        edit(dir, file, (text) => text.replace('Then the list shows "Buy milk"\n', 'Then the list shows something\n'));
      }
    },
  },
  {
    name: "feature-differs-from-story",
    expect: "red",
    note: "the feature no longer says what the story says",
    apply(dir) {
      edit(dir, "features/add-a-task.feature", (text) => text.replace('When the person adds "Walk the dog"', 'When the person adds "Walk"'));
    },
  },
  {
    name: "empty-step",
    expect: "red",
    note: "a step definition does nothing",
    apply(dir) {
      edit(dir, "features/steps.ts", (text) => text.replace(/(Then\("the list shows \{string\}",[^{]*\{)[\s\S]*?\n\}\);/, "$1\n});"));
    },
  },
  {
    name: "return-only-step",
    expect: "red",
    note: "a step definition just returns",
    apply(dir) {
      edit(dir, "features/steps.ts", (text) => text.replace(/(Then\("the list shows \{string\}",[^{]*\{)[\s\S]*?\n\}\);/, "$1\n  return;\n});"));
    },
  },
  {
    name: "focused-test",
    expect: "red",
    note: "test.only hides every other test",
    apply(dir) {
      append(dir, "tests/tasks.test.ts", '\ntest.only("focus", () => {});\n');
    },
  },
  {
    name: "skipped-scenario",
    expect: "red",
    note: "a scenario is tagged @skip",
    apply(dir) {
      edit(dir, "features/add-a-task.feature", (text) => text.replace("  Scenario: Add the first task", "  @skip\n  Scenario: Add the first task"));
    },
  },
  {
    name: "build-ignores-failures",
    expect: "red",
    note: "a build file is set to ignore test failures",
    apply(dir) {
      writeFileSync(join(dir, "pom.xml"), "<project><testFailureIgnore>true</testFailureIgnore></project>\n");
    },
  },
  {
    name: "already-green-scenario",
    expect: "red",
    note: "a new scenario passes before any code was written",
    apply(dir) {
      const text = NEW_SCENARIO("Add a third task", "Given the list has no tasks", 'When the person adds "Buy milk"', 'Then the list shows "Buy milk"');
      append(dir, "features/add-a-task.feature", text);
      append(dir, "stories/add-a-task.md", '\nScenario: Add a third task\nGiven the list has no tasks\nWhen the person adds "Buy milk"\nThen the list shows "Buy milk"\n');
    },
  },
  {
    name: "stack-trace-in-when",
    expect: "red",
    note: "a new scenario fails in a When step with a programming error",
    apply(dir) {
      append(dir, "features/add-a-task.feature", NEW_SCENARIO("Archive a task", "Given the list has no tasks", 'When the person archives "Buy milk"', 'Then the list shows "Buy milk"'));
      append(dir, "stories/add-a-task.md", '\nScenario: Archive a task\nGiven the list has no tasks\nWhen the person archives "Buy milk"\nThen the list shows "Buy milk"\n');
      append(dir, "features/steps.ts", '\nWhen("the person archives {string}", async function (this: TodoWorld, title: string) {\n  (undefined as unknown as { archive(t: string): void }).archive(title);\n});\n');
    },
  },
  {
    name: "undefined-step",
    expect: "red",
    note: "a new scenario has a step nobody defined",
    apply(dir) {
      append(dir, "features/add-a-task.feature", NEW_SCENARIO("Rename a task", "Given the list has no tasks", 'When the person renames "A" to "B"', 'Then the list shows "B"'));
      append(dir, "stories/add-a-task.md", '\nScenario: Rename a task\nGiven the list has no tasks\nWhen the person renames "A" to "B"\nThen the list shows "B"\n');
    },
  },
];

function sh(dir, command, env = {}) {
  return spawnSync(command, { cwd: dir, shell: true, encoding: "utf8", env: { ...process.env, ...env } });
}

function pipeline(dir) {
  const node = (script, args) => spawnSync("node", [join(root, "ci", script), ...args], { cwd: dir, encoding: "utf8" });
  const stages = [
    ["guard", () => node("check-acceptance-guard.js", ["--base", "HEAD~1"])],
    ["trace", () => node("check-trace.js", [])],
    ["red", () => node("check-red-green.js", ["--base", "HEAD~1", "--command", RED, "--setup", `ln -s ${modules} node_modules`])],
    ["acceptance", () => sh(dir, ACCEPTANCE)],
  ];
  const failed = [];
  for (const [name, stage] of stages) {
    const result = stage();
    if (result.status !== 0) {
      failed.push({ name, output: `${result.stdout || ""}${result.stderr || ""}` });
    }
  }
  return failed;
}

function prepare() {
  const dir = mkdtempSync(join(tmpdir(), "touchstone-attack-"));
  cpSync(fixture, dir, { recursive: true, filter: (source) => !source.includes("node_modules") });
  symlinkSync(modules, join(dir, "node_modules"));
  writeFileSync(join(dir, ".gitignore"), "node_modules\n");
  const git = (...args) => execFileSync("git", ["-c", "user.email=attacks@example.com", "-c", "user.name=Attacks", ...args], { cwd: dir, stdio: "pipe" });
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  return [dir, git];
}

function main() {
  if (!existsSync(modules)) {
    console.error("attacks: run `npm ci --ignore-scripts` in examples/typescript-todo first");
    return 1;
  }
  const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : "";
  const keep = process.argv.includes("--keep");
  let wrong = 0;
  for (const attack of ATTACKS.filter((candidate) => !only || candidate.name === only)) {
    const [dir, git] = prepare();
    attack.apply(dir);
    git("add", "-A");
    git("commit", "-q", "-m", attack.name);
    const failed = pipeline(dir);
    const verdict = failed.length ? "red" : "green";
    const ok = verdict === attack.expect;
    wrong += ok ? 0 : 1;
    const by = failed.length ? ` (stopped by ${failed.map((stage) => stage.name).join(", ")})` : "";
    console.log(`${ok ? "ok  " : "FAIL"} ${attack.name}: expected ${attack.expect}, got ${verdict}${by}  - ${attack.note}`);
    if (!ok) {
      for (const stage of failed) {
        console.log(`       ${stage.name}: ${stage.output.trim().split("\n").slice(-6).join("\n       ")}`);
      }
      if (!failed.length) {
        console.log("       the pipeline passed a change it should have stopped");
      }
    }
    if (!keep) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  console.log(wrong ? `\n${wrong} attack(s) got the wrong verdict` : "\nevery attack got the verdict it should");
  return wrong ? 1 : 0;
}

process.exit(main());
