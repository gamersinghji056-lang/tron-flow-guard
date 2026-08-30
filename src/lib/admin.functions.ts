/**
 * Admin-only operations: P2P wallet assignment, trader directory and the
 * platform fee / broadcast settings.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const assignInput = z.object({
  walletId: z.string().uuid(),
  traderId: z.string().uuid().nullable(),
});

const settingsInput = z.object({
  transferFee: z.number().min(0).max(1000).optional(),
  feeWalletAddress: z
    .string()
    .trim()
    .regex(/^(T[1-9A-HJ-NP-Za-km-z]{33})?$/, "Enter a valid TRON address or leave empty")
    .optional(),
  onchainBroadcast: z.boolean().optional(),
  feeCollectionWalletId: z.string().uuid().nullable().optional(),
  feeCollectionWalletIdMainnet: z.string().uuid().nullable().optional(),
  feeCollectionWalletIdNile: z.string().uuid().nullable().optional(),
  usdtTotalTransferFee: z.number().min(0).max(1000).optional(),
  tronEnergyRouteEnabled: z.boolean().optional(),
  tronEnergyProvider: z.enum(["tronrental"]).optional(),
  tronEnergyBufferPercent: z.number().min(0).max(100).optional(),
  usdtTrxTransferFeeMargin: z.number().min(0).max(1000).optional(),
  trxMinTransferFee: z.number().min(0).max(1000).optional(),
  trxMaxTransferFee: z.number().min(0).max(1000).optional(),
  trxTransferFeeMargin: z.number().min(0).max(1000).optional(),
  vendorBuyerFeePercent: z.number().min(0).max(20).optional(),
  vendorSellerFeePercent: z.number().min(0).max(20).optional(),
  wtronBuyRateInr: z.number().min(0).optional(),
  directSellFeePercent: z.number().min(0).max(20).optional(),
  withdrawalFeeUsdt: z.number().min(0).max(1000).optional(),
  onChainSendEnabled: z.boolean().optional(),
  tronSigningMainnetEnabled: z.boolean().optional(),
  feeSweepEnabled: z.boolean().optional(),
  feeSweepMode: z.enum(["manual", "automatic"]).optional(),
  feeSweepMinimumUsdt: z.number().min(0).max(1_000_000).optional(),
  gasfreeTransferEnabled: z.boolean().optional(),
  gasfreeProvider: z.string().trim().min(1).max(80).optional(),
  gasfreeMainnetEnabled: z.boolean().optional(),
  gasfreeSupportedAsset: z.enum(["USDT"]).optional(),
  gasfreePerTxMaxUsdt: z.number().min(0).max(1_000_000).optional(),
  gasfreeUserDailyMaxUsdt: z.number().min(0).max(10_000_000).optional(),
  gasfreeGlobalDailyMaxUsdt: z.number().min(0).max(100_000_000).optional(),
  gasfreeKillSwitch: z.boolean().optional(),
  gasfreeProviderFeePolicy: z.string().trim().min(1).max(80).optional(),
  gasfreeWtronFeePolicy: z.string().trim().min(1).max(80).optional(),
  referralCampaignEnabled: z.boolean().optional(),
  referralDirectRatePercent: z.number().min(0.1).max(0.2).optional(),
  referralEligibleP2pEnabled: z.boolean().optional(),
  referralEligibleDirectSellEnabled: z.boolean().optional(),
});

const feeSweepInput = z.object({
  destinationWalletId: z.string().uuid(),
  amount: z.number().positive().max(1_000_000),
  idempotencyKey: z.string().trim().min(8).max(120),
});

const companyWalletInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(60),
  address: z.string().trim(),
  network: z.enum(["trc20-mainnet", "trc20-nile"]),
  purpose: z
    .enum(["USER_DEPOSIT", "DIRECT_SELL", "FEE_COLLECTION", "HOT", "OTHER"])
    .default("USER_DEPOSIT"),
  priority: z.number().int().min(0).max(10000).default(100),
  minDeposit: z.number().positive().nullable().optional(),
  maxDeposit: z.number().positive().nullable().optional(),
});

const companyWalletStatusInput = z.object({
  walletId: z.string().uuid(),
  isActive: z.boolean(),
});

const companyWalletDefaultInput = z.object({
  walletId: z.string().uuid(),
  network: z.enum(["trc20-mainnet", "trc20-nile"]),
});

const gasfreeWalletDiagnosticsInput = z
  .object({
    limit: z.number().int().min(1).max(100).optional(),
  })
  .optional();

const nileTestWalletAccessInput = z.object({
  userId: z.string().uuid(),
  enabled: z.boolean(),
  reason: z.string().trim().max(160).optional(),
});

export const listTraders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { fetchTraders } = await import("@/lib/admin.server");
    const { requirePermission } = await import("@/lib/access.server");
    const { PERMISSIONS } = await import("@/lib/rbac");
    await requirePermission(context.supabase, context.userId, PERMISSIONS.USERS_READ);
    return fetchTraders();
  });

export const assignCompanyWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => assignInput.parse(data))
  .handler(async ({ data, context }) => {
    const { assignWallet } = await import("@/lib/admin.server");
    const { requirePermission } = await import("@/lib/access.server");
    const { PERMISSIONS } = await import("@/lib/rbac");
    await requirePermission(context.supabase, context.userId, PERMISSIONS.WALLETS_MANAGE);
    return assignWallet(data.walletId, data.traderId, context.userId);
  });

export const updatePlatformSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => settingsInput.parse(data))
  .handler(async ({ data, context }) => {
    const { writeSettings } = await import("@/lib/admin.server");
    const { requirePermission } = await import("@/lib/access.server");
    const { PERMISSIONS } = await import("@/lib/rbac");
    await requirePermission(context.supabase, context.userId, PERMISSIONS.SETTINGS_MANAGE);
    return writeSettings(data);
  });

export const createManualFeeSweep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => feeSweepInput.parse(data))
  .handler(async ({ data, context }) => {
    const { requirePermission } = await import("@/lib/access.server");
    const { PERMISSIONS } = await import("@/lib/rbac");
    await requirePermission(context.supabase, context.userId, PERMISSIONS.FEES_SWEEP);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sweep, error } = await supabaseAdmin.rpc(
      "create_manual_fee_sweep" as never,
      {
        _destination_wallet_id: data.destinationWalletId,
        _amount: data.amount,
        _idempotency_key: data.idempotencyKey,
      } as never,
    );
    if (error) throw new Error(error.message);
    return sweep;
  });

export const testGasFreeProviderConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requirePermission } = await import("@/lib/access.server");
    const { PERMISSIONS } = await import("@/lib/rbac");
    await requirePermission(context.supabase, context.userId, PERMISSIONS.SETTINGS_MANAGE);
    const { getAdminGasFreeDiagnostics } = await import("@/lib/gasfree-provider.server");
    return getAdminGasFreeDiagnostics();
  });

export const getAdminGasFreeWalletDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => gasfreeWalletDiagnosticsInput.parse(data))
  .handler(async ({ data, context }) => {
    const { requirePermission } = await import("@/lib/access.server");
    const { PERMISSIONS } = await import("@/lib/rbac");
    await requirePermission(context.supabase, context.userId, PERMISSIONS.WALLETS_READ);
    const { getAdminGasFreeWalletDiagnostics: getDiagnostics } =
      await import("@/lib/gasfree-provider.server");
    return getDiagnostics(data?.limit ?? 50);
  });

export const setNileTestWalletAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => nileTestWalletAccessInput.parse(data))
  .handler(async ({ data, context }) => {
    const { requirePermission } = await import("@/lib/access.server");
    const { PERMISSIONS } = await import("@/lib/rbac");
    await requirePermission(context.supabase, context.userId, PERMISSIONS.WALLETS_MANAGE);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("nile_test_wallet_users" as never).upsert(
      {
        user_id: data.userId,
        enabled: data.enabled,
        enabled_by: context.userId,
        reason: data.reason ?? null,
        enabled_at: new Date().toISOString(),
      } as never,
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      actor_type: "admin",
      action: data.enabled ? "nile_test_wallet.enabled" : "nile_test_wallet.disabled",
      entity_type: "user",
      entity_id: data.userId,
      metadata: { reason: data.reason ?? null } as never,
    });
    return { ok: true };
  });

export const getAdminDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { fetchAdminDashboard } = await import("@/lib/admin.server");
    const { requirePermission } = await import("@/lib/access.server");
    const { PERMISSIONS } = await import("@/lib/rbac");
    await requirePermission(context.supabase, context.userId, PERMISSIONS.DASHBOARD_READ);
    return fetchAdminDashboard();
  });

export const getAdminReferralOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requirePermission } = await import("@/lib/access.server");
    const { PERMISSIONS } = await import("@/lib/rbac");
    await requirePermission(context.supabase, context.userId, PERMISSIONS.SETTINGS_MANAGE);
    const { data, error } = await context.supabase.rpc("admin_referral_overview" as never);
    if (error) throw new Error(error.message);
    return data;
  });

export const addCompanyWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => companyWalletInput.parse(data))
  .handler(async ({ data, context }) => {
    const { createCompanyWallet } = await import("@/lib/admin.server");
    const { requirePermission } = await import("@/lib/access.server");
    const { PERMISSIONS } = await import("@/lib/rbac");
    await requirePermission(context.supabase, context.userId, PERMISSIONS.WALLETS_MANAGE);
    return createCompanyWallet({ ...data, actorId: context.userId });
  });

export const updateCompanyWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => companyWalletInput.required({ id: true }).parse(data))
  .handler(async ({ data, context }) => {
    const { saveCompanyWallet } = await import("@/lib/admin.server");
    const { requirePermission } = await import("@/lib/access.server");
    const { PERMISSIONS } = await import("@/lib/rbac");
    await requirePermission(context.supabase, context.userId, PERMISSIONS.WALLETS_MANAGE);
    return saveCompanyWallet({ ...data, actorId: context.userId });
  });

export const setCompanyWalletActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => companyWalletStatusInput.parse(data))
  .handler(async ({ data, context }) => {
    const { updateCompanyWalletStatus } = await import("@/lib/admin.server");
    const { requirePermission } = await import("@/lib/access.server");
    const { PERMISSIONS } = await import("@/lib/rbac");
    await requirePermission(context.supabase, context.userId, PERMISSIONS.WALLETS_MANAGE);
    return updateCompanyWalletStatus({ ...data, actorId: context.userId });
  });

export const makeCompanyWalletDefault = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => companyWalletDefaultInput.parse(data))
  .handler(async ({ data, context }) => {
    const { setDefaultCompanyWallet } = await import("@/lib/admin.server");
    const { requirePermission } = await import("@/lib/access.server");
    const { PERMISSIONS } = await import("@/lib/rbac");
    await requirePermission(context.supabase, context.userId, PERMISSIONS.WALLETS_MANAGE);
    return setDefaultCompanyWallet({ ...data, actorId: context.userId });
  });
