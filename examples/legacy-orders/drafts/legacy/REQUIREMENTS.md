# Requirements found in the existing system

These statements were written down by reading the code and checked by running them against the system as it is today. They describe what the system does now. They are not a statement of what the business wants until a person has approved them.

## Summary

| Kind | Count |
| --- | --- |
| Observed | 27 |
| Unclear, needs a person | 0 |
| Looks like a bug | 2 |
| Dead code | 0 |

## Orders

A customer places an order, pays for it, the shop ships it, and a paid order that has not shipped can be refunded.

**A placed order starts out as new**

_Observed: the code does this._

- When "alice" orders one item at 60.00
- Then the order is created
- And the order starts out as new

Where in the code: `src/orders.js:36-47`

**Orders are numbered one after another**

_Observed: the code does this._

- When "alice" places two orders
- Then the two orders have the numbers "A1001" and "A1002"

Where in the code: `src/orders.js:37`

**An order needs a customer**

_Observed: the code does this._

- When an order is placed with no customer
- Then the order is refused with the message "customer required"

Where in the code: `src/orders.js:22`

**An empty customer name counts as no customer**

_Observed: the code does this._

- When an order is placed with an empty customer name
- Then the order is refused with the message "customer required"

Where in the code: `src/orders.js:22`

**An order needs at least one item**

_Observed: the code does this._

- When "alice" places an order with no items
- Then the order is refused with the message "no items"

Where in the code: `src/orders.js:23`

**An order with no item list is treated like an order with no items**

_Observed: the code does this._

- When "alice" places an order with the item list missing
- Then the order is refused with the message "no items"

Where in the code: `src/orders.js:23`

**At most 20 of one item can be ordered**

_Observed: the code does this._

- When "alice" orders <qty> of an item at 1.00 each
- Then <outcome>

Examples:

    Examples:
    | qty | outcome |
    | 20 | the order is created |
    | 21 | the order is refused as too large with the message "too many of one item" |

Where in the code: `src/orders.js:28`

**An item with no quantity counts as one**

_Observed: the code does this._

- When "alice" orders an item with no quantity at 12.00
- Then the order subtotal is 12.00

Where in the code: `src/orders.js:27`

**An item ordered with a quantity of zero counts as one**

_Looks like a bug: the code does this, but the business may not want it._

- When "alice" orders 0 of an item at 12.00 each
- Then the order subtotal is 12.00

Where in the code: `src/orders.js:27`

**A negative price is refused**

_Observed: the code does this._

- When "alice" orders one item at a negative price
- Then the order is refused with the message "bad price"

Where in the code: `src/orders.js:29`

**An item with no price is accepted and the order total is not a number**

_Looks like a bug: the code does this, but the business may not want it._

- When "alice" orders an item with no price
- Then the order is created
- And the order total is not a number

Where in the code: `src/orders.js:29-30`

**The subtotal adds up every item at its quantity**

_Observed: the code does this._

- When "alice" orders one item at 10.00 and another item at 5.50
- Then the order subtotal is 15.50

Where in the code: `src/orders.js:24-31`

**Orders over 100.00 get 10% off**

_Observed: the code does this._

- When "alice" orders one item at <price>
- Then the discount is <discount>
- And the order total is <total>

Examples:

    Examples:
    | price | discount | total |
    | 100.00 | 0.00 | 100.00 |
    | 101.00 | 10.10 | 90.90 |
    | 200.00 | 20.00 | 180.00 |

Where in the code: `src/orders.js:33`

**Gold customers get another 5% off, whatever the size of the order**

_Observed: the code does this._

- When "<customer>" orders one item at <price>
- Then the discount is <discount>

Examples:

    Examples:
    | customer | price | discount |
    | gold-bob | 40.00 | 2.00 |
    | gold-bob | 100.00 | 5.00 |
    | gold-bob | 200.00 | 30.00 |
    | bob-gold | 40.00 | 0.00 |

