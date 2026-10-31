Feature: Add a task

  Scenario: Add the first task
    Given the list has no tasks
    When the person types "Buy milk" and presses Add
    Then the words "Buy milk" appear on the list

  Scenario: Add a second task
    Given the list shows "Buy milk"
    When the person types "Walk the dog" and presses Add
    Then the list shows "Buy milk"
    And the list shows "Walk the dog"
