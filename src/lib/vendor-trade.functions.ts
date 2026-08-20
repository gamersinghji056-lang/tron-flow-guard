import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const createVendorOrderInput = z.object({
  listingId: z.string().uuid(),
  amountUsdt: z.number().positive(),
  rail: z.enum(["upi", "imps", "neft", "rtgs"]),
});

const submitVendorPaymentInput = z.object({
  orderId: z.string().uuid(),
  utr: z.string().trim().min(4).max(120),
  amountInr: z.number().positive(),
  proofPath: z.string().trim().min(10).max(500).optional(),
});

const orderIdInput = z.object({
  orderId: z.string().uuid(),
});

const disputeInput = orderIdInput.extend({
  reason: z.string().trim().min(3).max(500),
});

const vendorInput = z.object({
  vendorId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(2).max(120),
  userId: z.string().uuid().nullable().optional(),
  status: z.enum(["pending", "approved", "rejected", "suspended", "disabled"]).default("pending"),
  riskState: z.string().trim().min(2).max(40).default("normal"),
});

const listingInput = z.object({
  listingId: z.string().uuid().nullable().optional(),
  vendorId: z.string().uuid(),
  rateInr: z.number().positive(),
  availableUsdt: z.number().nonnegative(),
  minOrderInr: z.number().positive(),
  maxOrderInr: z.number().positive(),
  paymentRails: z.array(z.enum(["upi", "imps", "neft", "rtgs"])).min(1),
  status: z.enum(["active", "paused", "closed"]).default("active"),
});

export const fetchVendorMarketplace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("vendor_listings" as never)
      .select("*, trading_vendors(id, name, success_rate, completed_orders, status)")
      .eq("status", "active" as never)
      .gt("available_usdt", 0 as never)
      .order("rate_inr", { ascending: true })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createVendorOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createVendorOrderInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: order, error } = await context.supabase.rpc(
      "create_vendor_order" as never,
      {
        _listing_id: data.listingId,
        _usdt: data.amountUsdt,
        _rail: data.rail,
      } as never,
    );
    if (error) throw new Error(error.message);
    return order;
  });

export const submitVendorPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => submitVendorPaymentInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc(
      "submit_vendor_payment" as never,
      {
        _order_id: data.orderId,
        _utr: data.utr,
        _amount: data.amountInr,
        _proof_path: data.proofPath ?? null,
      } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const confirmVendorPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => orderIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requireApprovedVendor } = await import("@/lib/vendor.server");
    const { requireAdmin } = await import("@/lib/admin.server");
    try {
      await requireAdmin(context.supabase, context.userId);
    } catch {
      await requireApprovedVendor(context.supabase, context.userId);
    }
    const { error } = await context.supabase.rpc(
      "confirm_vendor_payment" as never,
      { _order_id: data.orderId } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const disputeVendorOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => disputeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requireApprovedVendor } = await import("@/lib/vendor.server");
    const { requireAdmin } = await import("@/lib/admin.server");
    try {
      await requireAdmin(context.supabase, context.userId);
    } catch {
      const { data: vendor } = await context.supabase
        .from("trading_vendors" as never)
        .select("id")
        .eq("user_id", context.userId as never)
        .maybeSingle();
      if (vendor) await requireApprovedVendor(context.supabase, context.userId);
    }
    const { error } = await context.supabase.rpc(
      "dispute_vendor_order" as never,
      { _order_id: data.orderId, _reason: data.reason } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUpsertTradingVendor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => vendorInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/admin.server");
    await requireAdmin(context.supabase, context.userId);
    const { data: vendor, error } = await context.supabase.rpc(
      "admin_upsert_trading_vendor" as never,
      {
        _vendor_id: data.vendorId ?? null,
        _name: data.name,
        _user_id: data.userId ?? null,
        _status: data.status,
        _risk_state: data.riskState,
      } as never,
    );
    if (error) throw new Error(error.message);
    return vendor;
  });

export const adminUpsertVendorListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listingInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/admin.server");
    await requireAdmin(context.supabase, context.userId);
    const { data: listing, error } = await context.supabase.rpc(
      "admin_upsert_vendor_listing" as never,
      {
        _listing_id: data.listingId ?? null,
        _vendor_id: data.vendorId,
        _rate_inr: data.rateInr,
        _available_usdt: data.availableUsdt,
        _min_order_inr: data.minOrderInr,
        _max_order_inr: data.maxOrderInr,
        _payment_rails: data.paymentRails,
        _status: data.status,
      } as never,
    );
    if (error) throw new Error(error.message);
    return listing;
  });
