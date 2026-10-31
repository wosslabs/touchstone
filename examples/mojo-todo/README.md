# Mojo todo

Mojo has no Cucumber runner. The application is a Mojo command line program (`todo add <title>`, `todo list`). [behave](https://behave.readthedocs.io/) in Python runs the scenarios and drives the compiled binary as a black box, so the acceptance layer knows nothing about Mojo internals. Checked with Mojo 1.2.0, where `fn` is gone (`def`) and the standard library lives under `std.`.

```
mojo build src/todo.mojo -o build/todo
mojo run -I src tests/test_tasks.mojo    # unit tests
uv run --group dev behave                # scenarios in features/
npx @wosslabs/touchstone check
```

Install Mojo with `pixi exec -c https://conda.modular.com/max -c conda-forge -s mojo -- mojo ...` or a pixi project. behave cannot write Cucumber messages, so the red check accepts any failing run (`red-reason-unchecked`):

```yaml
- uses: prefix-dev/setup-pixi@v0.8.1
  with:
    run-install: false
    cache: false
- uses: astral-sh/setup-uv@v5
- uses: wosslabs/touchstone@v1
  with:
    base: ${{ github.event.pull_request.base.sha }}
    command: pixi exec -c https://conda.modular.com/max -c conda-forge -s mojo -- mojo build src/todo.mojo -o build/todo && uv run --group dev behave
    red-command: pixi exec -c https://conda.modular.com/max -c conda-forge -s mojo -- mojo build src/todo.mojo -o build/todo && uv run --group dev behave --name "$TOUCHSTONE_SCENARIO"
    red-reason-unchecked: "true"
```
