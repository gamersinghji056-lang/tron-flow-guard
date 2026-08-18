export const API_SCOPES = [
  "deposit:create",
  "deposit:read",
  "transaction:read",
  "balance:read",
  "direct_sell:create",
  "direct_sell:read",
  "webhook:manage",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];
