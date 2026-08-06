/**
 * Deterministic TRON key/address derivation (server-only).
 *
 * Production-shaped HD wallet service: every personal wallet address is derived
 * from a single high-entropy master seed held in `WALLET_MASTER_SEED` plus the
 * owner id and a per-user derivation index. The same seed therefore yields the
 * same address forever and can sign outgoing transfers, which is exactly how a
 * custodial exchange hot-wallet cluster works.
 *
 * Swapping this module for BIP32/BIP44 (`m/44'/195'/0'/0/index`) or a KMS/HSM
 * backed signer requires no change anywhere else in the codebase.
 */
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { sha256 } from "@noble/hashes/sha2.js";

const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function base58Encode(bytes: Uint8Array): string {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);

  let out = "";
  while (value > 0n) {
    const rem = Number(value % 58n);
    value /= 58n;
    out = B58_ALPHABET[rem] + out;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = "1" + out;
  }
  return out;
}

function base58CheckEncode(payload: Uint8Array): string {
  const checksum = sha256(sha256(payload)).slice(0, 4);
  const full = new Uint8Array(payload.length + 4);
  full.set(payload, 0);
  full.set(checksum, payload.length);
  return base58Encode(full);
}

export interface DerivedWallet {
  address: string;
  hexAddress: string;
  /** Never leaves the server. Used only to sign outgoing transactions. */
  privateKeyHex: string;
}

function masterSeed(): Uint8Array {
  const seed = process.env["WALLET_MASTER_SEED"];
  if (!seed) {
    throw new Error(
      "WALLET_MASTER_SEED is not configured. Wallet address derivation is unavailable.",
    );
  }
  return new TextEncoder().encode(seed);
}

/** Derives the TRON keypair for `userId` at `index`. */
export function deriveWallet(userId: string, index: number): DerivedWallet {
  const seed = masterSeed();
  const material = new TextEncoder().encode(`|tron|${userId}|${index}`);
  const combined = new Uint8Array(seed.length + material.length);
  combined.set(seed, 0);
  combined.set(material, seed.length);

  // Reduce into the secp256k1 scalar field; retry on the (astronomically
  // unlikely) invalid-key case exactly like BIP32 does.
  let priv = sha256(combined);
  let attempts = 0;
  while (!secp256k1.utils.isValidSecretKey?.(priv) && attempts < 8) {
    priv = sha256(priv);
    attempts += 1;
  }

  const pub = secp256k1.getPublicKey(priv, false).slice(1); // drop 0x04
  const hashed = keccak_256(pub).slice(-20);
  const payload = new Uint8Array(21);
  payload[0] = 0x41; // TRON mainnet/testnet address prefix
  payload.set(hashed, 1);

  return {
    address: base58CheckEncode(payload),
    hexAddress: bytesToHex(payload),
    privateKeyHex: bytesToHex(priv),
  };
}

/** Signs a TronGrid raw transaction hash with a derived private key. */
export function signTxHash(txIdHex: string, privateKeyHex: string): string {
  const hash = Uint8Array.from(
    (txIdHex.match(/.{1,2}/g) ?? []).map((byte) => Number.parseInt(byte, 16)),
  );
  const key = Uint8Array.from(
    (privateKeyHex.match(/.{1,2}/g) ?? []).map((byte) => Number.parseInt(byte, 16)),
  );
  const signature = secp256k1.sign(hash, key, { prehash: false });
  const compact = signature.toBytes("recovered"); // 65 bytes: r || s || v
  const v = compact[64]!;
  const rs = compact.slice(0, 64);
  return bytesToHex(rs) + (v & 1 ? "01" : "00");
}
