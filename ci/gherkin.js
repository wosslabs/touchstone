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
