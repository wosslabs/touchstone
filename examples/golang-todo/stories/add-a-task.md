# Add a task

Scenario: Add the first task
Given the list has no tasks
When the person adds "Buy milk"
Then the list shows "Buy milk"

Scenario: Add a second task
Given the list already has "Buy milk"
When the person adds "Walk the dog"
Then the list shows "Buy milk"
And the list shows "Walk the dog"
