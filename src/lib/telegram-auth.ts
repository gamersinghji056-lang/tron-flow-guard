import { createHmac, timingSafeEqual } from "node:crypto";

export interface TelegramWebAppUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface VerifiedTelegramInitData {
  telegramUser: TelegramWebAppUser;
  authDate: number;
  queryId?: string;
  startParam?: string;
}

export class TelegramAuthError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function hmac(key: string | Buffer, data: string) {
  return createHmac("sha256", key).update(data).digest();
}

function safeEqualHex(actualHex: string, expected: Buffer) {
  if (!/^[a-f0-9]{64}$/i.test(actualHex)) return false;
  const actual = Buffer.from(actualHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function parseTelegramInitData(initData: string): URLSearchParams {
  if (!initData || initData.length > 4096) {
    throw new TelegramAuthError("invalid_init_data", "Telegram initData is missing or too large");
  }
  return new URLSearchParams(initData);
}

export function validateTelegramInitData(
  initData: string,
  botToken: string,
  options: { maxAgeSeconds?: number; nowSeconds?: number } = {},
): VerifiedTelegramInitData {
  if (!botToken) {
    throw new TelegramAuthError("telegram_not_configured", "Telegram bot token is not configured");
  }

  const params = parseTelegramInitData(initData);
  const hash = params.get("hash");
  if (!hash) throw new TelegramAuthError("missing_hash", "Telegram initData hash is missing");

  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key !== "hash") pairs.push(`${key}=${value}`);
  });
  pairs.sort();
  const checkString = pairs.join("\n");
  const secret = hmac("WebAppData", botToken);
  const expectedHash = hmac(secret, checkString);

  if (!safeEqualHex(hash, expectedHash)) {
    throw new TelegramAuthError("invalid_signature", "Telegram initData signature is invalid");
  }

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || authDate <= 0) {
    throw new TelegramAuthError("invalid_auth_date", "Telegram initData auth_date is invalid");
  }

  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const maxAge = options.maxAgeSeconds ?? 600;
  if (now - authDate > maxAge) {
    throw new TelegramAuthError("expired_init_data", "Telegram initData has expired");
  }
  if (authDate - now > 60) {
    throw new TelegramAuthError("future_auth_date", "Telegram initData auth_date is in the future");
  }

  const userRaw = params.get("user");
  if (!userRaw) throw new TelegramAuthError("missing_user", "Telegram initData user is missing");

  let telegramUser: TelegramWebAppUser;
  try {
    telegramUser = JSON.parse(userRaw) as TelegramWebAppUser;
  } catch {
    throw new TelegramAuthError("invalid_user", "Telegram initData user is invalid JSON");
  }

  if (!Number.isSafeInteger(telegramUser.id) || telegramUser.id <= 0) {
    throw new TelegramAuthError("invalid_user_id", "Telegram user id is invalid");
  }

  const verified: VerifiedTelegramInitData = {
    telegramUser,
    authDate,
  };
  const queryId = params.get("query_id");
  const startParam = params.get("start_param");
  if (queryId) verified.queryId = queryId;
  if (startParam) verified.startParam = startParam;
  return verified;
}

export function normalizeTelegramDeepLink(value: string | undefined): string {
  if (!value) return "/mini-app";
  const decoded = value.startsWith("/") ? value : `/${value}`;
  if (!/^\/[a-z0-9/_-]{0,120}$/i.test(decoded)) return "/mini-app";
  if (decoded.includes("..") || decoded.startsWith("//")) return "/mini-app";
  return decoded;
}

export function createSignedTelegramInitDataForTest(input: {
  botToken: string;
  user: TelegramWebAppUser;
  authDate: number;
  queryId?: string;
  startParam?: string;
}) {
  const params = new URLSearchParams();
  if (input.queryId) params.set("query_id", input.queryId);
  params.set("user", JSON.stringify(input.user));
  params.set("auth_date", String(input.authDate));
  if (input.startParam) params.set("start_param", input.startParam);

  const pairs: string[] = [];
  params.forEach((value, key) => pairs.push(`${key}=${value}`));
  pairs.sort();
  const secret = hmac("WebAppData", input.botToken);
  const hash = hmac(secret, pairs.join("\n")).toString("hex");
  params.set("hash", hash);
  return params.toString();
}
