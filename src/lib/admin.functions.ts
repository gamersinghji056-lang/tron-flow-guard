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
});

const companyWalletInput = z.object({
  name: z.string().trim().min(1).max(60),
  address: z.string().trim(),
  network: z.enum(["trc20-mainnet", "trc20-nile"]),
});

const companyWalletStatusInput = z.object({
  walletId: z.string().uuid(),
  isActive: z.boolean(),
});

const companyWalletDefaultInput = z.object({
  walletId: z.string().uuid(),
  network: z.enum(["trc20-mainnet", "trc20-nile"]),
});

export const listTraders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireAdmin, fetchTraders } = await import("@/lib/admin.server");
    await requireAdmin(context.supabase, context.userId);
    return fetchTraders();
  });

export const assignCompanyWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => assignInput.parse(data))
  .handler(async ({ data, context }) => {
    const { requireAdmin, assignWallet } = await import("@/lib/admin.server");
    await requireAdmin(context.supabase, context.userId);
    return assignWallet(data.walletId, data.traderId, context.userId);
  });

export const updatePlatformSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => settingsInput.parse(data))
  .handler(async ({ data, context }) => {
    const { requireAdmin, writeSettings } = await import("@/lib/admin.server");
    await requireAdmin(context.supabase, context.userId);
    return writeSettings(data);
  });

export const getAdminDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireAdmin, fetchAdminDashboard } = await import("@/lib/admin.server");
    await requireAdmin(context.supabase, context.userId);
    return fetchAdminDashboard();
  });

export const addCompanyWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => companyWalletInput.parse(data))
  .handler(async ({ data, context }) => {
    const { requireAdmin, createCompanyWallet } = await import("@/lib/admin.server");
    await requireAdmin(context.supabase, context.userId);
    return createCompanyWallet({ ...data, actorId: context.userId });
  });

export const setCompanyWalletActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => companyWalletStatusInput.parse(data))
  .handler(async ({ data, context }) => {
    const { requireAdmin, updateCompanyWalletStatus } = await import("@/lib/admin.server");
    await requireAdmin(context.supabase, context.userId);
    return updateCompanyWalletStatus({ ...data, actorId: context.userId });
  });

export const makeCompanyWalletDefault = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => companyWalletDefaultInput.parse(data))
  .handler(async ({ data, context }) => {
    const { requireAdmin, setDefaultCompanyWallet } = await import("@/lib/admin.server");
    await requireAdmin(context.supabase, context.userId);
    return setDefaultCompanyWallet({ ...data, actorId: context.userId });
  });
