import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const TRANSACTION_PASSWORD_LOCK_THRESHOLD = 5;

function b64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

function fromB64(value: string) {
  return Buffer.from(value, "base64url");
}

function digest(password: string, salt: string) {
  return scryptSync(password, fromB64(salt), 64, { N: 16_384, r: 8, p: 1 }).toString("base64url");
}

export function hashTransactionPassword(password: string) {
  const salt = b64(randomBytes(16));
  return { salt, passwordHash: digest(password, salt) };
}

export function verifyTransactionPasswordHash(password: string, salt: string, expected: string) {
  const actual = Buffer.from(digest(password, salt), "base64url");
  const expectedBytes = Buffer.from(expected, "base64url");
  return actual.length === expectedBytes.length && timingSafeEqual(actual, expectedBytes);
}

export function shouldLockTransactionPassword(
  attempts: number,
  threshold = TRANSACTION_PASSWORD_LOCK_THRESHOLD,
) {
  return attempts >= threshold;
}
