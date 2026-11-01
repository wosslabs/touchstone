# Mojo todo

Mojo has no Cucumber runner. The application is a Mojo command line program (`todo add <title>`, `todo list`). [behave](https://behave.readthedocs.io/) in Python runs the scenarios and drives the compiled binary as a black box, so the acceptance layer knows nothing about Mojo internals. Checked with Mojo 1.2.0, where `fn` is gone (`def`) and the standard library lives under `std.`.

```
mkdir -p build && mojo build src/todo.mojo -o build/todo
mojo run -I src tests/test_tasks.mojo    # unit tests
uv run --group dev behave                # scenarios in features/
npx @wosslabs/touchstone check
```

Install Mojo with `pixi exec -c https://conda.modular.com/max -c conda-forge -s mojo -- mojo ...` or a pixi project. behave writes a Cucumber-style JSON report, so the red check can tell an assertion failure from a broken test (this red command is not yet run end to end):

```yaml
- uses: prefix-dev/setup-pixi@v0.8.1
  with:
    run-install: false
    cache: false
- uses: astral-sh/setup-uv@v5
- uses: wosslabs/touchstone@v0
  with:
    base: ${{ github.event.pull_request.base.sha }}
    command: mkdir -p build && pixi exec -c https://conda.modular.com/max -c conda-forge -s mojo -- mojo build src/todo.mojo -o build/todo && uv run --group dev behave
    red-command: mkdir -p build && pixi exec -c https://conda.modular.com/max -c conda-forge -s mojo -- mojo build src/todo.mojo -o build/todo && uv run --group dev behave --name "$TOUCHSTONE_SCENARIO" -f json -o "$TOUCHSTONE_MESSAGES" -f pretty
```
