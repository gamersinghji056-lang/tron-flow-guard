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
  accountType: z.enum(["trader", "vendor"]).default("trader"),
  businessName: z.string().trim().min(2).max(120).optional(),
});

function compactMiniAuthInput(data: z.infer<typeof miniAuthInput>) {
  return data.businessName
    ? { ...data, businessName: data.businessName }
    : {
        initData: data.initData,
        email: data.email,
        password: data.password,
        accountType: data.accountType,
      };
}

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
    const { readTelegramAccount, resolveTelegramRoleState } = await import("@/lib/telegram.server");
    const result = await readTelegramAccount(data.initData);
    const roleState = await resolveTelegramRoleState(result.verified.telegramUser.id);
    return {
      linked: result.account?.status === "active",
      authorized: roleState.authorized,
      disabled: result.account?.status === "disabled",
      accountType: roleState.accountType,
      vendorStatus: roleState.vendorStatus,
      state: roleState.state,
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
    const { readPlatformRoleState } = await import("@/lib/telegram.server");
    const roleState = await readPlatformRoleState(account.user_id);
    return {
      ok: true,
      userId: account.user_id,
      telegramUserId: account.telegram_user_id,
      status: account.status,
      accountType: roleState.accountType,
      vendorStatus: roleState.vendorStatus,
    };
  });

export const registerTelegramMiniApp = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => miniAuthInput.parse(input))
  .handler(async ({ data }) => {
    const { registerAndLinkTelegramMiniApp } = await import("@/lib/telegram.server");
    const result = await registerAndLinkTelegramMiniApp(compactMiniAuthInput(data));
    const { readPlatformRoleState } = await import("@/lib/telegram.server");
    const roleState = await readPlatformRoleState(result.account.user_id);
    return {
      ok: true,
      userId: result.account.user_id,
      telegramUserId: result.account.telegram_user_id,
      status: result.account.status,
      canSignInNow: result.registration.canSignInNow,
      emailVerificationRequired: result.registration.emailVerificationRequired,
      accountType: roleState.accountType,
      vendorStatus: roleState.vendorStatus,
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
    const { fetchTelegramHomeSummary } = await import("@/lib/telegram.server");
    return fetchTelegramHomeSummary(data.initData);
  });

export const fetchTelegramWallet = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => initDataInput.parse(input))
  .handler(async ({ data }) => {
    const { fetchTelegramWalletSummary, fetchTelegramDepositAddress, fetchTelegramDeposits } =
      await import("@/lib/telegram.server");
    const [overview, address, deposits] = await Promise.all([
      fetchTelegramWalletSummary(data.initData),
      fetchTelegramDepositAddress(data.initData),
      fetchTelegramDeposits(data.initData),
    ]);
    return { ...overview, depositAddress: address, deposits };
  });

export const fetchTelegramP2p = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => initDataInput.parse(input))
  .handler(async ({ data }) => {
    const { fetchTelegramMarketplace, fetchTelegramP2pOrders } =
      await import("@/lib/telegram.server");
    const [marketplace, overview] = await Promise.all([
      fetchTelegramMarketplace(data.initData),
      fetchTelegramP2pOrders(data.initData),
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
    const { requirePermission } = await import("@/lib/access.server");
    const { PERMISSIONS } = await import("@/lib/rbac");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await requirePermission(context.supabase, context.userId, PERMISSIONS.SYSTEM_HEALTH_READ);
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
    const { requirePermission } = await import("@/lib/access.server");
    const { PERMISSIONS } = await import("@/lib/rbac");
    await requirePermission(context.supabase, context.userId, PERMISSIONS.SYSTEM_HEALTH_MANAGE);
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
