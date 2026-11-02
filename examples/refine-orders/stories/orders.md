# Orders

  Scenario: A bulk line gets ten percent off
    When a customer orders 10 items at 5.00
    Then the order total is 45.00

  Scenario: A small line has no discount
    When a customer orders 2 items at 5.00
    Then the order total is 10.00

  Scenario: An order needs a customer
    When an order is placed with no customer
    Then it is refused with "customer required"

  Scenario: The receipt shows the total with a thousands separator
    When a customer orders 1 items at 1234.50
    Then the receipt total reads "$1,234.50"
