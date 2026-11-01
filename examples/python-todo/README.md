# Python todo

[behave](https://behave.readthedocs.io/) steps over HTTP against `http.server`. Standard library only in the application.

```
uv run --group dev python -m unittest discover -s tests   # unit tests
uv run --group dev behave                                  # scenarios in features/
npx @wosslabs/touchstone check
```

behave writes a Cucumber-style JSON report, so the red check can tell an assertion failure from a broken test:

```yaml
- uses: astral-sh/setup-uv@v5
- uses: wosslabs/touchstone@v0
  with:
    base: ${{ github.event.pull_request.base.sha }}
    command: uv run --group dev behave
    red-command: uv run --group dev behave --name "$TOUCHSTONE_SCENARIO" -f json -o "$TOUCHSTONE_MESSAGES" -f pretty
```
