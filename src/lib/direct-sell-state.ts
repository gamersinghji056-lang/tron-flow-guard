export const DIRECT_SELL_STATUSES = [
  "created",
  "waiting_for_usdt",
  "usdt_detected",
  "usdt_confirming",
  "usdt_confirmed",
  "inr_payment_pending",
  "payment_assigned",
  "inr_payment_sent",
  "payment_verifying",
  "completed",
  "partial_payment",
  "overpayment",
  "manual_review",
  "expired",
  "cancelled",
] as const;

export type DirectSellStatus = (typeof DIRECT_SELL_STATUSES)[number];

const TRANSITIONS: Record<DirectSellStatus, readonly DirectSellStatus[]> = {
  created: ["waiting_for_usdt", "cancelled", "expired"],
  waiting_for_usdt: ["usdt_detected", "partial_payment", "overpayment", "expired", "cancelled"],
  usdt_detected: ["usdt_confirming", "usdt_confirmed", "manual_review"],
  usdt_confirming: ["usdt_confirmed", "manual_review"],
  usdt_confirmed: ["inr_payment_pending", "payment_assigned", "manual_review"],
  inr_payment_pending: ["payment_assigned", "manual_review"],
  payment_assigned: ["inr_payment_sent", "manual_review"],
  inr_payment_sent: ["payment_verifying", "completed", "manual_review"],
  payment_verifying: ["completed", "manual_review"],
  completed: [],
  partial_payment: ["usdt_detected", "usdt_confirming", "manual_review", "expired"],
  overpayment: ["manual_review"],
  manual_review: ["payment_assigned", "completed", "cancelled"],
  expired: [],
  cancelled: [],
};

export function canTransitionDirectSell(from: DirectSellStatus, to: DirectSellStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}
