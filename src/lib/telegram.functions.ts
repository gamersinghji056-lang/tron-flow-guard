import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const initDataInput = z.object({
  initData: z.string().min(16).max(4096),
});

const sessionInput = initDataInput.extend({
  handoff: z.string().min(32).max(256).optional(),
});

const miniAuthInput = initDataInput.extend({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(72),
});

const depositInput = initDataInput.extend({
  amount: z.number().positive().max(1_000_000),
});

const adminStatusInput = z.object({
  telegramAccountId: z.string().uuid(),
  status: z.enum(["active", "disabled", "unlinked"]),
  reason: z.string().trim().max(500).optional(),
});

export const verifyTelegramMiniApp = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => initDataInput.parse(input))
  .handler(async ({ data }) => {
    const { readTelegramAccount } = await import("@/lib/telegram.server");
    const result = await readTelegramAccount(data.initData);
    const { hasActiveTelegramSession } = await import("@/lib/telegram.server");
    const authorized =
      result.account?.status === "active"
        ? await hasActiveTelegramSession(result.verified.telegramUser.id)
        : false;
    return {
      linked: result.account?.status === "active",
      authorized,
      disabled: result.account?.status === "disabled",
      telegramUser: {
        id: result.verified.telegramUser.id,
        username: result.verified.telegramUser.username ?? null,
        firstName: result.verified.telegramUser.first_name ?? null,
        lastName: result.verified.telegramUser.last_name ?? null,
      },
      account: result.account
        ? {
            id: result.account.id,
            userId: result.account.user_id,
            status: result.account.status,
            linkedAt: result.account.linked_at,
          }
        : null,
    };
  });

export const loginTelegramMiniApp = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => miniAuthInput.parse(input))
  .handler(async ({ data }) => {
    const { authenticateAndLinkTelegramMiniApp } = await import("@/lib/telegram.server");
    const account = await authenticateAndLinkTelegramMiniApp(data);
    return {
      ok: true,
      userId: account.user_id,
      telegramUserId: account.telegram_user_id,
      status: account.status,
    };
  });

export const registerTelegramMiniApp = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => miniAuthInput.parse(input))
  .handler(async ({ data }) => {
    const { registerAndLinkTelegramMiniApp } = await import("@/lib/telegram.server");
    const result = await registerAndLinkTelegramMiniApp(data);
    return {
      ok: true,
      userId: result.account.user_id,
      telegramUserId: result.account.telegram_user_id,
      status: result.account.status,
      canSignInNow: result.registration.canSignInNow,
      emailVerificationRequired: result.registration.emailVerificationRequired,
    };
  });

export const createTelegramMiniAppSession = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => sessionInput.parse(input))
  .handler(async ({ data }) => {
    const { issueTelegramSupabaseSession } = await import("@/lib/telegram.server");
    return issueTelegramSupabaseSession(data.initData, data.handoff);
  });

export const linkTelegramMiniAppAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => initDataInput.parse(input))
  .handler(async ({ data, context }) => {
    const { linkTelegramUser } = await import("@/lib/telegram.server");
    const account = await linkTelegramUser({ initData: data.initData, userId: context.userId });
    return {
      id: account.id,
      userId: account.user_id,
      telegramUserId: account.telegram_user_id,
      status: account.status,
      linkedAt: account.linked_at,
    };
  });

export const fetchTelegramHome = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => initDataInput.parse(input))
  .handler(async ({ data }) => {
    const { fetchTelegramOverview } = await import("@/lib/telegram.server");
    return fetchTelegramOverview(data.initData);
  });

export const fetchTelegramWallet = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => initDataInput.parse(input))
  .handler(async ({ data }) => {
    const { fetchTelegramOverview, fetchTelegramDepositAddress, fetchTelegramDeposits } =
      await import("@/lib/telegram.server");
    const [overview, address, deposits] = await Promise.all([
      fetchTelegramOverview(data.initData),
      fetchTelegramDepositAddress(data.initData),
      fetchTelegramDeposits(data.initData),
    ]);
    return { ...overview, depositAddress: address, deposits };
  });

export const fetchTelegramP2p = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => initDataInput.parse(input))
  .handler(async ({ data }) => {
    const { fetchTelegramMarketplace, fetchTelegramOverview } =
      await import("@/lib/telegram.server");
    const [marketplace, overview] = await Promise.all([
      fetchTelegramMarketplace(data.initData),
      fetchTelegramOverview(data.initData),
    ]);
    return { marketplace, orders: overview.orders };
  });

export const fetchTelegramDeposits = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => initDataInput.parse(input))
  .handler(async ({ data }) => {
    const { fetchTelegramDeposits: loadDeposits, fetchTelegramDepositAddress } =
      await import("@/lib/telegram.server");
    const [deposits, depositAddress] = await Promise.all([
      loadDeposits(data.initData),
      fetchTelegramDepositAddress(data.initData),
    ]);
    return { deposits, depositAddress };
  });

export const createTelegramDeposit = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => depositInput.parse(input))
  .handler(async ({ data }) => {
    const { createTelegramDepositRequest } = await import("@/lib/telegram.server");
    return createTelegramDepositRequest({ initData: data.initData, amount: data.amount });
  });

export const fetchAdminTelegramOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireAdmin } = await import("@/lib/admin.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requireAdmin(context.supabase, context.userId);
    const [health, accounts, queue, audit] = await Promise.all([
      supabaseAdmin
        .from("telegram_bot_health")
        .select("*")
        .order("updated_at", { ascending: false }),
      supabaseAdmin
        .from("telegram_accounts")
        .select(
          "id, user_id, telegram_user_id, username, first_name, last_name, status, linked_at, last_seen_at",
        )
        .order("linked_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("telegram_notification_queue")
        .select(
          "id, user_id, event, title, status, attempts, next_retry_at, last_error, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("telegram_link_audit")
        .select("id, user_id, telegram_user_id, action, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    const userIds = [...new Set((accounts.data ?? []).map((row) => row.user_id).filter(Boolean))];
    const { data: profiles } = userIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, email, full_name")
          .in("id", userIds as never)
      : { data: [] };
    const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
    return {
      health: health.data ?? [],
      accounts: (accounts.data ?? []).map((account) => ({
        ...account,
        profile: profileMap.get(account.user_id) ?? null,
      })),
      queue: queue.data ?? [],
      audit: audit.data ?? [],
    };
  });

export const setTelegramAccountStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => adminStatusInput.parse(input))
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("@/lib/admin.server");
    await requireAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.rpc(
      "admin_set_telegram_account_status" as never,
      {
        _telegram_account_id: data.telegramAccountId,
        _status: data.status,
        _reason: data.reason ?? null,
      } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
