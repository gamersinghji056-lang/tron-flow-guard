import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertVendorDirectSellAccount,
  directSellPayoutMetadata,
  type DirectSellActorType,
  type DirectSellPayoutSource,
} from "@/lib/direct-sell-policy";
import type { ChainNetwork } from "@/lib/chain";

const createDirectSellInput = z.object({
  amount: z.number().positive().max(1_000_000),
  paymentMethodId: z.string().uuid(),
});

const createVendorDirectSellInput = z.object({
  amount: z.number().positive().max(1_000_000),
  vendorPaymentAccountId: z.string().uuid(),
});

interface DirectSellOrderCreated {
  order_id: string;
  order_ref: string;
  deposit_request_id: string;
  wallet_address: string;
  expected_inr: number | string;
  locked_rate_inr: number | string;
  network: string;
  payout_account_source: DirectSellPayoutSource;
  payout_account_id: string;
  actor_type: DirectSellActorType;
  vendor_id?: string | null;
}

async function readSetting(key: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("system_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { value?: unknown } | null)?.value;
}

function scalar(value: unknown) {
  if (typeof value === "string") return value.replace(/^"|"$/g, "");
  return value;
}

async function getNumericSetting(key: string, fallback: number) {
  const raw = scalar(await readSetting(key));
  const number = Number(raw ?? fallback);
  return Number.isFinite(number) ? number : fallback;
}

async function createDirectSellOrderRecord(input: {
  userId: string;
  amount: number;
  actorType: DirectSellActorType;
  payoutSource: DirectSellPayoutSource;
  payoutAccountId: string;
  vendorId?: string | null;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const activeNetwork = String(
    scalar(await readSetting("active_network")) || "trc20-nile",
  ) as ChainNetwork;
  const requiredConfirmations = await getNumericSetting("required_confirmations", 16);
  const expiryMinutes = await getNumericSetting("deposit_expiry_minutes", 120);
  const rate =
    (await getNumericSetting("wtron_buy_rate_inr", 0)) ||
    (await getNumericSetting("direct_sell_rate_inr", 0));
  const minAmount = await getNumericSetting("direct_sell_min_usdt", 1);
  const maxAmount = await getNumericSetting("direct_sell_max_usdt", 1_000_000);
  if (rate <= 0) throw new Error("Direct sell rate is not configured");
  if (input.amount < minAmount || input.amount > maxAmount) {
    throw new Error(`Direct sell amount must be between ${minAmount} and ${maxAmount} USDT`);
  }
  const expectedInr = Math.round(input.amount * rate * 100) / 100;

  const { data: wallet, error: walletError } = await supabaseAdmin
    .from("wallets")
    .select("id, address, network")
    .eq("network", activeNetwork as never)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (walletError) throw new Error(walletError.message);
  const companyWallet = wallet as { id: string; address: string; network: string } | null;
  if (!companyWallet) throw new Error("No active company wallet is configured");

  const paymentAssignment = directSellPayoutMetadata({
    actorType: input.actorType,
    payoutSource: input.payoutSource,
    payoutAccountId: input.payoutAccountId,
    vendorId: input.vendorId ?? null,
  });
  const expiresAt = new Date(Date.now() + expiryMinutes * 60_000).toISOString();
  const baseOrderPayload = {
    user_id: input.userId,
    wallet_id: companyWallet.id,
    network: companyWallet.network as ChainNetwork,
    expected_usdt: input.amount,
    remaining_usdt: input.amount,
    locked_rate_inr: rate,
    expected_inr: expectedInr,
    assigned_company_address: companyWallet.address,
    required_confirmations: requiredConfirmations,
    expires_at: expiresAt,
    payment_method_id: input.payoutSource === "payment_methods" ? input.payoutAccountId : null,
    payment_assignment: paymentAssignment,
  };
  const typedOrderPayload = {
    ...baseOrderPayload,
    actor_type: input.actorType,
    vendor_id: input.vendorId ?? null,
    payout_account_source: input.payoutSource,
    vendor_payment_account_id:
      input.payoutSource === "vendor_payment_accounts" ? input.payoutAccountId : null,
  };
  const insertOrder = async (payload: Record<string, unknown>) =>
    supabaseAdmin
      .from("direct_sell_orders" as never)
      .insert(payload as never)
      .select("id, order_ref, expected_inr, locked_rate_inr, network")
      .single();

  let orderResult = await insertOrder(typedOrderPayload);
  if (
    orderResult.error &&
    /(actor_type|vendor_id|payout_account_source|vendor_payment_account_id).*(does not exist|schema cache)|column .*direct_sell_orders\.(actor_type|vendor_id|payout_account_source|vendor_payment_account_id).* does not exist/i.test(
      orderResult.error.message,
    )
  ) {
    orderResult = await insertOrder(baseOrderPayload);
  }
  const { data: order, error: orderError } = orderResult;
  if (orderError) throw new Error(orderError.message);
  const savedOrder = order as unknown as {
    id: string;
    order_ref: string;
    expected_inr: number | string;
    locked_rate_inr: number | string;
    network: string;
  };

  const { data: deposit, error: depositError } = await supabaseAdmin
    .from("deposit_requests")
    .insert({
      user_id: input.userId,
      wallet_id: companyWallet.id,
      network: companyWallet.network as ChainNetwork,
      expected_amount: input.amount,
      required_confirmations: requiredConfirmations,
      expires_at: expiresAt,
      purpose: "direct_sell",
      direct_sell_order_id: savedOrder.id,
    })
    .select("id")
    .single();
  if (depositError) throw new Error(depositError.message);
  const depositId = (deposit as { id: string }).id;

  const { error: updateError } = await supabaseAdmin
    .from("direct_sell_orders" as never)
    .update({ deposit_request_id: depositId } as never)
    .eq("id", savedOrder.id as never);
  if (updateError) throw new Error(updateError.message);

  await supabaseAdmin.from("audit_logs").insert({
    actor_id: input.userId,
    actor_type: input.actorType,
    action: "direct_sell.created",
    entity_type: "direct_sell_order",
    entity_id: savedOrder.id,
    metadata: {
      amount: input.amount,
      rate,
      deposit_request_id: depositId,
      ...paymentAssignment,
    },
  });

  return {
    order_id: savedOrder.id,
    order_ref: savedOrder.order_ref,
    deposit_request_id: depositId,
    wallet_address: companyWallet.address,
    expected_inr: savedOrder.expected_inr,
    locked_rate_inr: savedOrder.locked_rate_inr,
    network: savedOrder.network,
    payout_account_source: input.payoutSource,
    payout_account_id: input.payoutAccountId,
    actor_type: input.actorType,
    vendor_id: input.vendorId ?? null,
  } satisfies DirectSellOrderCreated;
}

export const createDirectSellOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createDirectSellInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: vendorAccount, error: vendorError } = await supabaseAdmin
      .from("trading_vendors" as never)
      .select("id")
      .eq("user_id", context.userId as never)
      .maybeSingle();
    if (vendorError) throw new Error(vendorError.message);
    if (vendorAccount) {
      throw new Error("Vendor accounts must use vendor payout accounts for Direct Sell");
    }
    const { data: method, error } = await context.supabase
      .from("payment_methods")
      .select("id, kind, status")
      .eq("id", data.paymentMethodId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = method as { kind?: string | null; status?: string | null } | null;
    if (!row || !["upi", "bank"].includes(String(row.kind ?? ""))) {
      throw new Error("Select one of your own payout methods");
    }
    if ((row.status ?? "active") !== "active") throw new Error("Select an active payout method");
    return createDirectSellOrderRecord({
      userId: context.userId,
      amount: data.amount,
      actorType: "trader",
      payoutSource: "payment_methods",
      payoutAccountId: data.paymentMethodId,
    });
  });

