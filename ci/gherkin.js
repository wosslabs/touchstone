import { AstBuilder, GherkinClassicTokenMatcher, Parser } from "@cucumber/gherkin";
import { IdGenerator } from "@cucumber/messages";

const FIRST_GHERKIN_LINE = /^\s*(?:@|Background:|Rule:|Scenario:|Scenario Outline:|Scenario Template:|Example:)/;

// Approved stories are Markdown: a heading and prose, then Gherkin scenarios.
// Everything before the first Gherkin line is dropped, code fences are removed,
// and the rest is parsed as a feature.
function markdownToGherkin(text) {
  const lines = text.split("\n").filter((line) => !line.trim().startsWith("```"));
  const first = lines.findIndex((line) => FIRST_GHERKIN_LINE.test(line));
  if (first === -1) {
    return "Feature: story\n";
  }
  return `Feature: story\n${lines.slice(first).join("\n")}\n`;
}

function row(cells) {
  return `| ${cells.map((cell) => cell.value.trim()).join(" | ")} |`;
}

function stepLines(step) {
  const lines = [`${step.keyword.trim()} ${step.text.trim()}`];
  if (step.dataTable) {
    lines.push(...step.dataTable.rows.map((tableRow) => row(tableRow.cells)));
  }
  if (step.docString) {
    lines.push('"""', ...step.docString.content.split("\n").map((line) => `  ${line.trim()}`), '"""');
  }
  return lines;
}

function tagLines(tags) {
  return tags.map((tag) => tag.name);
}

function examplesLines(examples) {
  const lines = [...tagLines(examples.tags), `${examples.keyword.trim()}:`];
  if (examples.tableHeader) {
    lines.push(row(examples.tableHeader.cells));
  }
  lines.push(...examples.tableBody.map((tableRow) => row(tableRow.cells)));
  return lines;
}

function scenarioEntry(scenario, backgroundSteps, inheritedTags) {
  const steps = [
    ...inheritedTags,
    ...tagLines(scenario.tags),
    ...backgroundSteps.flatMap(stepLines),
    ...scenario.steps.flatMap(stepLines),
    ...scenario.examples.flatMap(examplesLines),
  ];
  return [scenario.name.trim(), steps, scenario.location.line];
}

function collect(children, backgroundSteps, inheritedTags, found) {
  let background = backgroundSteps;
  for (const child of children) {
    if (child.background) {
      background = [...backgroundSteps, ...child.background.steps];
    } else if (child.scenario) {
      found.push(scenarioEntry(child.scenario, background, inheritedTags));
    } else if (child.rule) {
      collect(child.rule.children, background, [...inheritedTags, ...tagLines(child.rule.tags)], found);
    }
  }
}

// Returns [title, canonical lines, line] for each scenario. Throws when the
// text is not valid Gherkin. Background steps, tags, data tables, doc strings
// and Examples are part of the canonical lines, so any change shows up.
export function scenariosIn(text, { markdown = false } = {}) {
  const source = markdown ? markdownToGherkin(text) : text;
  const parser = new Parser(new AstBuilder(IdGenerator.uuid()), new GherkinClassicTokenMatcher());
  const document = parser.parse(source);
  const found = [];
  if (document.feature) {
    collect(document.feature.children, [], tagLines(document.feature.tags), found);
  }
  return found;
}

// Returns [{ title, tags, line }] for each scenario. Tags include those of the
// feature and of the enclosing rule, so a tag on the Feature line applies to
// every scenario below it.
export function scenarioTagsIn(text) {
  const parser = new Parser(new AstBuilder(IdGenerator.uuid()), new GherkinClassicTokenMatcher());
  const document = parser.parse(text);
  const found = [];
  const visit = (children, inherited) => {
    for (const child of children) {
      if (child.scenario) {
        found.push({
          title: child.scenario.name.trim(),
          tags: [...inherited, ...tagLines(child.scenario.tags)],
          line: child.scenario.location.line,
        });
      } else if (child.rule) {
        visit(child.rule.children, [...inherited, ...tagLines(child.rule.tags)]);
      }
    }
  };
  if (document.feature) {
    visit(document.feature.children, tagLines(document.feature.tags));
  }
  return found;
}

function plainStep(step) {
  const lines = [`${step.keyword.trim()} ${step.text.trim()}`];
  if (step.dataTable) {
    lines.push(...step.dataTable.rows.map((tableRow) => row(tableRow.cells)));
  }
  return lines;
}

// Returns the readable shape of a feature file: its name, description, and the
// scenarios with their tags and steps. Background steps are kept separately.
export function featureOutline(text) {
  const parser = new Parser(new AstBuilder(IdGenerator.uuid()), new GherkinClassicTokenMatcher());
  const document = parser.parse(text);
  const feature = document.feature;
  if (!feature) {
    return null;
  }
  const outline = {
    name: feature.name.trim(),
    description: (feature.description || "").split("\n").map((line) => line.trim()).filter(Boolean).join(" "),
    tags: tagLines(feature.tags),
    background: [],
    scenarios: [],
  };
  const visit = (children, rule) => {
    for (const child of children) {
      if (child.background) {
        outline.background.push(...child.background.steps.flatMap(plainStep));
      } else if (child.scenario) {
        outline.scenarios.push({
          title: child.scenario.name.trim(),
          rule,
          tags: [...outline.tags, ...tagLines(child.scenario.tags)],
          steps: child.scenario.steps.flatMap(plainStep),
          examples: child.scenario.examples.flatMap(examplesLines),
          line: child.scenario.location.line,
        });
      } else if (child.rule) {
        visit(child.rule.children, child.rule.name.trim());
      }
    }
  };
  visit(feature.children, "");
  return outline;
}
