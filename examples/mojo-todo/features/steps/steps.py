import os
import subprocess

from behave import given, then, when


# Acceptance steps run the compiled Mojo program and read what it prints.
def _todo(context, *arguments):
    return subprocess.run(
        [context.binary, *arguments],
        env={**os.environ, "TODO_FILE": context.todo_file},
        capture_output=True,
        text=True,
    )


def _add(context, title):
    result = _todo(context, "add", title)
    assert result.returncode == 0, f"add failed: {result.stderr.strip()}"


def _titles(context):
    result = _todo(context, "list")
    assert result.returncode == 0, f"list failed: {result.stderr.strip()}"
    return result.stdout.splitlines()


@given("the list has no tasks")
def _(context):
    assert _titles(context) == []


@given('the list already has "{title}"')
def _(context, title):
    _add(context, title)
    assert title in _titles(context)


@when('the person adds "{title}"')
def _(context, title):
    _add(context, title)


@then('the list shows "{title}"')
def _(context, title):
    assert title in _titles(context), f'Expected the list to show "{title}"'
