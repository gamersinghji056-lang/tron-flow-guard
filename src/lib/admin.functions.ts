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
