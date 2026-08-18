import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  hashTransactionPassword,
  shouldLockTransactionPassword,
  verifyTransactionPasswordHash,
} from "@/lib/transaction-password";

const LOCK_MS = 15 * 60_000;

function b64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

function fromB64(value: string) {
  return Buffer.from(value, "base64url");
}

function encryptionKey(password: string, salt: string) {
  return scryptSync(password, fromB64(salt), 32, {
    N: 16_384,
    r: 8,
    p: 1,
  });
}

export async function hasTransactionPassword(userId: string) {
  const { data } = await supabaseAdmin
    .from("transaction_passwords" as never)
    .select("user_id")
    .eq("user_id", userId as never)
    .maybeSingle();
  return Boolean(data);
}

export async function setTransactionPassword(input: {
  userId: string;
  password: string;
  currentPassword?: string;
}) {
  const { data: existing } = await supabaseAdmin
    .from("transaction_passwords" as never)
    .select("password_hash, salt, locked_until")
    .eq("user_id", input.userId as never)
    .maybeSingle();

  if (existing) {
    await verifyTransactionPasswordOrThrow(input.userId, input.currentPassword ?? "");
  }

  const { salt, passwordHash } = hashTransactionPassword(input.password);
  const { error } = await supabaseAdmin.from("transaction_passwords" as never).upsert(
    {
      user_id: input.userId,
      password_hash: passwordHash,
      salt,
      failed_attempts: 0,
      locked_until: null,
      changed_at: new Date().toISOString(),
    } as never,
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);

  await supabaseAdmin.from("notifications").insert({
    user_id: input.userId,
    audience: "trader",
    title: "Transaction password changed",
    body: "Your wallet security password was updated.",
    severity: "info",
  });
}

export async function verifyTransactionPasswordOrThrow(userId: string, password: string) {
  const { data, error } = await supabaseAdmin
    .from("transaction_passwords" as never)
    .select("password_hash, salt, failed_attempts, locked_until")
    .eq("user_id", userId as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Set a transaction password before using this wallet action");

  const row = data as {
    password_hash: string;
    salt: string;
    failed_attempts: number;
    locked_until: string | null;
  };
  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    throw new Error("Transaction password is temporarily locked. Try again later.");
  }

  if (!verifyTransactionPasswordHash(password, row.salt, row.password_hash)) {
    const attempts = Number(row.failed_attempts ?? 0) + 1;
    const lockedUntil = shouldLockTransactionPassword(attempts)
      ? new Date(Date.now() + LOCK_MS).toISOString()
      : null;
    await supabaseAdmin
      .from("transaction_passwords" as never)
      .update({ failed_attempts: attempts, locked_until: lockedUntil } as never)
      .eq("user_id", userId as never);
    throw new Error("Transaction password is incorrect");
  }

  await supabaseAdmin
    .from("transaction_passwords" as never)
    .update({ failed_attempts: 0, locked_until: null } as never)
    .eq("user_id", userId as never);
}

export function encryptMnemonic(mnemonic: string, password: string) {
  const kdfSalt = b64(randomBytes(16));
  const iv = randomBytes(12);
  const key = encryptionKey(password, kdfSalt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(mnemonic, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encryptedMnemonic: encrypted.toString("base64url"),
    iv: b64(iv),
    authTag: b64(authTag),
    kdfSalt,
  };
}

export function decryptMnemonic(input: {
  encryptedMnemonic: string;
  iv: string;
  authTag: string;
  kdfSalt: string;
  password: string;
}) {
  const key = encryptionKey(input.password, input.kdfSalt);
  const decipher = createDecipheriv("aes-256-gcm", key, fromB64(input.iv));
  decipher.setAuthTag(fromB64(input.authTag));
  return Buffer.concat([
    decipher.update(Buffer.from(input.encryptedMnemonic, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
