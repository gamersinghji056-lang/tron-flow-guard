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

export interface P2pParticipantMetricsInput {
  completedTrades: number;
  successfulTrades: number;
  totalTrades: number;
  totalUsdtVolume: number;
  openDisputes: number;
  resolvedDisputes: number;
  reportsReceived: number;
  joinedAt: string | Date;
  now?: string | Date;
}

export function p2pCompletionRate(metrics: P2pParticipantMetricsInput) {
  if (metrics.totalTrades <= 0) return 0;
  return Math.round((metrics.successfulTrades / metrics.totalTrades) * 10_000) / 100;
}

export function p2pJoinedDurationDays(metrics: P2pParticipantMetricsInput) {
  const joined = new Date(metrics.joinedAt).getTime();
  const now = metrics.now ? new Date(metrics.now).getTime() : Date.now();
  if (!Number.isFinite(joined) || !Number.isFinite(now) || now <= joined) return 0;
  return Math.floor((now - joined) / 86_400_000);
}

export function p2pRankingTier(metrics: P2pParticipantMetricsInput) {
  const completion = p2pCompletionRate(metrics);
  const disputePenalty = metrics.openDisputes * 5 + metrics.reportsReceived * 3;
  const score =
    Math.min(metrics.completedTrades, 100) * 0.35 +
    Math.min(metrics.totalUsdtVolume / 1000, 100) * 0.3 +
    completion * 0.25 +
    Math.min(p2pJoinedDurationDays(metrics) / 30, 24) * 0.1 -
    disputePenalty;
  if (score >= 85 && completion >= 95) return "Top Trader";
  if (score >= 55 && completion >= 90) return "Experienced";
  if (score >= 20) return "Active";
  return "New";
}
