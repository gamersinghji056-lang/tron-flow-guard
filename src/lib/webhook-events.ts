export const WEBHOOK_EVENTS = [
  "deposit.detected",
  "deposit.confirming",
  "deposit.confirmed",
  "deposit.credited",
  "deposit.failed",
  "p2p.order.created",
  "p2p.payment.submitted",
  "p2p.order.completed",
  "p2p.order.cancelled",
  "p2p.order.disputed",
  "direct_sell.created",
  "direct_sell.usdt_detected",
  "direct_sell.usdt_confirmed",
  "direct_sell.payment_sent",
  "direct_sell.completed",
  "direct_sell.manual_review",
  "withdrawal.created",
  "withdrawal.broadcast",
  "withdrawal.completed",
  "withdrawal.failed",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
