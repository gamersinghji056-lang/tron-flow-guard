import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const rangeInput = z.object({
  range: z.enum(["today", "7d", "30d", "custom"]).default("30d"),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const usernameInput = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(24)
    .regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers and underscores only"),
});

const referralInput = z.object({
  referralCode: z.string().trim().min(3).max(40),
  source: z.string().trim().max(40).default("telegram"),
});

function dateWindow(input: z.infer<typeof rangeInput>) {
  const to = input.to ? new Date(input.to) : new Date();
  const from = input.from
    ? new Date(input.from)
    : input.range === "today"
      ? new Date(to.getFullYear(), to.getMonth(), to.getDate())
      : new Date(to.getTime() - (input.range === "7d" ? 7 : 30) * 24 * 60 * 60_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function sumRows<T>(rows: T[] | null | undefined, pick: (row: T) => unknown) {
  return (rows ?? []).reduce((sum, row) => {
    const value = Number(pick(row) ?? 0);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
}

function referralCodeFromUser(userId: string) {
  return `WT${userId.replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

export const fetchUserAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => rangeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { from, to } = dateWindow(data);
    const [ledger, orders, directSell, disputes] = await Promise.all([
      context.supabase
        .from("ledger_entries" as never)
        .select("entry_type, amount, currency, created_at")
        .eq("user_id", context.userId as never)
        .gte("created_at", from as never)
        .lte("created_at", to as never)
        .limit(500),
      context.supabase
        .from("p2p_orders" as never)
        .select("side, status, usdt_amount, total_inr, created_at, completed_at")
        .or(`buyer_user_id.eq.${context.userId},seller_user_id.eq.${context.userId}` as never)
        .gte("created_at", from as never)
        .lte("created_at", to as never)
        .limit(500),
      context.supabase
        .from("direct_sell_orders" as never)
        .select("amount_usdt, expected_inr, status, created_at, completed_at")
        .eq("user_id", context.userId as never)
        .gte("created_at", from as never)
        .lte("created_at", to as never)
        .limit(500),
      context.supabase
        .from("p2p_disputes" as never)
        .select("id, status, created_at")
        .or(`buyer_user_id.eq.${context.userId},seller_user_id.eq.${context.userId}` as never)
        .gte("created_at", from as never)
        .lte("created_at", to as never)
        .limit(200),
    ]);
    for (const result of [ledger, orders, directSell, disputes]) {
      if (result.error) throw new Error(result.error.message);
    }

    const orderRows = (orders.data ?? []) as {
      side: string | null;
      status: string | null;
      usdt_amount: number | string | null;
      total_inr: number | string | null;
      created_at: string | null;
      completed_at: string | null;
    }[];
    const directRows = (directSell.data ?? []) as {
      amount_usdt: number | string | null;
      expected_inr: number | string | null;
      status: string | null;
      created_at: string | null;
      completed_at: string | null;
    }[];
    const ledgerRows = (ledger.data ?? []) as {
      entry_type: string | null;
      amount: number | string | null;
      currency: string | null;
      created_at: string | null;
    }[];

    const completed = orderRows.filter((row) => row.status === "completed");
    const completedDirect = directRows.filter((row) => row.status === "completed");
    const settlementTimes = [
      ...completed.map((row) =>
        row.created_at && row.completed_at
          ? new Date(row.completed_at).getTime() - new Date(row.created_at).getTime()
          : 0,
      ),
      ...completedDirect.map((row) =>
        row.created_at && row.completed_at
          ? new Date(row.completed_at).getTime() - new Date(row.created_at).getTime()
          : 0,
      ),
    ].filter((value) => value > 0);

    return {
      from,
      to,
      totalUsdtVolume:
        sumRows(orderRows, (row) => row.usdt_amount) +
        sumRows(directRows, (row) => row.amount_usdt),
      totalInrVolume:
        sumRows(orderRows, (row) => row.total_inr) + sumRows(directRows, (row) => row.expected_inr),
      p2pBuyVolume: sumRows(
        orderRows.filter((row) => row.side === "buy"),
        (row) => row.usdt_amount,
      ),
      p2pSellVolume: sumRows(
        orderRows.filter((row) => row.side === "sell"),
        (row) => row.usdt_amount,
      ),
      companyTradeVolume: sumRows(directRows, (row) => row.amount_usdt),
      feesPaid: sumRows(
        ledgerRows.filter((row) => String(row.entry_type ?? "").includes("fee")),
        (row) => row.amount,
      ),
      completedOrders: completed.length + completedDirect.length,
      disputes: disputes.data?.length ?? 0,
      successRate: orderRows.length ? Math.round((completed.length / orderRows.length) * 100) : 0,
      averageSettlementMinutes: settlementTimes.length
        ? Math.round(
            settlementTimes.reduce((sum, value) => sum + value, 0) / settlementTimes.length / 60000,
          )
        : 0,
      walletInflow: sumRows(
        ledgerRows.filter((row) =>
          ["deposit", "transfer_in", "p2p_buy"].includes(String(row.entry_type)),
        ),
        (row) => row.amount,
      ),
      walletOutflow: sumRows(
        ledgerRows.filter((row) =>
          ["withdrawal", "transfer_out", "p2p_sell"].includes(String(row.entry_type)),
        ),
        (row) => row.amount,
      ),
      chart: orderRows.slice(0, 30).map((row) => ({
        date: row.created_at?.slice(0, 10) ?? "",
        usdt: Number(row.usdt_amount ?? 0),
        inr: Number(row.total_inr ?? 0),
      })),
    };
  });

export const fetchTradeHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("direct_sell_orders" as never)
      .select(
        "id, order_ref, amount_usdt, rate_inr, expected_inr, fee_usdt, status, payment_method_id, created_at, completed_at",
      )
      .eq("user_id", context.userId as never)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateUsername = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => usernameInput.parse(input))
  .handler(async ({ data, context }) => {
    const username = data.username.toLowerCase();
    const { error } = await context.supabase
      .from("profiles" as never)
      .update({ username } as never)
      .eq("id", context.userId as never);
    if (error) throw new Error(error.message);
    return { username };
  });

export const fetchReferralSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const code = referralCodeFromUser(context.userId);
    await context.supabase
      .from("profiles" as never)
      .update({ referral_code: code } as never)
      .eq("id", context.userId as never)
      .is("referral_code", null as never);
    const [profile, invited, rewards, settings] = await Promise.all([
      context.supabase
        .from("profiles" as never)
        .select("referral_code")
        .eq("id", context.userId as never)
        .maybeSingle(),
      context.supabase
        .from("referral_attributions" as never)
        .select("id, referred_user_id, referral_code, status, qualified_at, created_at")
        .eq("referrer_user_id", context.userId as never)
        .order("created_at", { ascending: false })
        .limit(100),
      context.supabase
        .from("referral_rewards" as never)
        .select("amount, currency, status, created_at, paid_at")
        .eq("user_id", context.userId as never)
        .order("created_at", { ascending: false })
        .limit(100),
      context.supabase
        .from("system_settings")
        .select("key, value")
        .in("key", [
          "referral_campaign_enabled",
          "referral_reward_type",
          "referral_reward_amount",
          "referral_qualification_condition",
        ]),
    ]);
    for (const result of [profile, invited, rewards, settings]) {
      if (result.error) throw new Error(result.error.message);
    }
    const rewardRows = (rewards.data ?? []) as { amount: number | string; status: string }[];
    return {
      referralCode:
        (profile.data as { referral_code?: string | null } | null)?.referral_code ?? code,
      referralLink: `https://t.me/wtron_bot?start=${(profile.data as { referral_code?: string | null } | null)?.referral_code ?? code}`,
      invitedUsers: invited.data ?? [],
      qualifiedReferrals:
        invited.data?.filter((row: { status?: string }) => row.status === "qualified").length ?? 0,
      pendingEarnings: sumRows(
        rewardRows.filter((row) => row.status === "pending"),
        (row) => row.amount,
      ),
      paidEarnings: sumRows(
        rewardRows.filter((row) => row.status === "paid"),
        (row) => row.amount,
      ),
      totalReferralEarnings: sumRows(rewardRows, (row) => row.amount),
      settings: settings.data ?? [],
    };
  });

export const recordReferralAttribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => referralInput.parse(input))
  .handler(async ({ data, context }) => {
    const code = data.referralCode.toLowerCase();
    const { data: referrer, error } = await context.supabase
      .from("profiles" as never)
      .select("id, referral_code")
      .ilike("referral_code", code)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const referrerId = (referrer as { id?: string } | null)?.id;
    if (!referrerId) throw new Error("Referral code not found");
    if (referrerId === context.userId) throw new Error("Self-referral is not allowed");
    const { error: insertError } = await context.supabase
      .from("referral_attributions" as never)
      .insert({
        referrer_user_id: referrerId,
        referred_user_id: context.userId,
        referral_code: code,
        source: data.source,
        status: "pending",
      } as never);
    if (insertError) throw new Error(insertError.message);
    return { ok: true };
  });
