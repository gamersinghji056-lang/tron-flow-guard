import { PUBLIC_PRODUCTION_ORIGIN } from "./domain-policy.ts";

export const CANONICAL_PRODUCTION_ORIGIN = PUBLIC_PRODUCTION_ORIGIN;
export const LEGACY_LOVABLE_HOSTNAME = "wtron.lovable.app";
export const AUTHORITATIVE_SUPABASE_PROJECT_REF = "taqdmbcqztxwdgkwfcoi";

export function canonicalRuntimeUrl(input: {
  hostname: string;
  pathname?: string;
  search?: string;
  hash?: string;
}) {
  if (input.hostname.toLowerCase() !== LEGACY_LOVABLE_HOSTNAME) return null;
  return `${CANONICAL_PRODUCTION_ORIGIN}${input.pathname || "/"}${input.search || ""}${input.hash || ""}`;
}

export function isAuthoritativeSupabaseUrl(value?: string | null) {
  if (!value) return false;
  try {
    return new URL(value).hostname === `${AUTHORITATIVE_SUPABASE_PROJECT_REF}.supabase.co`;
  } catch {
    return false;
  }
}

export function canonicalRuntimeRedirectScript() {
  return `(function(){var l=window.location;if(l.hostname===${JSON.stringify(LEGACY_LOVABLE_HOSTNAME)}){l.replace(${JSON.stringify(CANONICAL_PRODUCTION_ORIGIN)}+l.pathname+l.search+l.hash);}})();`;
}

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
