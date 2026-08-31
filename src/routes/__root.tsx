import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useLocation,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentAccountAccess } from "@/lib/accounts.functions";
import { adminDomainClientRouteTarget } from "@/lib/domain-policy";
import { miniAppErrorHomeHref } from "@/lib/mini-app-runtime";
import { CANONICAL_PRODUCTION_ORIGIN, canonicalRuntimeRedirectScript } from "@/lib/production-url";

function publicConfigScript() {
  const env =
    typeof process !== "undefined" ? (process.env as Record<string, string | undefined>) : {};
  return `window.__WTRON_PUBLIC_CONFIG__=${JSON.stringify({
    supabaseUrl: env["SUPABASE_URL"] ?? "",
    supabasePublishableKey: env["SUPABASE_PUBLISHABLE_KEY"] ?? "",
  }).replace(/</g, "\\u003c")};`;
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const homeHref =
    typeof window === "undefined" ? "/" : miniAppErrorHomeHref(window.location.pathname);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              if (
                typeof window !== "undefined" &&
                window.location.pathname.startsWith("/mini-app")
              ) {
                window.location.assign(miniAppErrorHomeHref(window.location.pathname));
                return;
              }
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href={homeHref}
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "WTRON" },
      {
        name: "description",
        content: "WTRON wallet, P2P, vendor and direct-sell operations platform.",
      },
      { name: "author", content: "WTRON" },
      { property: "og:title", content: "WTRON" },
      {
        property: "og:description",
        content: "TRON USDT wallet, P2P, vendor and direct-sell operations.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: CANONICAL_PRODUCTION_ORIGIN },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: canonicalRuntimeRedirectScript() }} />
        <script dangerouslySetInnerHTML={{ __html: publicConfigScript() }} />
        <script src="https://telegram.org/js/telegram-web-app.js" />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const location = useLocation();
  const resolveCurrentAccount = useServerFn(getCurrentAccountAccess);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const initialTarget = adminDomainClientRouteTarget({
      hostname: window.location.hostname,
      pathname: window.location.pathname,
      authenticated: false,
      isAdmin: false,
    });
    if (!initialTarget) return;
    let active = true;
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!active) return;
        if (!data.session) {
          window.location.replace(initialTarget);
          return;
        }
        try {
          const account = await resolveCurrentAccount();
          if (!active) return;
          const target = adminDomainClientRouteTarget({
            hostname: window.location.hostname,
            pathname: window.location.pathname,
            authenticated: true,
            isAdmin: account.isAdmin,
          });
          if (target) window.location.replace(target);
        } catch {
          if (active) window.location.replace("/admin/login");
        }
      })
      .catch(() => {
        if (active) window.location.replace("/admin/login");
      });
    return () => {
      active = false;
    };
  }, [location.pathname, resolveCurrentAccount]);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster />
    </QueryClientProvider>
  );
}
