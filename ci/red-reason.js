// Reads test results and decides whether a scenario failed because the behavior
// is missing (a valid red) or because the test or its environment is broken.
//
// Two formats are understood:
//   - Cucumber messages (ndjson): cucumber-js, Cucumber-JVM, Cucumber Ruby
//   - Cucumber JSON reports: godog, behave, cucumber-rs (a JSON array of features)

const PROGRAMMING_ERROR = new RegExp(
  [
    "ReferenceError",
    "TypeError",
    "SyntaxError",
    "NoSuchMethod(?:Error|Exception)",
    "NoSuchField(?:Error|Exception)",
    "ClassNotFoundException",
    "NoClassDefFoundError",
    "LinkageError",
    "cannot find symbol",
    "compilation (?:error|failure)",
    "ModuleNotFoundError",
    "ImportError",
    "AttributeError",
    "NameError",
    "ECONNREFUSED",
    "Connection refused",
    "ConnectException",
    "is not a function",
    "Cannot read propert",
    "undefined reference",
    "panicked at .*(?:index out of bounds|unwrap\\(\\) on a `None`)",
  ].join("|"),
  "i",
);

const KEYWORD_TYPES = { given: "Context", when: "Action", then: "Outcome" };

function statusOf(value) {
  return String(value || "").toUpperCase();
}

function messageText(value) {
  return Array.isArray(value) ? value.join("\n") : String(value || "");
}

function parseMessages(text) {
  const pickles = new Map();
  const testCases = [];
  const results = new Map();
  for (const line of text.split("\n")) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    if (message.pickle) {
      pickles.set(message.pickle.id, message.pickle);
    }
    if (message.testCase) {
      testCases.push(message.testCase);
    }
    if (message.testStepFinished) {
      const result = message.testStepFinished.testStepResult || {};
      results.set(message.testStepFinished.testStepId, {
        status: statusOf(result.status),
        error: [result.exception?.type, result.exception?.message, result.message].filter(Boolean).join(" "),
      });
    }
  }
  return testCases.map((testCase) => {
    const pickle = pickles.get(testCase.pickleId);
    const types = new Map((pickle?.steps || []).map((step) => [step.id, step.type]));
    const steps = testCase.testSteps
      .filter((step) => results.has(step.id))
      .map((step) => ({ type: types.get(step.pickleStepId) || "Hook", ...results.get(step.id) }));
    return { name: pickle?.name ?? "", steps };
  });
}

function stepsOf(element, background) {
  const steps = [];
  let current = "Context";
  const add = (raw, fixedType) => {
    const keyword = String(raw.keyword || "").trim().toLowerCase();
    const type = fixedType || KEYWORD_TYPES[String(raw.step_type || keyword).toLowerCase()];
    if (type) {
      current = type;
    }
    const result = raw.result || {};
    steps.push({ type: fixedType || current, status: statusOf(result.status), error: messageText(result.error_message) });
  };
  for (const hook of element.before || []) {
    add({ result: hook.result }, "Hook");
  }
  for (const raw of [...background, ...(element.steps || [])]) {
    add(raw);
  }
  for (const hook of element.after || []) {
    add({ result: hook.result }, "Hook");
  }
  return steps;
}

function parseReport(text) {
  const cases = [];
  for (const feature of JSON.parse(text)) {
    let background = [];
    for (const element of feature.elements || []) {
      if (element.type === "background") {
        background = element.steps || [];
      } else {
        cases.push({ name: element.name ?? "", steps: stepsOf(element, background) });
      }
    }
  }
  return cases;
}

// Returns [{ name, steps: [{ type, status, error }] }] for either format.
export function parseCases(text) {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("[")) {
    return parseReport(trimmed);
  }
  return parseMessages(text);
}

// Returns why a scenario's run is not a valid red, or "" when it is.
// Valid: a When or Then step fails with an assertion-style error (a missing
// element, a 404, a wrong value), and nothing is undefined, pending, ambiguous,
// or broken by a programming error.
export function classifyCase({ steps }) {
  const broken = steps.find((step) => ["UNDEFINED", "PENDING", "AMBIGUOUS"].includes(step.status));
  if (broken) {
    return `a step is ${broken.status.toLowerCase()}: that is a programming error, not missing behavior`;
  }
  const failed = steps.filter((step) => step.status === "FAILED");
  if (failed.length === 0) {
    return "no step failed";
  }
  for (const step of failed) {
    if (step.type !== "Action" && step.type !== "Outcome") {
      return "a Given or hook step failed: the system could not reach the starting state, which is a setup error, not missing behavior";
    }
    if (PROGRAMMING_ERROR.test(step.error)) {
      return `a step failed with a programming or environment error, not missing behavior: ${step.error.split("\n")[0].slice(0, 160)}`;
    }
  }
  return "";
}

// Judges a run of a mutated scenario: "killed" when an assertion-style failure
// shows the scenario noticed the change, "invalid" when the run only broke
// (undefined step, programming error, failing hook, nothing ran), and
// "survived" when every matching scenario still passed.
export function mutantOutcome(cases) {
  if (cases.length === 0) {
    return "invalid";
  }
  let broken = false;
  for (const { steps } of cases) {
    for (const step of steps) {
      if (["UNDEFINED", "PENDING", "AMBIGUOUS"].includes(step.status)) {
        broken = true;
      } else if (step.status === "FAILED") {
        if (step.type === "Hook" || PROGRAMMING_ERROR.test(step.error)) {
          broken = true;
        } else {
          return "killed";
        }
      }
    }
  }
  return broken ? "invalid" : "survived";
}
