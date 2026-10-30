---
name: using-touchstone
description: Use when a session starts, or when the user asks to build, change, or fix behavior, before any other workflow skill plans or writes code.
---

# Using Touchstone

Touchstone is installed on its own. You do not need another workflow plugin.

On a feature, bugfix, or behavior change, read and follow the touchstone skill before any plan, design document, or production code. Another installed skill may tell you to plan immediately. The approved sentence still comes first, and it still has to fail for the missing behavior before that plan.

A question, a lookup, or a refactor that keeps the current sentences true does not need a new sentence. For a refactor, follow the touchstone skill's refactor rule: leave `acceptance/examples/` alone.

When the person has agreed the failure is the missing behavior, follow the touchstone-build skill for the design, the unit tests, and the pull request.
