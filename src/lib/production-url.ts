export const CANONICAL_PRODUCTION_ORIGIN = "https://tron-flow-guard-production.up.railway.app";

export function normalizeOrigin(value?: string | null) {
  const raw = value?.trim().replace(/\/+$/, "");
  if (!raw) return CANONICAL_PRODUCTION_ORIGIN;
  try {
    const url = new URL(raw);
    return url.origin;
  } catch {
    return CANONICAL_PRODUCTION_ORIGIN;
  }
}

export function buildPublicUrl(path = "/") {
  return new URL(path, `${CANONICAL_PRODUCTION_ORIGIN}/`).toString();
}

export function buildMiniAppUrl(path = "/mini-app") {
  return new URL(path, `${CANONICAL_PRODUCTION_ORIGIN}/`).toString();
}
