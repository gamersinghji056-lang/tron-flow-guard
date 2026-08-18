export const P2P_STATUSES = [
  "created",
  "escrow_locked",
  "payment_pending",
  "payment_submitted",
  "payment_verifying",
  "payment_received",
  "release_pending",
  "completed",
  "cancelled",
  "expired",
  "disputed",
  "refunded",
  "admin_review",
] as const;

export type P2pStatus = (typeof P2P_STATUSES)[number];

const LEGAL_TRANSITIONS: Record<P2pStatus, readonly P2pStatus[]> = {
  created: ["escrow_locked", "payment_pending", "cancelled", "expired"],
  escrow_locked: ["payment_pending", "cancelled", "expired", "disputed"],
  payment_pending: ["payment_submitted", "cancelled", "expired", "disputed"],
  payment_submitted: ["payment_verifying", "payment_received", "disputed", "admin_review"],
  payment_verifying: ["payment_received", "disputed", "admin_review"],
  payment_received: ["release_pending", "completed", "disputed"],
  release_pending: ["completed", "disputed", "admin_review"],
  completed: [],
  cancelled: [],
  expired: [],
  disputed: ["admin_review", "completed", "refunded", "cancelled"],
  refunded: [],
  admin_review: ["completed", "refunded", "cancelled", "disputed"],
};

export function canTransitionP2pOrder(from: P2pStatus, to: P2pStatus): boolean {
  return LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertP2pTransition(from: P2pStatus, to: P2pStatus): void {
  if (!canTransitionP2pOrder(from, to)) {
    throw new Error(`Illegal P2P transition: ${from} -> ${to}`);
  }
}

export interface P2pMarketplaceAdInput {
  id: string;
  side: "buy" | "sell";
  asset?: string | null;
  fiat?: string | null;
  price_inr: unknown;
  available_usdt: unknown;
  min_order_inr: unknown;
  max_order_inr: unknown;
  payment_methods?: string[] | null;
  terms?: string | null;
}

export function normalizeP2pMarketplaceAd(row: P2pMarketplaceAdInput) {
  return {
    id: row.id,
    side: row.side,
    asset: row.asset ?? "USDT",
    fiat: row.fiat ?? "INR",
    price_inr: Number(row.price_inr),
    available_usdt: Number(row.available_usdt),
    min_order_inr: Number(row.min_order_inr),
    max_order_inr: Number(row.max_order_inr),
    payment_methods: row.payment_methods?.length ? row.payment_methods : ["upi"],
    terms: row.terms ?? null,
  };
}
