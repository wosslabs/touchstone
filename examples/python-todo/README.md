# Python todo

[behave](https://behave.readthedocs.io/) steps over HTTP against `http.server`. Standard library only in the application.

```
uv run --group dev python -m unittest discover -s tests   # unit tests
uv run --group dev behave                                  # scenarios in features/
npx @wosslabs/touchstone check
```

behave cannot write Cucumber messages, so the red check cannot read the failure reason. It accepts any failing run and skips the green run (`red-reason-unchecked`):

```yaml
- uses: astral-sh/setup-uv@v5
- uses: wosslabs/touchstone@v1
  with:
    base: ${{ github.event.pull_request.base.sha }}
    command: uv run --group dev behave
    red-command: uv run --group dev behave --name "$TOUCHSTONE_SCENARIO"
    red-reason-unchecked: "true"
```
