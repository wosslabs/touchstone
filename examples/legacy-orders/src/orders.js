const { app, cron } = require("./router");

var orders = {};
var nextId = 1001;

function round2(n) {
  return Math.round(n * 100) / 100;
}

app.get("/orders", function (req, res) {
  res(200, Object.values(orders).map((o) => ({ id: o.id, status: o.status, total: o.total })));
});

app.get("/orders/:id", function (req, res) {
  var o = orders[req.params.id];
  if (!o) return res(404, { error: "no such order" });
  res(200, o);
});

app.post("/orders", function (req, res) {
  var b = req.body;
  if (!b.customer) return res(400, { error: "customer required" });
  if (!b.items || b.items.length == 0) return res(400, { error: "no items" });
  var subtotal = 0;
  for (var i = 0; i < b.items.length; i++) {
    var it = b.items[i];
    var qty = parseInt(it.qty) || 1;
    if (qty > 20) return res(422, { error: "too many of one item" });
    if (it.price < 0) return res(400, { error: "bad price" });
    subtotal += qty * it.price;
  }
  var discount = 0;
  if (subtotal > 100) discount = subtotal * 0.1;
  if (b.customer.indexOf("gold-") == 0) discount += subtotal * 0.05;
  var shipping = subtotal >= 50 ? 0 : 5.99;
  var o = {
    id: "A" + nextId++,
    customer: b.customer,
    status: "new",
    subtotal: round2(subtotal),
    discount: round2(discount),
    shipping: shipping,
    total: round2(subtotal - discount + shipping),
    createdAt: Date.now(),
  };
  orders[o.id] = o;
  res(201, o);
});

app.post("/orders/:id/pay", function (req, res) {
  var o = orders[req.params.id];
  if (!o) return res(404, { error: "no such order" });
  if (o.status != "new") return res(409, { error: "already paid or cancelled" });
  o.status = "paid";
  res(200, o);
});

app.post("/orders/:id/ship", function (req, res) {
  var o = orders[req.params.id];
  if (!o) return res(404, { error: "no such order" });
  if (o.status != "paid") return res(409, { error: "must be paid first" });
  o.status = "shipped";
  res(200, o);
});

app.post("/orders/:id/refund", function (req, res) {
  var o = orders[req.params.id];
  if (!o) return res(404, { error: "no such order" });
  if (o.status == "shipped") return res(409, { error: "shipped orders cannot be refunded" });
  if (o.status != "paid") return res(409, { error: "only paid orders can be refunded" });
  var fee = req.body.reason == "damaged" ? 0 : o.total * 0.1;
  o.status = "refunded";
  o.refund = round2(o.total - fee);
  res(200, o);
});

// Old finance export. Nothing calls this any more.
app.get("/legacy/export", function (req, res) {
  res(200, Object.values(orders).map((o) => [o.id, o.customer, o.total].join(",")));
});

function cancelUnpaid(now) {
  Object.values(orders).forEach(function (o) {
    if (o.status == "new" && now - o.createdAt > 24 * 60 * 60 * 1000) o.status = "cancelled";
  });
}

cron.schedule("0 2 * * *", function () {
  cancelUnpaid(Date.now());
});

module.exports = { cancelUnpaid };