Where in the code: `src/orders.js:34`

**Shipping is free from 50.00 of goods**

_Observed: the code does this._

- When "alice" orders one item at <price>
- Then shipping is <shipping>
- And the order total is <total>

Examples:

    Examples:
    | price | shipping | total |
    | 49.99 | 5.99 | 55.98 |
    | 50.00 | 0.00 | 50.00 |

Where in the code: `src/orders.js:35`

**Free shipping is judged before the discount comes off**

_Observed: the code does this._

- When "gold-bob" orders one item at 50.00
- Then shipping is 0.00
- And the order total is 47.50

Where in the code: `src/orders.js:32-43`

**A new order can be paid**

_Observed: the code does this._

- Given a new order totalling 100.00
- When the customer pays for the order
- Then the order is paid

Where in the code: `src/orders.js:50-55`

**An order cannot be paid twice**

_Observed: the code does this._

- Given a paid order totalling 100.00
- When the customer pays for the order
- Then the request is refused with the message "already paid or cancelled"
- And the order is still paid

Where in the code: `src/orders.js:53`

**A refunded order cannot be paid**

_Observed: the code does this._

- Given a paid order that has been refunded
- When the customer pays for the order
- Then the request is refused with the message "already paid or cancelled"
- And the order is still refunded

Where in the code: `src/orders.js:53`

**A paid order can be shipped**

_Observed: the code does this._

- Given a paid order totalling 100.00
- When the shop ships the order
- Then the order is shipped

Where in the code: `src/orders.js:58-63`

**An unpaid order cannot be shipped**

_Observed: the code does this._

- Given a new order totalling 100.00
- When the shop ships the order
- Then the request is refused with the message "must be paid first"
- And the order is still new

Where in the code: `src/orders.js:61`

**A shipped order cannot be shipped again**

_Observed: the code does this._

- Given a paid order that has shipped
- When the shop ships the order
- Then the request is refused with the message "must be paid first"
- And the order is still shipped

Where in the code: `src/orders.js:61`

**A refunded order cannot be shipped**

_Observed: the code does this._

- Given a paid order that has been refunded
- When the shop ships the order
- Then the request is refused with the message "must be paid first"
- And the order is still refunded

Where in the code: `src/orders.js:61`

**The refund fee depends on the reason**

_Observed: the code does this._

- Given a paid order totalling 100.00
- When the customer asks for a refund because "<reason>"
- Then they get back <refund>

Examples:

    Examples:
    | reason | refund |
    | damaged | 100.00 |
    | changed | 90.00 |
    |  | 90.00 |

Where in the code: `src/orders.js:71-73`

**The refund is rounded to the cent**

_Observed: the code does this._

- Given a paid order totalling 59.99
- When the customer asks for a refund because "changed"
- Then they get back 53.99

Where in the code: `src/orders.js:73`

**A shipped order cannot be refunded**

_Observed: the code does this._

- Given a paid order that has shipped
- When the customer asks for a refund
- Then the request is refused with the message "shipped orders cannot be refunded"
- And the order is still shipped

Where in the code: `src/orders.js:69`

**An unpaid order cannot be refunded**

_Observed: the code does this._

- Given a new order totalling 100.00
- When the customer asks for a refund
- Then the request is refused with the message "only paid orders can be refunded"
- And the order is still new

Where in the code: `src/orders.js:70`

**An order cannot be refunded twice**

_Observed: the code does this._

- Given a paid order that has been refunded
- When the customer asks for a refund
- Then the request is refused with the message "only paid orders can be refunded"

Where in the code: `src/orders.js:70`

**Paying, shipping or refunding an unknown order is not found**

_Observed: the code does this._

- When someone tries to <action> an order that does not exist
- Then the request is answered as not found

Examples:

    Examples:
    | action |
    | pay |
    | ship |
    | refund |

Where in the code: `src/orders.js:52`, `src/orders.js:60`, `src/orders.js:68`
