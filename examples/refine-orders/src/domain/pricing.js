export function lineTotal(price, qty) {
  return Math.round(price * qty * 100) / 100;
}

export function bulkDiscount(qty) {
  if (qty >= 10) {
    return 0.1;
  }
  return 0;
}

export function orderTotal(lines) {
  let total = 0;
  for (const line of lines) {
    const gross = lineTotal(line.price, line.qty);
    total += gross - gross * bulkDiscount(line.qty);
  }
  return Math.round(total * 100) / 100;
}
