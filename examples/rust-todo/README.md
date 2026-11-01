# Rust todo

[cucumber-rs](https://github.com/cucumber-rs/cucumber) steps over HTTP (`ureq`) against a `tiny_http` server. The acceptance target is `features/acceptance.rs` (`harness = false`).

```
cargo test --lib                      # unit tests
cargo test --test acceptance          # scenarios
npx @wosslabs/touchstone check
```

When `TOUCHSTONE_MESSAGES` is set, `features/acceptance.rs` also writes a Cucumber JSON report there (the `output-json` feature of the `cucumber` crate), so the red check can tell an assertion failure from a broken test. `--name` takes a regex:

```yaml
- uses: dtolnay/rust-toolchain@stable
- uses: wosslabs/touchstone@v0
  with:
    base: ${{ github.event.pull_request.base.sha }}
    command: cargo test --test acceptance
    red-command: cargo test --test acceptance -- --name "$TOUCHSTONE_SCENARIO"
```
