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
  walletType: z.enum(["standard", "gasfree"]).default("standard"),
  makeDefault: z.boolean().optional(),
  transactionPassword: z.string().min(6).max(128),
});

const importWalletInput = createWalletInput.extend({
  mnemonic: z.string().trim().min(24).max(512),
  networkConfirmed: z.boolean().optional(),
});

const walletIdInput = z.object({ walletId: z.string().uuid() });

const renameInput = z.object({
  walletId: z.string().uuid(),
  name: z.string().trim().min(1).max(48),
});

const transferInput = z.object({
  walletId: z.string().uuid(),
  asset: z.enum(["USDT", "TRX"]).default("USDT"),
  toAddress: z
    .string()
    .trim()
    .regex(/^T[1-9A-HJ-NP-Za-km-z]{33}$/, "Enter a valid TRON address"),
  amount: z.number().positive("Amount must be greater than zero").max(1_000_000),
  memo: z.string().trim().max(140).optional(),
  transactionPassword: z.string().min(6).max(128),
  idempotencyKey: z.string().trim().min(8).max(120),
});

const transactionPasswordInput = z.object({
  password: z.string().min(6).max(128),
  currentPassword: z.string().min(6).max(128).optional(),
});

const revealInput = walletIdInput.extend({
  transactionPassword: z.string().min(6).max(128),
});

export const createWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createWalletInput.parse(data))
  .handler(async ({ data, context }) => {
    const { provisionPersonalWallet } = await import("@/lib/wallets.server");
    return provisionPersonalWallet({
      userId: context.userId,
      name: data.name,
      network: data.network,
      walletType: data.walletType,
      makeDefault: data.makeDefault ?? false,
      transactionPassword: data.transactionPassword,
    });
  });

export const importWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => importWalletInput.parse(data))
  .handler(async ({ data, context }) => {
    const { importPersonalWallet } = await import("@/lib/wallets.server");
    return importPersonalWallet({
      userId: context.userId,
      name: data.name,
      network: data.network,
      walletType: data.walletType,
      makeDefault: data.makeDefault ?? false,
      transactionPassword: data.transactionPassword,
      mnemonic: data.mnemonic,
      networkConfirmed: data.networkConfirmed ?? false,
    });
  });

export const setWalletTransactionPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => transactionPasswordInput.parse(data))
  .handler(async ({ data, context }) => {
    const { setTransactionPassword } = await import("@/lib/wallet-security.server");
    await setTransactionPassword({
      userId: context.userId,
      password: data.password,
      ...(data.currentPassword ? { currentPassword: data.currentPassword } : {}),
    });
    return { ok: true };
  });

export const revealRecoveryPhrase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => revealInput.parse(data))
  .handler(async ({ data, context }) => {
    const { revealWalletRecoveryPhrase } = await import("@/lib/wallets.server");
    return revealWalletRecoveryPhrase({
      userId: context.userId,
      walletId: data.walletId,
      transactionPassword: data.transactionPassword,
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
      .update({ is_default: true, selected_at: new Date().toISOString() } as never)
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

export const refreshWalletBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => walletIdInput.parse(data))
  .handler(async ({ data, context }) => {
    const { refreshPersonalWalletOnChainBalance } = await import("@/lib/wallets.server");
    return refreshPersonalWalletOnChainBalance(context.userId, data.walletId);
  });

export const sendTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => transferInput.parse(data))
  .handler(async ({ data, context }) => {
    const { createAndBroadcastPersonalSend } = await import("@/lib/signer.server");
    return createAndBroadcastPersonalSend({
      userId: context.userId,
      walletId: data.walletId,
      asset: data.asset,
      toAddress: data.toAddress,
      amount: data.amount,
      transactionPassword: data.transactionPassword,
      idempotencyKey: data.idempotencyKey,
      memo: data.memo,
    });
  });

export const quoteTransfer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { readTransferFee } = await import("@/lib/wallets.server");
    return { fee: await readTransferFee() };
  });
