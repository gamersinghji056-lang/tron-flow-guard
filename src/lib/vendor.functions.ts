import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const vendorRegisterInput = z.object({
  businessName: z.string().trim().min(2).max(120),
  contactName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
  telegram: z.string().trim().max(80).optional(),
  termsAccepted: z.literal(true),
});

const vendorAccountInput = z.object({
  id: z.string().uuid().optional(),
  rail: z.enum(["upi", "imps", "neft", "rtgs"]),
  label: z.string().trim().max(80).optional(),
  holderName: z.string().trim().min(2).max(120),
  accountRef: z.string().trim().min(3).max(120),
  bankName: z.string().trim().max(120).optional(),
  accountNumber: z.string().trim().max(80).optional(),
  ifsc: z.string().trim().max(20).optional(),
  minInr: z.number().positive(),
  maxInr: z.number().positive(),
  dailyLimitInr: z.number().positive(),
  priority: z.number().int().min(0).max(10000).default(100),
  isDefault: z.boolean().default(false),
  enabled: z.boolean().default(true),
  frozen: z.boolean().default(false),
});

const vendorListingInput = z.object({
  id: z.string().uuid().optional(),
  amountUsdt: z.number().positive(),
  rateInr: z.number().positive(),
  paymentAccountId: z.string().uuid(),
  minOrderInr: z.number().positive(),
  maxOrderInr: z.number().positive(),
  paymentRails: z.array(z.enum(["upi", "imps", "neft", "rtgs"])).min(1),
  terms: z.string().trim().max(1000).optional(),
  status: z.enum(["active", "paused", "closed"]).default("active"),
});

const vendorOrderActionInput = z.object({
  orderId: z.string().uuid(),
});

const vendorDisputeInput = vendorOrderActionInput.extend({
  reason: z.string().trim().min(3).max(500),
});

const adminVendorActionInput = z.object({
  vendorId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

type VendorStatus = "pending" | "approved" | "rejected" | "suspended" | "disabled";

export const registerVendorApplication = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => vendorRegisterInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.contactName,
        account_type: "vendor",
      },
    });
    if (authError) throw new Error(authError.message);
    const userId = created.user?.id;
    if (!userId) throw new Error("Could not create vendor account");

    await supabaseAdmin.from("profiles").upsert({
      id: userId,
      email: data.email,
      full_name: data.contactName,
    });
    await supabaseAdmin.from("user_roles" as never).upsert({
      user_id: userId,
      role: "vendor",
    } as never);
    const { data: vendor, error } = await supabaseAdmin
      .from("trading_vendors" as never)
      .insert({
        user_id: userId,
        name: data.businessName,
        contact_name: data.contactName,
        email: data.email,
        telegram_username: data.telegram || null,
        status: "pending",
        application_terms_accepted_at: new Date().toISOString(),
      } as never)
      .select("id, status")
      .single();
    if (error) throw new Error(error.message);
    return vendor as unknown as { id: string; status: VendorStatus };
  });

export const fetchVendorApplication = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("trading_vendors" as never)
      .select(
        "id, user_id, name, contact_name, email, telegram_username, status, risk_state, success_rate, completed_orders, disputed_orders, created_at, approved_at, rejected_at, rejection_reason, suspended_at, suspension_reason",
      )
      .eq("user_id", context.userId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const fetchVendorPortal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireApprovedVendor } = await import("@/lib/vendor.server");
    const vendor = await requireApprovedVendor(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [accounts, listings, orders, wallets] = await Promise.all([
      supabaseAdmin
        .from("vendor_payment_accounts" as never)
        .select("*")
        .eq("vendor_id", vendor.id as never)
        .order("priority", { ascending: true }),
      supabaseAdmin
        .from("vendor_listings" as never)
        .select("*")
        .eq("vendor_id", vendor.id as never)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("vendor_orders" as never)
        .select("*")
        .eq("vendor_id", vendor.id as never)
        .order("created_at", { ascending: false })
        .limit(100),
      supabaseAdmin
        .from("user_wallets")
        .select(
          "id, name, address, network, balance, onchain_balance, onchain_trx_balance, is_default, wallet_type, custody, backup_status, gas_sponsorship_status, created_at",
        )
        .eq("user_id", context.userId)
        .eq("is_archived", false)
        .order("is_default", { ascending: false }),
    ]);
    for (const result of [accounts, listings, orders, wallets]) {
      if (result.error) throw new Error(result.error.message);
    }
    return {
      vendor,
      accounts: accounts.data ?? [],
      listings: listings.data ?? [],
      orders: orders.data ?? [],
      wallets: wallets.data ?? [],
    };
  });

