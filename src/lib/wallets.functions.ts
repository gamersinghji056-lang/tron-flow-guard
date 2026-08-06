/**
 * Personal wallet server functions.
 *
 * Thin RPC wrappers only — all runtime helpers live in server-only modules that
 * are imported inside the handlers so nothing leaks into the client bundle.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const createWalletInput = z.object({
  name: z.string().trim().min(1, "Wallet name is required").max(48),
  network: z.enum(["trc20-mainnet", "trc20-nile"]),
  makeDefault: z.boolean().optional(),
});

const walletIdInput = z.object({ walletId: z.string().uuid() });

const renameInput = z.object({
  walletId: z.string().uuid(),
  name: z.string().trim().min(1).max(48),
});

const transferInput = z.object({
  walletId: z.string().uuid(),
  toAddress: z
    .string()
    .trim()
    .regex(/^T[1-9A-HJ-NP-Za-km-z]{33}$/, "Enter a valid TRON (TRC20) address"),
  amount: z.number().positive("Amount must be greater than zero").max(1_000_000),
  memo: z.string().trim().max(140).optional(),
});

export const createWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createWalletInput.parse(data))
  .handler(async ({ data, context }) => {
    const { provisionWallet } = await import("@/lib/wallets.server");
    return provisionWallet({
      userId: context.userId,
      name: data.name,
      network: data.network,
      makeDefault: data.makeDefault ?? false,
    });
  });

export const renameWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => renameInput.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("user_wallets")
      .update({ name: data.name })
      .eq("id", data.walletId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setDefaultWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => walletIdInput.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("user_wallets")
      .update({ is_default: true })
      .eq("id", data.walletId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const archiveWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => walletIdInput.parse(data))
  .handler(async ({ data, context }) => {
    const { archiveOwnedWallet } = await import("@/lib/wallets.server");
    return archiveOwnedWallet(context.userId, data.walletId);
  });

export const sendTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => transferInput.parse(data))
  .handler(async ({ data, context }) => {
    const { executeTransfer } = await import("@/lib/wallets.server");
    return executeTransfer(context.supabase, context.userId, data);
  });

export const quoteTransfer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { readTransferFee } = await import("@/lib/wallets.server");
    return { fee: await readTransferFee() };
  });
