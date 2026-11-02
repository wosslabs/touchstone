import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// The README is a short front page and the detail lives in docs/. Every relative
// link and every #anchor in them must resolve, so a moved section cannot leave a
// dead link behind.
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pages = ["README.md", ...readdirSync(join(root, "docs")).filter((name) => name.endsWith(".md")).map((name) => join("docs", name))];

function slugify(title) {
  return title.trim().toLowerCase().replace(/[^\p{L}\p{N}_\- ]/gu, "").replaceAll(" ", "-");
}

function headings(text) {
  const found = new Set();
  let fenced = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("```")) {
      fenced = !fenced;
    }
    const match = !fenced && /^#{1,6} (.+)$/.exec(line);
    if (match) {
      found.add(slugify(match[1]));
    }
  }
  return found;
}

function links(text) {
  const found = [];
  let fenced = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("```")) {
      fenced = !fenced;
    }
    if (!fenced) {
      for (const match of line.matchAll(/\]\(([^)\s]+)\)/g)) {
        found.push(match[1]);
      }
    }
  }
  return found;
}

test("every relative link and anchor in the README and docs resolves", () => {
  const problems = [];
  for (const page of pages) {
    const text = readFileSync(join(root, page), "utf8");
    for (const link of links(text)) {
      if (/^(https?:|mailto:)/.test(link)) {
        continue;
      }
      const [path, anchor] = link.split("#");
      const target = path ? resolve(root, dirname(page), path) : join(root, page);
      if (!existsSync(target)) {
        problems.push(`${page}: ${link} points at a file that does not exist`);
        continue;
      }
      if (anchor && target.endsWith(".md") && !headings(readFileSync(target, "utf8")).has(anchor)) {
        problems.push(`${page}: ${link} points at a heading that does not exist`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

test("the README stays a front page", () => {
  const words = readFileSync(join(root, "README.md"), "utf8").split(/\s+/).length;
  assert.ok(words < 2000, `the README has ${words} words. Put detail in docs/ and link to it.`);
});

test("every docs page links back to the README", () => {
  for (const page of pages.filter((name) => name.startsWith("docs/") && !name.endsWith("README.md"))) {
    assert.match(readFileSync(join(root, page), "utf8"), /\]\(\.\.\/README\.md\)/, `${page} has no link back`);
  }
});