export const saveVendorAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => vendorAccountInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requireApprovedVendor } = await import("@/lib/vendor.server");
    const vendor = await requireApprovedVendor(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = {
      vendor_id: vendor.id,
      rail: data.rail,
      label: data.label || null,
      account_ref: data.accountRef,
      holder_name: data.holderName,
      bank_name: data.bankName || null,
      account_number: data.accountNumber || null,
      ifsc: data.ifsc || null,
      min_inr: data.minInr,
      max_inr: data.maxInr,
      daily_limit_inr: data.dailyLimitInr,
      priority: data.priority,
      is_default: data.isDefault,
      enabled: data.enabled,
      frozen: data.frozen,
      status: data.frozen ? "frozen" : data.enabled ? "active" : "disabled",
    };
    const query = data.id
      ? supabaseAdmin
          .from("vendor_payment_accounts" as never)
          .update(row as never)
          .eq("id", data.id as never)
          .eq("vendor_id", vendor.id as never)
      : supabaseAdmin.from("vendor_payment_accounts" as never).insert(row as never);
    const { data: saved, error } = await query.select("*").single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const saveVendorListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => vendorListingInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requireApprovedVendor } = await import("@/lib/vendor.server");
    const vendor = await requireApprovedVendor(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: account, error: accountError } = await supabaseAdmin
      .from("vendor_payment_accounts" as never)
      .select("id, min_inr, max_inr, rail, status, enabled, frozen")
      .eq("id", data.paymentAccountId as never)
      .eq("vendor_id", vendor.id as never)
      .single();
    if (accountError) throw new Error(accountError.message);
    const paymentAccount = account as unknown as {
      min_inr: number | string;
      max_inr: number | string;
      rail: string;
      status: string;
      enabled: boolean;
      frozen: boolean;
    };
    if (paymentAccount.status !== "active" || !paymentAccount.enabled || paymentAccount.frozen) {
      throw new Error("Select an enabled vendor account");
    }
    if (
      data.minOrderInr < Number(paymentAccount.min_inr) ||
      data.maxOrderInr > Number(paymentAccount.max_inr)
    ) {
      throw new Error("Listing min/max must stay within account limits");
    }
    if (!data.paymentRails.includes(paymentAccount.rail as never)) {
      throw new Error("Selected account rail must be included in the listing rails");
    }
    const existing = data.id
      ? await supabaseAdmin
          .from("vendor_listings" as never)
          .select("reserved_usdt")
          .eq("id", data.id as never)
          .eq("vendor_id", vendor.id as never)
          .single()
      : null;
    if (existing?.error) throw new Error(existing.error.message);
    const reserved = Number(
      (existing?.data as unknown as { reserved_usdt?: number | string } | null)?.reserved_usdt ?? 0,
    );
    if (data.amountUsdt < reserved) {
      throw new Error("Active reservations must remain frozen");
    }
    const row = {
      vendor_id: vendor.id,
      payment_account_id: data.paymentAccountId,
      total_usdt: data.amountUsdt,
      available_usdt: data.amountUsdt - reserved,
      reserved_usdt: reserved,
      rate_inr: data.rateInr,
      min_order_inr: data.minOrderInr,
      max_order_inr: data.maxOrderInr,
      payment_rails: data.paymentRails,
      terms: data.terms || null,
      status: data.status,
    };
    const query = data.id
      ? supabaseAdmin
          .from("vendor_listings" as never)
          .update(row as never)
          .eq("id", data.id as never)
          .eq("vendor_id", vendor.id as never)
      : supabaseAdmin.from("vendor_listings" as never).insert(row as never);
    const { data: saved, error } = await query.select("*").single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const vendorConfirmPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => vendorOrderActionInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requireApprovedVendor } = await import("@/lib/vendor.server");
    await requireApprovedVendor(context.supabase, context.userId);
    const { error } = await context.supabase.rpc(
      "confirm_vendor_payment" as never,
      { _order_id: data.orderId } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const vendorDisputePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => vendorDisputeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requireApprovedVendor } = await import("@/lib/vendor.server");
    await requireApprovedVendor(context.supabase, context.userId);
    const { error } = await context.supabase.rpc(
      "dispute_vendor_order" as never,
      { _order_id: data.orderId, _reason: data.reason } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminVendorAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        vendorId: z.string().uuid(),
        action: z.enum(["approve", "reject", "suspend", "reactivate"]),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/admin.server");
    await requireAdmin(context.supabase, context.userId);
    const rpcName =
      data.action === "approve"
        ? "approve_trading_vendor"
        : data.action === "reject"
          ? "reject_trading_vendor"
          : data.action === "suspend"
            ? "suspend_trading_vendor"
            : "reactivate_trading_vendor";
    const args =
      data.action === "reject" || data.action === "suspend"
        ? { _vendor_id: data.vendorId, _reason: data.reason ?? null }
        : { _vendor_id: data.vendorId };
    const { data: vendor, error } = await context.supabase.rpc(rpcName as never, args as never);
    if (error) throw new Error(error.message);
    return vendor;
  });

export const listAdminVendors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireAdmin } = await import("@/lib/admin.server");
    await requireAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("trading_vendors" as never)
      .select(
        "id, name, contact_name, email, telegram_username, status, risk_state, completed_orders, disputed_orders, success_rate, created_at, approved_at, rejected_at, suspended_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });
