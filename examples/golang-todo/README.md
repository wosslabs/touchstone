# Go todo

[godog](https://github.com/cucumber/godog) steps over HTTP (`httptest`). Steps are in `features/acceptance_test.go` next to the `.feature` file.

```
go test ./tasks/...        # unit tests
go test ./features/...     # scenarios
npx @wosslabs/touchstone check
```

When `TOUCHSTONE_MESSAGES` is set, `features/acceptance_test.go` also writes a Cucumber JSON report there, so the red check can tell an assertion failure from a broken test. godog runs each scenario as a subtest named with underscores, which is how the red command selects one:

```yaml
- uses: actions/setup-go@v5
  with:
    go-version: "1.23"
- uses: wosslabs/touchstone@v0
  with:
    base: ${{ github.event.pull_request.base.sha }}
    command: go test ./features/...
    red-command: go test ./features/ -run "TestFeatures/^$(printf '%s' "$TOUCHSTONE_SCENARIO_TITLE" | tr ' ' _)\$"
```
