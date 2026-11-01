Feature: Orders
  A customer places an order, pays for it, the shop ships it, and a paid order that has not shipped can be refunded.

  @evidence:src/orders.js:36-47
  Scenario: A placed order starts out as new
    When "alice" orders one item at 60.00
    Then the order is created
    And the order starts out as new

  @evidence:src/orders.js:37
  Scenario: Orders are numbered one after another
    When "alice" places two orders
    Then the two orders have the numbers "A1001" and "A1002"

  @evidence:src/orders.js:22
  Scenario: An order needs a customer
    When an order is placed with no customer
    Then the order is refused with the message "customer required"

  @evidence:src/orders.js:22
  Scenario: An empty customer name counts as no customer
    When an order is placed with an empty customer name
    Then the order is refused with the message "customer required"

  @evidence:src/orders.js:23
  Scenario: An order needs at least one item
    When "alice" places an order with no items
    Then the order is refused with the message "no items"

  @evidence:src/orders.js:23
  Scenario: An order with no item list is treated like an order with no items
    When "alice" places an order with the item list missing
    Then the order is refused with the message "no items"

  @evidence:src/orders.js:28
  Scenario Outline: At most 20 of one item can be ordered
    When "alice" orders <qty> of an item at 1.00 each
    Then <outcome>

    Examples:
      | qty | outcome                                                                 |
      | 20  | the order is created                                                    |
      | 21  | the order is refused as too large with the message "too many of one item" |

  @evidence:src/orders.js:27
  Scenario: An item with no quantity counts as one
    When "alice" orders an item with no quantity at 12.00
    Then the order subtotal is 12.00

  @suspected-bug
  @evidence:src/orders.js:27
  Scenario: An item ordered with a quantity of zero counts as one
    When "alice" orders 0 of an item at 12.00 each
    Then the order subtotal is 12.00

  @evidence:src/orders.js:29
  Scenario: A negative price is refused
    When "alice" orders one item at a negative price
    Then the order is refused with the message "bad price"

  @suspected-bug
  @evidence:src/orders.js:29-30
  Scenario: An item with no price is accepted and the order total is not a number
    When "alice" orders an item with no price
    Then the order is created
    And the order total is not a number

  @evidence:src/orders.js:24-31
  Scenario: The subtotal adds up every item at its quantity
    When "alice" orders one item at 10.00 and another item at 5.50
    Then the order subtotal is 15.50

  @evidence:src/orders.js:33
  Scenario Outline: Orders over 100.00 get 10% off
    When "alice" orders one item at <price>
    Then the discount is <discount>
    And the order total is <total>

    Examples:
      | price  | discount | total  |
      | 100.00 | 0.00     | 100.00 |
      | 101.00 | 10.10    | 90.90  |
      | 200.00 | 20.00    | 180.00 |

  @evidence:src/orders.js:34
  Scenario Outline: Gold customers get another 5% off, whatever the size of the order
    When "<customer>" orders one item at <price>
    Then the discount is <discount>

    Examples:
      | customer | price  | discount |
      | gold-bob | 40.00  | 2.00     |
      | gold-bob | 100.00 | 5.00     |
      | gold-bob | 200.00 | 30.00    |
      | bob-gold | 40.00  | 0.00     |

  @evidence:src/orders.js:35
  Scenario Outline: Shipping is free from 50.00 of goods
    When "alice" orders one item at <price>
    Then shipping is <shipping>
    And the order total is <total>

    Examples:
      | price | shipping | total |
      | 49.99 | 5.99     | 55.98 |
      | 50.00 | 0.00     | 50.00 |

  @evidence:src/orders.js:32-43
  Scenario: Free shipping is judged before the discount comes off
    When "gold-bob" orders one item at 50.00
    Then shipping is 0.00
    And the order total is 47.50

  @evidence:src/orders.js:50-55
  Scenario: A new order can be paid
    Given a new order totalling 100.00
    When the customer pays for the order
    Then the order is paid

  @evidence:src/orders.js:53
  Scenario: An order cannot be paid twice
    Given a paid order totalling 100.00
    When the customer pays for the order
    Then the request is refused with the message "already paid or cancelled"
    And the order is still paid

  @evidence:src/orders.js:53
  Scenario: A refunded order cannot be paid
    Given a paid order that has been refunded
    When the customer pays for the order
    Then the request is refused with the message "already paid or cancelled"
    And the order is still refunded

  @evidence:src/orders.js:58-63
  Scenario: A paid order can be shipped
    Given a paid order totalling 100.00
    When the shop ships the order
    Then the order is shipped

  @evidence:src/orders.js:61
  Scenario: An unpaid order cannot be shipped
    Given a new order totalling 100.00
    When the shop ships the order
    Then the request is refused with the message "must be paid first"
    And the order is still new

  @evidence:src/orders.js:61
  Scenario: A shipped order cannot be shipped again
    Given a paid order that has shipped
    When the shop ships the order
    Then the request is refused with the message "must be paid first"
    And the order is still shipped

  @evidence:src/orders.js:61
  Scenario: A refunded order cannot be shipped
    Given a paid order that has been refunded
    When the shop ships the order
    Then the request is refused with the message "must be paid first"
    And the order is still refunded

  @evidence:src/orders.js:71-73
  Scenario Outline: The refund fee depends on the reason
    Given a paid order totalling 100.00
    When the customer asks for a refund because "<reason>"
    Then they get back <refund>

    Examples:
      | reason  | refund |
      | damaged | 100.00 |
      | changed | 90.00  |
      |         | 90.00  |

  @evidence:src/orders.js:73
  Scenario: The refund is rounded to the cent
    Given a paid order totalling 59.99
    When the customer asks for a refund because "changed"
    Then they get back 53.99

  @evidence:src/orders.js:69
  Scenario: A shipped order cannot be refunded
    Given a paid order that has shipped
    When the customer asks for a refund
    Then the request is refused with the message "shipped orders cannot be refunded"
    And the order is still shipped

  @evidence:src/orders.js:70
  Scenario: An unpaid order cannot be refunded
    Given a new order totalling 100.00
    When the customer asks for a refund
    Then the request is refused with the message "only paid orders can be refunded"
    And the order is still new

  @evidence:src/orders.js:70
  Scenario: An order cannot be refunded twice
    Given a paid order that has been refunded
    When the customer asks for a refund
    Then the request is refused with the message "only paid orders can be refunded"

  @evidence:src/orders.js:52
  @evidence:src/orders.js:60
  @evidence:src/orders.js:68
  Scenario Outline: Paying, shipping or refunding an unknown order is not found
    When someone tries to <action> an order that does not exist
    Then the request is answered as not found

    Examples:
      | action |
      | pay    |
      | ship   |
      | refund |
