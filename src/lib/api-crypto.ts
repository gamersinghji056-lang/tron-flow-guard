import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const API_KEY_PREFIX = "tfg_live";

export interface GeneratedApiKey {
  keyId: string;
  secret: string;
  plaintext: string;
}

export function createPlaintextApiKey(): GeneratedApiKey {
  const keyId = randomBytes(8).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  return {
    keyId,
    secret,
    plaintext: `${API_KEY_PREFIX}_${keyId}_${secret}`,
  };
}

export function parsePlaintextApiKey(value: string): { keyId: string; secret: string } | null {
  const trimmed = value.trim();
  const prefix = `${API_KEY_PREFIX}_`;
  if (!trimmed.startsWith(prefix)) return null;
  const rest = trimmed.slice(prefix.length);
  const sep = rest.indexOf("_");
  if (sep <= 0) return null;
  const keyId = rest.slice(0, sep);
  const secret = rest.slice(sep + 1);
  if (!/^[a-f0-9]{16}$/i.test(keyId) || secret.length < 32) return null;
  return { keyId, secret };
}

export function hashApiSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export function verifyApiSecret(secret: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashApiSecret(secret), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function hasApiScope(
  granted: readonly string[] | null | undefined,
  required: string,
): boolean {
  if (!Array.isArray(granted)) return false;
  return granted.includes("*") || granted.includes(required);
}
