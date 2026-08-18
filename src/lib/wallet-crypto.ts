import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

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
