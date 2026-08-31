import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  evaluateTransferPolicy,
  transferPolicySettingKey,
  type TransferPolicyEvaluation,
  type TransferPolicyKind,
  type TransferPolicySettings,
  type UserTransferControlLike,
} from "@/lib/transfer-control-policy";

export type { TransferPolicyEvaluation, TransferPolicyKind };

export async function readTransferPolicySettings(kind: TransferPolicyKind) {
  const { data, error } = await supabaseAdmin
    .from("system_settings" as never)
    .select("key, value")
    .in("key", ["wallet_transfers_enabled", transferPolicySettingKey(kind)] as never);
  if (error) throw new Error(error.message);
  return Object.fromEntries(
    ((data ?? []) as Array<{ key?: string | null; value?: unknown }>).map((row) => [
      row.key,
      row.value,
    ]),
  ) as TransferPolicySettings;
}

export async function readUserTransferControl(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_transfer_controls" as never)
    .select(
      "all_transfers_enabled, normal_usdt_enabled, normal_trx_enabled, gasfree_usdt_enabled, reason",
    )
    .eq("user_id", userId as never)
    .maybeSingle();
  if (error && error.code !== "42P01") throw new Error(error.message);
  return data as UserTransferControlLike | null;
}

export async function evaluateUserTransferPolicy(input: {
  userId: string;
  kind: TransferPolicyKind;
}) {
  const [settings, userControl] = await Promise.all([
    readTransferPolicySettings(input.kind),
    readUserTransferControl(input.userId),
  ]);
  return evaluateTransferPolicy({ kind: input.kind, settings, userControl });
}

export async function assertUserTransferPolicyAllowed(input: {
  userId: string;
  kind: TransferPolicyKind;
}) {
  const policy = await evaluateUserTransferPolicy(input);
  if (!policy.allowed) {
    throw new Error(
      policy.blockedBy === "user"
        ? policy.reason || "TRANSFERS_UNAVAILABLE_FOR_ACCOUNT"
        : "TRANSFERS_TEMPORARILY_UNAVAILABLE",
    );
  }
  return policy;
}
