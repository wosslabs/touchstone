import json
import urllib.request

from behave import given, then, when


# Acceptance steps talk to the running service over HTTP only.
def _add(context, title):
    request = urllib.request.Request(
        context.base,
        data=json.dumps({"title": title}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request) as response:
        assert response.status == 201, f"expected 201, got {response.status}"


def _titles(context):
    with urllib.request.urlopen(context.base) as response:
        assert response.status == 200, f"expected 200, got {response.status}"
        return json.loads(response.read())


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
