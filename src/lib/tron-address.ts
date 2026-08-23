import { sha256 } from "@noble/hashes/sha2.js";

const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58CheckEncode(payload: Uint8Array): string {
  const checksum = sha256(sha256(payload)).slice(0, 4);
  const full = new Uint8Array(payload.length + checksum.length);
  full.set(payload);
  full.set(checksum, payload.length);

  let num = 0n;
  for (const byte of full) {
    num = (num << 8n) + BigInt(byte);
  }

  let encoded = "";
  while (num > 0n) {
    const mod = Number(num % 58n);
    encoded = B58_ALPHABET[mod] + encoded;
    num /= 58n;
  }

  for (const byte of full) {
    if (byte !== 0) break;
    encoded = "1" + encoded;
  }

  return encoded || "1";
}

export function base58CheckDecode(value: string): Uint8Array {
  let num = 0n;
  for (const char of value) {
    const idx = B58_ALPHABET.indexOf(char);
    if (idx < 0) throw new Error("Invalid TRON address");
    num = num * 58n + BigInt(idx);
  }

  const bytes: number[] = [];
  while (num > 0n) {
    bytes.unshift(Number(num % 256n));
    num /= 256n;
  }
  for (const char of value) {
    if (char !== "1") break;
    bytes.unshift(0);
  }

  if (bytes.length !== 25) throw new Error("Invalid TRON address");
  const payload = Uint8Array.from(bytes.slice(0, 21));
  const checksum = Uint8Array.from(bytes.slice(21));
  const expected = sha256(sha256(payload)).slice(0, 4);
  if (!checksum.every((byte, index) => byte === expected[index])) {
    throw new Error("Invalid TRON address checksum");
  }
  if (payload[0] !== 0x41) throw new Error("Unsupported TRON address prefix");
  return payload;
}

export function tronAddressToHex(address: string): string {
  return Array.from(base58CheckDecode(address.trim()), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function isValidTronBase58Address(address: string) {
  try {
    base58CheckDecode(address);
    return true;
  } catch {
    return false;
  }
}
