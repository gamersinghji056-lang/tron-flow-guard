export function v17Money(value: unknown, currency = "USDT") {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return currency === "INR" ? "₹0.00" : `0.00 ${currency}`;
  if (currency === "INR") {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
    }).format(numeric);
  }
  return `${numeric.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  })} ${currency}`;
}