export const createVendorDirectSellOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createVendorDirectSellInput.parse(data))
  .handler(async ({ data, context }) => {
    const { requireApprovedVendor } = await import("@/lib/vendor.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const vendor = await requireApprovedVendor(context.supabase, context.userId);
    const rate =
      (await getNumericSetting("wtron_buy_rate_inr", 0)) ||
      (await getNumericSetting("direct_sell_rate_inr", 0));
    if (rate <= 0) throw new Error("Direct sell rate is not configured");
    const expectedInr = Math.round(data.amount * rate * 100) / 100;

    const { data: account, error } = await supabaseAdmin
      .from("vendor_payment_accounts" as never)
      .select(
        "id, vendor_id, status, enabled, frozen, archived_at, min_inr, max_inr, daily_limit_inr",
      )
      .eq("id", data.vendorPaymentAccountId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const { data: capacityRows, error: capacityError } = await supabaseAdmin.rpc(
      "vendor_payment_account_capacity" as never,
      { _account_id: data.vendorPaymentAccountId, _business_tz: "Asia/Kolkata" } as never,
    );
    if (capacityError) throw new Error(capacityError.message);
    const capacity = Array.isArray(capacityRows) ? capacityRows[0] : capacityRows;
    const usedTodayInr = Number(
      (capacity as { used_today_inr?: number | string | null } | null)?.used_today_inr ?? 0,
    );
    assertVendorDirectSellAccount({
      account: account as never,
      vendorId: vendor.id,
      expectedInr,
      usedTodayInr,
    });
    return createDirectSellOrderRecord({
      userId: context.userId,
      amount: data.amount,
      actorType: "vendor",
      payoutSource: "vendor_payment_accounts",
      payoutAccountId: data.vendorPaymentAccountId,
      vendorId: vendor.id,
    });
  });
