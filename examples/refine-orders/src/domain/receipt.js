import { lineTotal } from "./pricing.js";

export function renderReceipt(order) {
  const rows = [];
  for (const line of order.lines) {
    const amount = lineTotal(line.price, line.qty);
    let text = String(Math.abs(amount).toFixed(2));
    const [whole, cents] = text.split(".");
    let grouped = "";
    for (let i = 0; i < whole.length; i += 1) {
      if (i > 0 && (whole.length - i) % 3 === 0) {
        grouped += ",";
      }
      grouped += whole[i];
    }
    text = `${amount < 0 ? "-" : ""}$${grouped}.${cents}`;
    rows.push(`${line.name} x${line.qty}  ${text}`);
  }
  let totalText = String(Math.abs(order.total).toFixed(2));
  const [totalWhole, totalCents] = totalText.split(".");
  let totalGrouped = "";
  for (let i = 0; i < totalWhole.length; i += 1) {
    if (i > 0 && (totalWhole.length - i) % 3 === 0) {
      totalGrouped += ",";
    }
    totalGrouped += totalWhole[i];
  }
  totalText = `${order.total < 0 ? "-" : ""}$${totalGrouped}.${totalCents}`;
  rows.push(`Total  ${totalText}`);
  return rows.join("\n");
}
