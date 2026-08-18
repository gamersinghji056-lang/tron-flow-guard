import { HDKey } from "@scure/bip32";
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export const TRON_BIP44_DERIVATION_PATH = "m/44'/195'/0'/0/0";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
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

export function privateKeyToTronAddress(privateKey: Uint8Array) {
  const publicKey = secp256k1.getPublicKey(privateKey, false).slice(1);
  const hashed = keccak_256(publicKey).slice(-20);
  const payload = new Uint8Array(21);
  payload[0] = 0x41;
  payload.set(hashed, 1);
  return {
    address: base58CheckEncode(payload),
    hexAddress: bytesToHex(payload),
    publicKeyHex: bytesToHex(publicKey),
    privateKeyHex: bytesToHex(privateKey),
  };
}

export function createPersonalWalletMnemonic() {
  return generateMnemonic(wordlist, 128);
}

export function deriveTronWalletFromMnemonic(
  mnemonic: string,
  derivationPath = TRON_BIP44_DERIVATION_PATH,
) {
  const normalized = mnemonic.trim().toLowerCase().replace(/\s+/g, " ");
  if (!validateMnemonic(normalized, wordlist)) {
    throw new Error("Recovery phrase is invalid");
  }
  const seed = mnemonicToSeedSync(normalized);
  const hd = HDKey.fromMasterSeed(seed).derive(derivationPath);
  if (!hd.privateKey) throw new Error("Could not derive TRON wallet from phrase");
  return {
    mnemonic: normalized,
    derivationPath,
    ...privateKeyToTronAddress(hd.privateKey),
  };
}
