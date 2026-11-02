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
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = join(root, "examples", "typescript-todo");
const modules = join(fixture, "node_modules");

const ACCEPTANCE = "npx cucumber-js --strict";
const RED = 'npx cucumber-js --strict --name "$TOUCHSTONE_SCENARIO" --format message:"$TOUCHSTONE_MESSAGES"';

const QUALITY_SCRIPT = `import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
let found = 0;
for (const name of readdirSync("src")) {
  if (readFileSync(join("src", name), "utf8").includes("FIXME")) {
    console.log(\`quality: FIXME left in src/\${name}\`);
    found += 1;
  }
}
process.exit(found === 0 ? 0 : 1);
`;

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
    stage: "guard",
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
    name: "vacuous-assertion",
    expect: "red",
    stage: "mutate",
    note: "a Then step stops checking anything, and no scenario changed",
    apply(dir) {
      edit(dir, "features/steps.ts", (text) => text.replace('assert.ok((await titles(this)).includes(title), `Expected the list to show "${title}"`);', "await titles(this);"));
    },
  },
  {
    name: "vacuous-assertion-and-mutation-switched-off",
    expect: "red",
    stage: "mutate",
    note: "the same, and the pull request also turns mutation off in touchstone.json",
    apply(dir) {
      edit(dir, "features/steps.ts", (text) => text.replace('assert.ok((await titles(this)).includes(title), `Expected the list to show "${title}"`);', "await titles(this);"));
      writeFileSync(join(dir, "touchstone.json"), `${JSON.stringify({ gates: { acceptance: ACCEPTANCE }, mutation: { mode: "off" } })}\n`);
    },
  },
  {
    name: "weakened-quality-script",
    expect: "red",
    stage: "quality",
    note: "a quality gate's script is rewritten to always pass, in the same change that adds what it catches",
    apply(dir) {
      edit(dir, "src/tasks.ts", (text) => `// FIXME: validate the title properly\n${text}`);
      writeFileSync(join(dir, "quality", "check.js"), "process.exit(0);\n");
    },
  },
  {
    name: "focused-test",
    expect: "red",
    stage: "guard",
    note: "test.only hides every other test",
    apply(dir) {
      append(dir, "tests/tasks.test.ts", '\ntest.only("focus", () => {});\n');
    },
  },
  {
    name: "skipped-scenario",
    expect: "red",
    stage: "guard",
    note: "a scenario is tagged @skip",
    apply(dir) {
      edit(dir, "features/add-a-task.feature", (text) => text.replace("  Scenario: Add the first task", "  @skip\n  Scenario: Add the first task"));
    },
  },
  {
    name: "build-ignores-failures",
    expect: "red",
    stage: "guard",
    note: "a build file is set to ignore test failures",
    apply(dir) {
      writeFileSync(join(dir, "pom.xml"), "<project><testFailureIgnore>true</testFailureIgnore></project>\n");
    },
  },
  {
    name: "already-green-scenario",
    expect: "red",
    stage: "red",
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
  spawnSync("node", [join(root, "ci", "restore-protected.js"), "--repo", dir, "--base", "HEAD~1"], { cwd: dir, encoding: "utf8" });
  const node = (script, args) => spawnSync("node", [join(root, "ci", script), ...args], { cwd: dir, encoding: "utf8" });
  const stages = [
    ["guard", () => node("check-acceptance-guard.js", ["--base", "HEAD~1"])],
    ["trace", () => node("check-trace.js", [])],
    ["red", () => node("check-red-green.js", ["--base", "HEAD~1", "--command", RED, "--setup", `ln -s ${modules} node_modules`])],
    ["mutation", () => node("mutate-gherkin.js", ["--base", "HEAD~1", "--command", RED])],
    ["quality", () => node("gates.js", ["run", "quality-check", "--base", "HEAD~1"])],
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

// Writes the base project into `dir`, makes the base commit, and returns a git
// helper for that directory. `ignore` lists extra paths git should not track.
function seed(dir, ignore = []) {
  cpSync(fixture, dir, { recursive: true, filter: (source) => !source.includes("node_modules") });
  writeFileSync(join(dir, ".gitignore"), `${["node_modules", ...ignore].join("\n")}\n`);
  // A quality gate whose script is protected: it fails if any source file still
  // carries a FIXME. Called directly, not through an npm script.
  mkdirSync(join(dir, "quality"), { recursive: true });
  writeFileSync(join(dir, "quality", "check.js"), QUALITY_SCRIPT);
  const config = {
    gates: {
      acceptance: ACCEPTANCE,
      red: { command: RED, setup: "npm ci --ignore-scripts" },
      "quality-check": "node quality/check.js",
    },
    quality: ["quality-check"],
    protect: ["quality/**"],
    mutation: { mode: "fail" },
  };
  writeFileSync(join(dir, "touchstone.json"), `${JSON.stringify(config, null, 2)}\n`);
  const git = (...args) => execFileSync("git", ["-c", "user.email=attacks@example.com", "-c", "user.name=Attacks", ...args], { cwd: dir, stdio: "pipe", encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  return git;
}

function prepare() {
  const dir = mkdtempSync(join(tmpdir(), "touchstone-attack-"));
  const git = seed(dir);
  symlinkSync(modules, join(dir, "node_modules"));
  return [dir, git];
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 || index + 1 >= process.argv.length ? "" : process.argv[index + 1];
}

// Builds one attack as a scratch repository in `dir` (base commit, then the
// attack as a second commit) so a workflow can run the real Action on it.
function materialize(dir, name) {
  const attack = ATTACKS.find((candidate) => candidate.name === name);
  if (!attack) {
    console.error(`attacks: no attack named "${name}"`);
    return 1;
  }
  const git = seed(dir, ["touchstone-action"]);
  const base = git("rev-parse", "HEAD").trim();
  attack.apply(dir);
  git("add", "-A");
  git("commit", "-q", "-m", attack.name);
  console.log(base);
  return 0;
}

// --- The Java suite -------------------------------------------------------
// The same idea against examples/jvm-todo: the judging tools there are an ArchUnit
// rule and PIT's pass mark, so those are what the attacks go after.
const jvmFixture = join(root, "examples", "jvm-todo");
const TASK_LIST = join("src", "main", "java", "example", "todo", "TaskList.java");
const ARCH_TEST = join("src", "test", "java", "example", "todo", "ArchitectureTest.java");
const TASK_LIST_TEST = join("src", "test", "java", "example", "todo", "TaskListTest.java");

const addWebImport = (dir) =>
  edit(dir, TASK_LIST, (text) => text.replace("import java.util.List;", "import java.util.List;\nimport org.springframework.http.HttpStatus;").replace("titles.add(title);", "titles.add(title);\n        HttpStatus.valueOf(200);"));

const addUntestedMethod = (dir) =>
  edit(dir, TASK_LIST, (text) => `${text.trimEnd().slice(0, -1)}\n    public int untested(int a, int b) {\n        if (a > b) {\n            return a - b;\n        }\n        return b - a;\n    }\n}\n`);

const JVM_ATTACKS = [
  {
    name: "jvm-honest-change",
    expect: "green",
    note: "a new method with its test",
    apply(dir) {
      edit(dir, TASK_LIST, (text) => `${text.trimEnd().slice(0, -1)}\n    public int size() {\n        return titles.size();\n    }\n}\n`);
      edit(dir, TASK_LIST_TEST, (text) => `${text.trimEnd().slice(0, -1)}\n    @Test\n    void countsTheTasks() {\n        TaskList list = new TaskList();\n        assertThat(list.size()).isZero();\n        list.add("Buy milk");\n        assertThat(list.size()).isEqualTo(1);\n    }\n}\n`);
    },
  },
  {
    name: "jvm-delete-arch-rule",
    expect: "red",
    stage: "architecture",
    note: "the ArchUnit rule is deleted in the change that breaks it",
    apply(dir) {
      rmSync(join(dir, ARCH_TEST));
      addWebImport(dir);
    },
  },
  {
    name: "jvm-weaken-arch-rule",
    expect: "red",
    stage: "architecture",
    note: "the rule still runs but can never be violated, in the change that breaks it",
    apply(dir) {
      edit(dir, ARCH_TEST, (text) => text.replace('resideInAnyPackage("org.springframework.web..", "jakarta.servlet..", "org.springframework.http..")', 'resideInAnyPackage("com.nowhere..")'));
      addWebImport(dir);
    },
  },
  {
    name: "jvm-lower-pit-threshold",
    expect: "red",
    stage: "mutation-code",
    note: "PIT's own pass mark is set to 0 in pom.xml, with untested code added",
    apply(dir) {
      edit(dir, "pom.xml", (text) => text.replace("<configuration>\n          <targetClasses>", "<configuration>\n          <mutationThreshold>0</mutationThreshold>\n          <targetClasses>"));
      addUntestedMethod(dir);
    },
  },
  {
    name: "jvm-weaken-pit-gate",
    expect: "red",
    stage: "mutation-code",
    note: "the script that applies PIT's pass mark is rewritten to pass, with untested code added",
    apply(dir) {
      writeFileSync(join(dir, "quality", "pit-gate.js"), 'console.log("pit-gate: weakened");\nprocess.exit(0);\n');
      addUntestedMethod(dir);
    },
  },
  {
    name: "jvm-narrow-pit-targets",
    expect: "red",
    stage: "mutation-code",
    note: "PIT's target classes are narrowed to something else, with untested code added",
    apply(dir) {
      edit(dir, "pom.xml", (text) => text.replace("<param>example.todo.TaskList</param>", "<param>example.todo.TodoApplication</param>"));
      addUntestedMethod(dir);
    },
  },
];

function prepareJvm() {
  const dir = mkdtempSync(join(tmpdir(), "touchstone-jvm-attack-"));
  cpSync(jvmFixture, dir, { recursive: true, filter: (source) => !/(^|\/)target(\/|$)/.test(source) });
  writeFileSync(join(dir, ".gitignore"), "target/\n");
  const git = (...args) => execFileSync("git", ["-c", "user.email=attacks@example.com", "-c", "user.name=Attacks", ...args], { cwd: dir, stdio: "pipe", encoding: "utf8" });
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  return [dir, git];
}

function runJvmSuite(only) {
  let wrong = 0;
  for (const attack of JVM_ATTACKS.filter((candidate) => !only || candidate.name === only)) {
    const [dir, git] = prepareJvm();
    attack.apply(dir);
    git("add", "-A");
    git("commit", "-q", "-m", attack.name);
    // CONTROL=no-restore shows what each attack does when protected files are not
    // put back. It is for checking that the protection is what stops them.
    if (process.env.CONTROL !== "no-restore") {
      spawnSync("node", [join(root, "ci", "restore-protected.js"), "--repo", dir, "--base", "HEAD~1"], { cwd: dir, encoding: "utf8" });
    }
    const failed = [];
    for (const gateName of ["architecture", "mutation-code"]) {
      const result = spawnSync("node", [join(root, "ci", "gates.js"), "run", gateName, "--base", "HEAD~1", "--repo", dir], { cwd: dir, encoding: "utf8" });
      if (result.status !== 0) {
        failed.push({ name: gateName, output: `${result.stdout}${result.stderr}` });
      }
    }
    const verdict = failed.length ? "red" : "green";
    const stageOk = !attack.stage || failed[0]?.name === attack.stage;
    const ok = verdict === attack.expect && stageOk;
    wrong += ok ? 0 : 1;
    console.log(`${ok ? "ok  " : "FAIL"} ${attack.name}: expected ${attack.expect}${attack.stage ? ` at ${attack.stage}` : ""}, got ${verdict}${failed.length ? ` (stopped by ${failed.map((stage) => stage.name).join(", ")})` : ""}  - ${attack.note}`);
    if (!ok) {
      for (const stage of failed) {
        console.log(`       ${stage.name}: ${stage.output.trim().split("\n").slice(-5).join("\n       ")}`);
      }
    }
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(wrong ? `\n${wrong} Java attack(s) got the wrong verdict` : "\nevery Java attack got the verdict it should");
  return wrong ? 1 : 0;
}

function main() {
  if (option("--suite") === "jvm") {
    return runJvmSuite(option("--only"));
  }
  if (process.argv.includes("--list")) {
    console.log(JSON.stringify(ATTACKS.map(({ name, expect, stage }) => ({ name, expect, stage: stage ?? "" }))));
    return 0;
  }
  if (process.argv.includes("--materialize")) {
    return materialize(resolve(option("--materialize")), option("--only"));
  }
  if (!existsSync(modules)) {
    console.error("attacks: run `npm ci --ignore-scripts` in examples/typescript-todo first");
    return 1;
  }
  const only = option("--only");
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
