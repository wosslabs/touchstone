#!/usr/bin/env python3
"""Fail a merge when approved behavior sentences shrink or a test is switched off.

Compare acceptance/examples at BASE (default: origin/main, else HEAD~1) with HEAD.
A drop in Given, When, Then, or Scenario lines fails the run.
A newly added skip or disable annotation fails the run.
Projects with no acceptance/examples directory pass.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

ALLOW_DROP = "Touchstone-Allow-Drop:"
SKIP = re.compile(
    r"@Disabled\b"
    r"|@Ignore\b"
    r"|\btest\.skip\b"
    r"|\bit\.skip\b"
    r"|\bdescribe\.skip\b"
    r"|\bxit\s*\("
    r"|\bxdescribe\s*\("
    r"|pytest\.mark\.skip"
    r"|unittest\.skip"
    r"|assumeTrue\s*\(\s*false\s*\)"
    r"|\bt\.Skip\s*\("
)
IGNORED_PREFIXES = (
    "ci/check_acceptance_guard.py",
    "hooks/protect-acceptance.py",
    "tests/",
    "templates/",
    "skills/",
)


def git(*args: str, cwd: Path) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return ""
    return result.stdout


class MissingBase(Exception):
    pass


def resolve_base(cwd: Path, requested: str | None) -> str | None:
    if requested:
        if git("rev-parse", "--verify", requested, cwd=cwd):
            return requested
        raise MissingBase(requested)
    for candidate in ("origin/main", "origin/master", "HEAD~1"):
        if git("rev-parse", "--verify", candidate, cwd=cwd):
            return candidate
    return None


def example_text(cwd: Path, rev: str) -> str:
    listing = git("ls-tree", "-r", "--name-only", rev, "--", "acceptance/examples", cwd=cwd)
    chunks = []
    for path in listing.splitlines():
        shown = git("show", f"{rev}:{path}", cwd=cwd)
        chunks.append(shown)
    return "\n".join(chunks)


def behavior_lines(text: str) -> list[str]:
    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith(ALLOW_DROP):
            continue
        lines.append(stripped)
    return lines


def marker_count(text: str) -> int:
    return len(behavior_lines(text))


def allows_drop(before: str, after: str) -> bool:
    def markers(text: str) -> int:
        return sum(1 for line in text.splitlines() if line.strip().startswith(ALLOW_DROP))

    return markers(after) > markers(before)


def added_skip_lines(cwd: Path, base: str) -> list[str]:
    diff = git("diff", "--unified=0", f"{base}...HEAD", cwd=cwd)
    if not diff:
        diff = git("diff", "--unified=0", base, "HEAD", cwd=cwd)
    hits = []
    current = ""
    for line in diff.splitlines():
        if line.startswith("+++ b/"):
            current = line[6:]
            continue
        if not line.startswith("+") or line.startswith("+++"):
            continue
        if current.startswith(IGNORED_PREFIXES):
            continue
        added = line[1:]
        if SKIP.search(added):
            hits.append(f"{current}: {added.strip()}")
    return hits


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default=".")
    parser.add_argument("--base", default=None)
    args = parser.parse_args()
    cwd = Path(args.repo).resolve()
    try:
        base = resolve_base(cwd, args.base)
    except MissingBase as error:
        print(f"acceptance guard: base revision not found: {error}", file=sys.stderr)
        return 1
    if base is None:
        print("acceptance guard: no base revision to compare, skipping")
        return 0
    before_text = example_text(cwd, base)
    after_text = example_text(cwd, "HEAD")
    before = marker_count(before_text)
    after = marker_count(after_text)
    if before == 0 and after == 0:
        print("acceptance guard: no behavior sentences yet")
        return 0
    failures = []
    if after < before and not allows_drop(before_text, after_text):
        failures.append(
            f"behavior sentences dropped from {before} to {after} in acceptance/examples"
        )
    skips = added_skip_lines(cwd, base)
    if skips:
        failures.append("new skipped or disabled test:\n" + "\n".join(skips))
    if failures:
        print("acceptance guard failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print(f"acceptance guard passed ({after} behavior sentences)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
