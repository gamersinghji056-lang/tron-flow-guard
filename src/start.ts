import { createStart, createMiddleware } from "@tanstack/start-client-core";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

const csrfMiddleware = createMiddleware().server(async (ctx) => {
  const request = ctx.request;
  const method = request.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return ctx.next();

  const requestOrigin = new URL(request.url).origin;
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite && ["same-origin", "same-site", "none"].includes(fetchSite)) return ctx.next();

  const origin = request.headers.get("Origin");
  if (origin && origin === requestOrigin) return ctx.next();

  const referer = request.headers.get("Referer");
  if (referer) {
    try {
      if (new URL(referer).origin === requestOrigin) return ctx.next();
    } catch {
      // Fall through to the forbidden response below.
    }
  }

  return new Response("Forbidden", { status: 403 });
});

Object.defineProperty(csrfMiddleware, Symbol.for("tanstack-start:csrf-middleware"), {
  value: true,
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
