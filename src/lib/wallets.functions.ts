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
const refreshWalletInput = walletIdInput.extend({
  forceGasfreeCheck: z.boolean().optional(),
});

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

const transferPreviewInput = transferInput.omit({
  transactionPassword: true,
  idempotencyKey: true,
  memo: true,
});

const gasfreeReadinessInput = z.object({
  walletId: z.string().uuid(),
});

const gasfreeTransferInput = z.object({
  walletId: z.string().uuid(),
  recipient: z
    .string()
    .trim()
    .regex(/^T[1-9A-HJ-NP-Za-km-z]{33}$/, "Enter a valid TRON address"),
  amount: z.number().positive("Amount must be greater than zero").max(1_000_000),
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
    const result = await importPersonalWallet({
      userId: context.userId,
      name: data.name,
      network: data.network,
      walletType: data.walletType,
      makeDefault: data.makeDefault ?? false,
      transactionPassword: data.transactionPassword,
      mnemonic: data.mnemonic,
      networkConfirmed: data.networkConfirmed ?? false,
    });
    return result as never;
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

export const getWalletSecurityStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { hasTransactionPassword } = await import("@/lib/wallet-security.server");
    const { hasNileTestWalletAccess } = await import("@/lib/wallets.server");
    return {
      transactionPasswordEnabled: await hasTransactionPassword(context.userId),
      nileTestWalletEnabled: await hasNileTestWalletAccess(context.userId),
    };
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
    const { refreshWalletGasfreeCapability } = await import("@/lib/wallets.server");
    await refreshWalletGasfreeCapability(context.userId, data.walletId).catch(() => undefined);
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
  .inputValidator((data: unknown) => refreshWalletInput.parse(data))
  .handler(async ({ data, context }) => {
    const { refreshPersonalWalletOnChainBalance } = await import("@/lib/wallets.server");
    return refreshPersonalWalletOnChainBalance(context.userId, data.walletId, {
      forceGasfreeCheck: data.forceGasfreeCheck === true,
    });
  });

export const checkWalletGasFreeCapability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => walletIdInput.parse(data))
  .handler(async ({ data, context }) => {
    const { refreshWalletGasfreeCapability } = await import("@/lib/wallets.server");
    return refreshWalletGasfreeCapability(context.userId, data.walletId, { force: true });
  });

export const discoverWalletGasFreeAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => walletIdInput.parse(data))
  .handler(async ({ data, context }) => {
    const { ensureGasFreeChildWalletForGeneral } = await import("@/lib/wallets.server");
    return (await ensureGasFreeChildWalletForGeneral(context.userId, data.walletId)) as never;
  });

export const getGasFreeSendReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => gasfreeReadinessInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getGasFreeTransferReadiness } = await import("@/lib/gasfree-provider.server");
    const { hasNileTestWalletAccess } = await import("@/lib/wallets.server");
    const { data: wallet, error } = await supabaseAdmin
      .from("user_wallets" as never)
      .select("id, user_id, network, wallet_type, wallet_role, parent_wallet_id, is_archived")
      .eq("id", data.walletId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = wallet as {
      user_id?: string | null;
      network?: "trc20-mainnet" | "trc20-nile" | null;
      wallet_type?: string | null;
      wallet_role?: string | null;
      parent_wallet_id?: string | null;
      is_archived?: boolean | null;
    } | null;
    if (!row || row.user_id !== context.userId || row.is_archived)
      throw new Error("Wallet not found");
    const { data: parent, error: parentError } =
      row.wallet_role === "gasfree" && row.parent_wallet_id
        ? await supabaseAdmin
            .from("user_wallets" as never)
            .select("id, user_id, address, network, is_archived")
            .eq("id", row.parent_wallet_id as never)
            .maybeSingle()
        : { data: null, error: null };
    if (parentError) throw new Error(parentError.message);
    const parentRow = parent as {
      user_id?: string | null;
      address?: string | null;
      network?: "trc20-mainnet" | "trc20-nile" | null;
      is_archived?: boolean | null;
    } | null;
    const generalAddress =
      parentRow?.user_id === context.userId && parentRow.is_archived !== true && parentRow.address
        ? parentRow.address
        : undefined;
    const nileTestAuthorized =
      row.network === "trc20-nile" ? await hasNileTestWalletAccess(context.userId) : false;
    const readiness = await getGasFreeTransferReadiness({
      network: row.network ?? "trc20-mainnet",
      asset: "USDT",
      ...(generalAddress ? { generalAddress } : {}),
      allowTestnet: nileTestAuthorized,
      userId: context.userId,
    });
    return {
      ...readiness,
      platformFee: Number(readiness.providerFee ?? 0),
    };
  });

export const createGasFreeTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => gasfreeTransferInput.parse(data))
  .handler(async ({ data, context }) => {
    const { createGasFreeTransferRequest } = await import("@/lib/gasfree-provider.server");
    return createGasFreeTransferRequest({
      userId: context.userId,
      walletId: data.walletId,
      recipient: data.recipient,
      amount: data.amount,
      transactionPassword: data.transactionPassword,
      idempotencyKey: data.idempotencyKey,
    }) as never;
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

export const previewTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => transferPreviewInput.parse(data))
  .handler(async ({ data, context }) => {
    const { previewPersonalSendCost } = await import("@/lib/signer.server");
    return previewPersonalSendCost({
      userId: context.userId,
      walletId: data.walletId,
      asset: data.asset,
      toAddress: data.toAddress,
      amount: data.amount,
    });
  });

export const quoteTransfer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { readTransferFee } = await import("@/lib/wallets.server");
    return { fee: await readTransferFee() };
  });
