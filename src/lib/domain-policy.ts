export const PUBLIC_PRODUCTION_ORIGIN = "https://wtron.org";
export const ADMIN_PRODUCTION_ORIGIN = "https://admin.wtron.org";
export const PUBLIC_PRODUCTION_HOSTNAME = "wtron.org";
export const ADMIN_PRODUCTION_HOSTNAME = "admin.wtron.org";
export const RAILWAY_PRODUCTION_HOSTNAME = "tron-flow-guard-production.up.railway.app";

const PASS_THROUGH_PREFIXES = [
  "/api/",
  "/mini-app",
  "/favicon",
  "/assets/",
  "/_build/",
  "/_server",
  "/_server/",
  "/robots.txt",
  "/sitemap.xml",
];

function normalizedPath(pathname: string) {
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

export function isPassThroughPath(pathname: string) {
  const path = normalizedPath(pathname);
  return PASS_THROUGH_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

export function isAdminPath(pathname: string) {
  const path = normalizedPath(pathname);
  return path === "/admin" || path.startsWith("/admin/");
}

export function isAdminProductionHostname(hostname: string) {
  return hostname.toLowerCase() === ADMIN_PRODUCTION_HOSTNAME;
}

export function adminDomainClientRouteTarget(input: {
  hostname: string;
  pathname: string;
  authenticated: boolean;
  isAdmin: boolean;
}) {
  if (!isAdminProductionHostname(input.hostname)) return null;
  const pathname = normalizedPath(input.pathname);
  if (isAdminPath(pathname)) return null;
  return input.authenticated && input.isAdmin ? "/admin" : "/admin/login";
}

export function domainRedirectTarget(input: {
  hostname: string;
  pathname: string;
  search?: string;
}) {
  const hostname = input.hostname.toLowerCase();
  const pathname = normalizedPath(input.pathname);
  const search = input.search ?? "";

  if (isPassThroughPath(pathname)) return null;

  if (hostname === ADMIN_PRODUCTION_HOSTNAME) {
    if (pathname === "/") return `${ADMIN_PRODUCTION_ORIGIN}/admin/login${search}`;
    if (isAdminPath(pathname)) return null;
    return `${ADMIN_PRODUCTION_ORIGIN}/admin/login${search}`;
  }

  if (hostname === PUBLIC_PRODUCTION_HOSTNAME && isAdminPath(pathname)) {
    return `${ADMIN_PRODUCTION_ORIGIN}${pathname}${search}`;
  }

  return null;
}
