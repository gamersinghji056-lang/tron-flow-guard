/**
 * Account provisioning server functions.
 *
 * Trader and administrator registration are separate endpoints. Administrator
 * sign-up is gated behind the shared `ADMIN_REGISTRATION_CODE` secret when one
 * is configured, and the role grant only ever happens server-side so a client
 * can never request elevated access.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const traderInput = z.object({
  email: z.string().trim().email("Enter a valid email address").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  fullName: z.string().trim().min(1, "Full name is required").max(80),
});

const adminInput = z.object({
  email: z.string().trim().email("Enter a valid email address").max(255),
  password: z.string().min(10, "Administrator passwords must be at least 10 characters").max(72),
  fullName: z.string().trim().min(1, "Full name is required").max(80),
  code: z.string().trim().max(200).optional(),
});

export const registerTrader = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => traderInput.parse(data))
  .handler(async ({ data }) => {
    const { provisionTrader } = await import("@/lib/accounts.server");
    return provisionTrader(data);
  });

export const registerAdmin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => adminInput.parse(data))
  .handler(async ({ data }) => {
    const { provisionAdmin } = await import("@/lib/accounts.server");
    return provisionAdmin(data);
  });

export const getCurrentAccountAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { readAccess } = await import("@/lib/access.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [access, vendor] = await Promise.all([
      readAccess(context.supabase, context.userId),
      supabaseAdmin
        .from("trading_vendors" as never)
        .select("id, status")
        .eq("user_id", context.userId as never)
        .maybeSingle(),
    ]);
    const vendorStatus = (vendor.data as { status?: string | null } | null)?.status ?? null;
    const accountType = access.isAdmin
      ? "admin"
      : access.role === "vendor" || vendorStatus
        ? "vendor"
        : "trader";
    return {
      userId: context.userId,
      role: access.role,
      isAdmin: access.isAdmin,
      isSuperAdmin: access.isSuperAdmin,
      accountType,
      vendorStatus,
    };
  });
