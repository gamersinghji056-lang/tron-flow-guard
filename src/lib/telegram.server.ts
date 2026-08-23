import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";
import {
  TelegramAuthError,
  validateTelegramInitData,
  type TelegramWebAppUser,
  type VerifiedTelegramInitData,
} from "@/lib/telegram-auth";
import {
  appendTelegramHandoff,
  createTelegramWebAppButton,
  telegramAuthEmailPrompt,
  telegramAuthPasswordPrompt,
  telegramAuthSuccessMessage,
} from "@/lib/telegram-bot-flow";
import { normalizeP2pMarketplaceAd } from "@/lib/p2p-state";

const DEFAULT_AUTH_MAX_AGE_SECONDS = 600;
const DEFAULT_BOT_AUTH_TTL_MS = 5 * 60_000;
const DEFAULT_APP_SESSION_TTL_MS = 30 * 24 * 60 * 60_000;
const DEFAULT_APP_HANDOFF_TTL_MS = 5 * 60_000;
const DEFAULT_MAX_FAILED_ATTEMPTS = 5;
const DEFAULT_LOCK_MS = 15 * 60_000;

interface TelegramAccountRow {
  id: string;
  user_id: string;
  telegram_user_id: number;
  chat_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  status: "active" | "disabled" | "unlinked";
  linked_at: string;
}

interface QueueRow {
  id: string;
  chat_id: number;
  title: string;
  body: string;
  attempts: number;
  max_attempts: number;
}

interface TelegramAuthStateRow {
  telegram_user_id: number;
  chat_id: number;
  flow: "login" | "register";
  step: "email" | "password" | "confirm_password";
  email: string | null;
  attempts: number;
  locked_until: string | null;
  expires_at: string;
}

interface TelegramAppHandoffRow {
  id: string;
  telegram_account_id: string;
  user_id: string;
  telegram_user_id: number;
  status: "pending" | "used" | "expired" | "revoked";
  expires_at: string;
}

interface BotAuthMessageResult {
  handled: boolean;
  text?: string;
  replyMarkup?: unknown;
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new TelegramAuthError("missing_env", `${name} is not configured`);
  return value;
}

function optionalEnv(name: string, fallback = "") {
  return process.env[name] || fallback;
}

function authMaxAgeSeconds() {
  const value = Number(process.env["TELEGRAM_AUTH_MAX_AGE_SECONDS"]);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_AUTH_MAX_AGE_SECONDS;
}

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function botAuthTtlMs() {
  return numberEnv("TELEGRAM_BOT_AUTH_TTL_SECONDS", DEFAULT_BOT_AUTH_TTL_MS / 1000) * 1000;
}

function appSessionTtlMs() {
  return numberEnv("TELEGRAM_APP_SESSION_TTL_SECONDS", DEFAULT_APP_SESSION_TTL_MS / 1000) * 1000;
}

function appHandoffTtlMs() {
  return numberEnv("TELEGRAM_APP_HANDOFF_TTL_SECONDS", DEFAULT_APP_HANDOFF_TTL_MS / 1000) * 1000;
}

function maxFailedAttempts() {
  return numberEnv("TELEGRAM_BOT_AUTH_MAX_ATTEMPTS", DEFAULT_MAX_FAILED_ATTEMPTS);
}

function lockMs() {
  return numberEnv("TELEGRAM_BOT_AUTH_LOCK_SECONDS", DEFAULT_LOCK_MS / 1000) * 1000;
}

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function createPasswordAuthClient() {
  const url = requiredEnv("SUPABASE_URL");
  const key = requiredEnv("SUPABASE_PUBLISHABLE_KEY");
  return createClient(url, key, {
    global: { fetch: createSupabaseFetch(key) },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function sessionHash(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function verifyTelegramLaunch(initData: string): VerifiedTelegramInitData {
  return validateTelegramInitData(initData, requiredEnv("TELEGRAM_BOT_TOKEN"), {
    maxAgeSeconds: authMaxAgeSeconds(),
  });
}

export async function readTelegramAccount(initData: string) {
  const verified = verifyTelegramLaunch(initData);
  const { data } = await supabaseAdmin
    .from("telegram_accounts")
    .select(
      "id, user_id, telegram_user_id, chat_id, username, first_name, last_name, status, linked_at",
    )
    .eq("telegram_user_id", verified.telegramUser.id as never)
    .maybeSingle();

  if (data) {
    await supabaseAdmin
      .from("telegram_accounts")
      .update({
        last_seen_at: new Date().toISOString(),
        username: verified.telegramUser.username ?? null,
        first_name: verified.telegramUser.first_name ?? null,
        last_name: verified.telegramUser.last_name ?? null,
        language_code: verified.telegramUser.language_code ?? null,
      } as never)
      .eq("id", (data as TelegramAccountRow).id as never);
  }

  return { verified, account: data as TelegramAccountRow | null };
}

export async function requireLinkedTelegramUser(initData: string) {
  const { verified, account } = await readTelegramAccount(initData);
  if (!account)
    throw new TelegramAuthError("telegram_not_linked", "Telegram account is not linked");
  if (account.status !== "active") {
    throw new TelegramAuthError("telegram_disabled", "Telegram access is disabled");
  }
  const authorized = await hasActiveTelegramSession(account.telegram_user_id);
  if (!authorized) {
    throw new TelegramAuthError("telegram_session_required", "Telegram login is required");
  }
  return { verified, account, userId: account.user_id };
}

export async function linkTelegramUser(input: { initData: string; userId: string }) {
  const verified = verifyTelegramLaunch(input.initData);
  const account = await linkTelegramIdentity({
    user: verified.telegramUser,
    userId: input.userId,
    reason: "mini_app_link",
  });
  await createTelegramAppSession(account, "mini_app_link");
  return account;
}

export async function hasActiveTelegramSession(telegramUserId: number) {
  await supabaseAdmin.rpc("expire_telegram_app_sessions" as never);
  const { data } = await supabaseAdmin
    .from("telegram_app_sessions" as never)
    .select("id")
    .eq("telegram_user_id", telegramUserId as never)
    .eq("status", "active" as never)
    .gt("expires_at", new Date().toISOString() as never)
    .limit(1);
  return Boolean(data?.length);
}

export async function createTelegramAppSession(account: TelegramAccountRow, reason: string) {
  const rawSecret = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + appSessionTtlMs()).toISOString();
  const { error } = await supabaseAdmin.from("telegram_app_sessions" as never).insert({
    telegram_account_id: account.id,
    user_id: account.user_id,
    telegram_user_id: account.telegram_user_id,
    session_hash: sessionHash(rawSecret),
    status: "active",
    expires_at: expiresAt,
  } as never);
  if (error) throw new Error(error.message);
  await supabaseAdmin.from("telegram_link_audit").insert({
    user_id: account.user_id,
    telegram_account_id: account.id,
    telegram_user_id: account.telegram_user_id,
    action: "telegram.session.created",
    actor_id: account.user_id,
    actor_type: "telegram",
    metadata: { reason, expires_at: expiresAt } as never,
  } as never);
}

export async function createTelegramAppHandoff(account: TelegramAccountRow, reason: string) {
  await supabaseAdmin.rpc("expire_telegram_app_handoffs" as never);
  const token = randomBytes(32).toString("base64url");
  const nonce = randomBytes(16).toString("base64url");
  const expiresAt = new Date(Date.now() + appHandoffTtlMs()).toISOString();
  const { error } = await supabaseAdmin.from("telegram_app_handoffs" as never).insert({
    telegram_account_id: account.id,
    user_id: account.user_id,
    telegram_user_id: account.telegram_user_id,
    token_hash: sessionHash(token),
    nonce,
    status: "pending",
    expires_at: expiresAt,
  } as never);
  if (error) throw new Error(error.message);
  await supabaseAdmin.from("telegram_link_audit").insert({
    user_id: account.user_id,
    telegram_account_id: account.id,
    telegram_user_id: account.telegram_user_id,
    action: "telegram.handoff.created",
    actor_id: account.user_id,
    actor_type: "telegram",
    metadata: { reason, expires_at: expiresAt } as never,
  } as never);
  return { token, expiresAt };
}

async function consumeTelegramAppHandoff(input: {
  token: string;
  telegramUserId: number;
  userId: string;
}) {
  await supabaseAdmin.rpc("expire_telegram_app_handoffs" as never);
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("telegram_app_handoffs" as never)
    .update({ status: "used", used_at: now } as never)
    .eq("token_hash", sessionHash(input.token) as never)
    .eq("telegram_user_id", input.telegramUserId as never)
    .eq("user_id", input.userId as never)
    .eq("status", "pending" as never)
    .gt("expires_at", now as never)
    .select("id, telegram_account_id, user_id, telegram_user_id, status, expires_at")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    return null;
  }
  return data as TelegramAppHandoffRow;
}

export async function authenticateAndLinkTelegramMiniApp(input: {
  initData: string;
  email: string;
  password: string;
}) {
  const verified = verifyTelegramLaunch(input.initData);
  const userId = await authenticatePlatformUser(normalizeEmail(input.email), input.password);
  const account = await linkTelegramIdentity({
    user: verified.telegramUser,
    userId,
    reason: "mini_app_login",
  });
  await createTelegramAppSession(account, "mini_app_login");
  await supabaseAdmin.from("telegram_link_audit").insert({
    user_id: userId,
    telegram_account_id: account.id,
    telegram_user_id: verified.telegramUser.id,
    action: "telegram.mini_app_login.success",
    actor_id: userId,
    actor_type: "telegram",
    metadata: { query_id: verified.queryId ?? null } as never,
  } as never);
  return account;
}

export async function registerAndLinkTelegramMiniApp(input: {
  initData: string;
  email: string;
  password: string;
}) {
  const verified = verifyTelegramLaunch(input.initData);
  const { provisionTrader } = await import("@/lib/accounts.server");
  const result = await provisionTrader({
    email: normalizeEmail(input.email),
    password: input.password,
    fullName: verified.telegramUser.first_name || "WTRON User",
  });
  const account = await linkTelegramIdentity({
    user: verified.telegramUser,
    userId: result.userId,
    reason: "mini_app_register",
  });
  await createTelegramAppSession(account, "mini_app_register");
  await supabaseAdmin.from("telegram_link_audit").insert({
    user_id: result.userId,
    telegram_account_id: account.id,
    telegram_user_id: verified.telegramUser.id,
    action: "telegram.mini_app_registration.success",
    actor_id: result.userId,
    actor_type: "telegram",
    metadata: {
      query_id: verified.queryId ?? null,
      email_verification_required: result.emailVerificationRequired,
    } as never,
  } as never);
  return { account, registration: result };
}

export async function issueTelegramSupabaseSession(initData: string, handoffToken?: string) {
  const { verified, account } = await readTelegramAccount(initData);
  if (!account)
    throw new TelegramAuthError("telegram_not_linked", "Telegram account is not linked");
  if (account.status !== "active") {
    throw new TelegramAuthError("telegram_disabled", "Telegram access is disabled");
  }
  const userId = account.user_id;
  let handoffConsumed = false;
  if (handoffToken) {
    const handoff = await consumeTelegramAppHandoff({
      token: handoffToken,
      telegramUserId: verified.telegramUser.id,
      userId,
    });
    handoffConsumed = Boolean(handoff);
  }
  if (!(await hasActiveTelegramSession(verified.telegramUser.id))) {
    await createTelegramAppSession(account, "mini_app_reconnect");
  }
  const { data: userResult, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = userResult.user?.email;
  if (userError || !email) throw new Error("Could not create a Telegram app session");

  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const properties = linkData?.properties as
    { hashed_token?: string; token_hash?: string; email_otp?: string } | undefined;
  const tokenHash = properties?.hashed_token ?? properties?.token_hash;
  if (linkError || !tokenHash) throw new Error("Could not create a Telegram app session");

  const client = createPasswordAuthClient();
  const { data, error } = await client.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (error || !data.session) throw new Error("Could not activate Telegram app session");

  await supabaseAdmin
    .from("telegram_app_sessions" as never)
    .update({ last_used_at: new Date().toISOString() } as never)
    .eq("telegram_user_id", verified.telegramUser.id as never)
    .eq("status", "active" as never);

  await supabaseAdmin.from("telegram_link_audit").insert({
    user_id: account.user_id,
    telegram_account_id: account.id,
    telegram_user_id: verified.telegramUser.id,
    action: handoffConsumed ? "telegram.handoff.consumed" : "telegram.session.used",
    actor_id: account.user_id,
    actor_type: "telegram",
  } as never);

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? null,
    userId: data.user?.id ?? userId,
  };
}

async function expireBotAuthStates() {
  await supabaseAdmin.rpc("expire_telegram_auth_state" as never);
}

async function readBotAuthState(telegramUserId: number) {
  await expireBotAuthStates();
  const { data } = await supabaseAdmin
    .from("telegram_bot_auth_states" as never)
    .select("telegram_user_id, chat_id, flow, step, email, attempts, locked_until, expires_at")
    .eq("telegram_user_id", telegramUserId as never)
    .maybeSingle();
  return data as TelegramAuthStateRow | null;
}

async function beginBotAuthFlow(input: {
  user: TelegramWebAppUser;
  chatId: number;
  flow: "login" | "register";
}) {
  const existing = await readBotAuthState(input.user.id);
  if (existing?.locked_until && new Date(existing.locked_until).getTime() > Date.now()) {
    return {
      text: "Too many failed attempts. Try again later.",
      replyMarkup: linkedMenuKeyboard(false),
    };
  }

  await supabaseAdmin.from("telegram_bot_auth_states" as never).upsert(
    {
      telegram_user_id: input.user.id,
      chat_id: input.chatId,
      flow: input.flow,
      step: "email",
      email: null,
      attempts: existing?.attempts ?? 0,
      locked_until: existing?.locked_until ?? null,
      expires_at: new Date(Date.now() + botAuthTtlMs()).toISOString(),
    } as never,
    { onConflict: "telegram_user_id" },
  );
  pendingRegistrationPasswords.delete(input.user.id);

  return {
    text: telegramAuthEmailPrompt(input.flow),
    replyMarkup: undefined,
  };
}

async function clearBotAuthState(telegramUserId: number) {
  await supabaseAdmin
    .from("telegram_bot_auth_states" as never)
    .delete()
    .eq("telegram_user_id", telegramUserId as never);
}

async function recordBotAuthFailure(input: {
  user: TelegramWebAppUser;
  chatId: number;
  flow: "login" | "register";
  attempts: number;
  reason: string;
  email?: string | null;
}) {
  const attempts = input.attempts + 1;
  const locked = attempts >= maxFailedAttempts();
  const lockedUntil = locked ? new Date(Date.now() + lockMs()).toISOString() : null;
  await supabaseAdmin.from("telegram_bot_auth_states" as never).upsert(
    {
      telegram_user_id: input.user.id,
      chat_id: input.chatId,
      flow: input.flow,
      step: "email",
      email: input.email ?? null,
      attempts,
      locked_until: lockedUntil,
      expires_at: new Date(Date.now() + botAuthTtlMs()).toISOString(),
    } as never,
    { onConflict: "telegram_user_id" },
  );
  await supabaseAdmin.from("telegram_link_audit").insert({
    telegram_user_id: input.user.id,
    action: `telegram.${input.flow}.failure`,
    reason: input.reason,
    actor_type: "telegram",
    metadata: { attempts, locked } as never,
  } as never);
  return locked;
}

async function authenticatePlatformUser(email: string, password: string) {
  const client = createPasswordAuthClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error("Invalid email or password");
  return data.user.id;
}

async function completeBotLogin(input: {
  user: TelegramWebAppUser;
  chatId: number;
  email: string;
  password: string;
  state: TelegramAuthStateRow;
}) {
  try {
    const userId = await authenticatePlatformUser(input.email, input.password);
    const account = await linkTelegramIdentity({ user: input.user, userId, reason: "bot_login" });
    await createTelegramAppSession(account, "bot_login");
    const handoff = await createTelegramAppHandoff(account, "bot_login");
    await clearBotAuthState(input.user.id);
    await supabaseAdmin.from("telegram_link_audit").insert({
      user_id: userId,
      telegram_account_id: account.id,
      telegram_user_id: input.user.id,
      action: "telegram.login.success",
      actor_id: userId,
      actor_type: "telegram",
    } as never);
    return {
      text: telegramAuthSuccessMessage("login"),
      replyMarkup: openMiniAppKeyboard("/mini-app", handoff.token),
    };
  } catch {
    const locked = await recordBotAuthFailure({
      user: input.user,
      chatId: input.chatId,
      flow: "login",
      attempts: input.state.attempts,
      reason: "invalid_credentials",
      email: input.email,
    });
    return {
      text: locked
        ? "Too many failed attempts. Try again later."
        : "Invalid email or password. Tap LOGIN to try again.",
      replyMarkup: linkedMenuKeyboard(false),
    };
  }
}

const pendingRegistrationPasswords = new Map<
  number,
  { email: string; password: string; expiresAt: number }
>();

function cleanPendingRegistrationPasswords() {
  const now = Date.now();
  for (const [telegramUserId, item] of pendingRegistrationPasswords.entries()) {
    if (item.expiresAt <= now) pendingRegistrationPasswords.delete(telegramUserId);
  }
}

async function completeBotRegistration(input: {
  user: TelegramWebAppUser;
  chatId: number;
  email: string;
  password: string;
  state: TelegramAuthStateRow;
}) {
  try {
    const { provisionTrader } = await import("@/lib/accounts.server");
    const result = await provisionTrader({
      email: input.email,
      password: input.password,
      fullName: input.user.first_name || "WTRON User",
    });
    const account = await linkTelegramIdentity({
      user: input.user,
      userId: result.userId,
      reason: "bot_register",
    });
    await createTelegramAppSession(account, "bot_register");
    const handoff = await createTelegramAppHandoff(account, "bot_register");
    await clearBotAuthState(input.user.id);
    pendingRegistrationPasswords.delete(input.user.id);
    await supabaseAdmin.from("telegram_link_audit").insert({
      user_id: result.userId,
      telegram_account_id: account.id,
      telegram_user_id: input.user.id,
      action: "telegram.registration.success",
      actor_id: result.userId,
      actor_type: "telegram",
      metadata: { email_verification_required: result.emailVerificationRequired } as never,
    } as never);
    return {
      text: telegramAuthSuccessMessage("register"),
      replyMarkup: openMiniAppKeyboard("/mini-app", handoff.token),
    };
  } catch (error) {
    const locked = await recordBotAuthFailure({
      user: input.user,
      chatId: input.chatId,
      flow: "register",
      attempts: input.state.attempts,
      reason: "registration_failed",
      email: input.email,
    });
    pendingRegistrationPasswords.delete(input.user.id);
    const message = error instanceof Error ? error.message : "Could not create the account";
    return {
      text: locked ? "Too many failed attempts. Try again later." : message,
      replyMarkup: linkedMenuKeyboard(false),
    };
  }
}

export async function linkTelegramIdentity(input: {
  user: TelegramWebAppUser;
  userId: string;
  reason: string;
}) {
  const tg = input.user;
  const { data: existingTelegram } = await supabaseAdmin
    .from("telegram_accounts")
    .select("id, user_id, status")
    .eq("telegram_user_id", tg.id as never)
    .maybeSingle();
  const telegramRow = existingTelegram as { id: string; user_id: string; status: string } | null;
  if (telegramRow && telegramRow.user_id !== input.userId) {
    throw new TelegramAuthError(
      "telegram_already_linked",
      "This Telegram account is already linked.",
    );
  }

  const { data: existingUser } = await supabaseAdmin
    .from("telegram_accounts")
    .select("id, telegram_user_id")
    .eq("user_id", input.userId as never)
    .maybeSingle();
  const userRow = existingUser as { id: string; telegram_user_id: number } | null;
  if (userRow && userRow.telegram_user_id !== tg.id) {
    throw new TelegramAuthError(
      "platform_already_linked",
      "This platform account is already linked to another Telegram account",
    );
  }

  const payload = {
    user_id: input.userId,
    telegram_user_id: tg.id,
    chat_id: tg.id,
    username: tg.username ?? null,
    first_name: tg.first_name ?? null,
    last_name: tg.last_name ?? null,
    language_code: tg.language_code ?? null,
    status: "active",
    disabled_at: null,
    disabled_reason: null,
    last_seen_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("telegram_accounts")
    .upsert(payload as never, { onConflict: "telegram_user_id" })
    .select(
      "id, user_id, telegram_user_id, chat_id, username, first_name, last_name, status, linked_at",
    )
    .single();
  if (error) throw new Error(error.message);

  await supabaseAdmin.from("telegram_link_audit").insert({
    user_id: input.userId,
    telegram_account_id: (data as TelegramAccountRow).id,
    telegram_user_id: tg.id,
    action: telegramRow ? "linked.existing" : "linked.created",
    actor_id: input.userId,
    actor_type: "telegram",
    metadata: { reason: input.reason } as never,
  } as never);

  return data as TelegramAccountRow;
}

export async function fetchTelegramOverview(initData: string) {
  const { userId } = await requireLinkedTelegramUser(initData);
  const [
    { data: profile },
    { data: orders },
    { data: directSellOrders },
    { data: directSellPaymentItems },
    { data: transactions },
    { data: notifications },
    { data: wallets },
  ] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, balance, locked_balance")
      .eq("id", userId as never)
      .single(),
    supabaseAdmin
      .from("p2p_orders" as never)
      .select("id, order_ref, side, status, usdt_amount, total_inr, payment_deadline, created_at")
      .or(`buyer_user_id.eq.${userId},seller_id.eq.${userId}` as never)
      .order("created_at", { ascending: false })
      .limit(8),
    supabaseAdmin
      .from("direct_sell_orders" as never)
      .select(
        "id, order_ref, deposit_request_id, payment_method_id, expected_usdt, received_usdt, expected_inr, locked_rate_inr, status, assigned_company_address, txid, confirmations, required_confirmations, expires_at, created_at",
      )
      .eq("user_id", userId as never)
      .order("created_at", { ascending: false })
      .limit(12),
    supabaseAdmin
      .from("direct_sell_payment_items" as never)
      .select(
        "id, direct_sell_order_id, amount_inr, utr_reference, proof_path, status, confirmation_deadline, confirmed_at, disputed_at, created_at",
      )
      .eq("user_id", userId as never)
      .order("created_at", { ascending: false })
      .limit(50),
    supabaseAdmin
      .from("ledger_entries" as never)
      .select("id, entry_type, currency, amount, bucket, reference_id, memo, created_at")
      .eq("user_id", userId as never)
      .order("created_at", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("notifications")
      .select("id, title, body, severity, read_at, created_at")
      .eq("user_id", userId as never)
      .order("created_at", { ascending: false })
      .limit(8),
    supabaseAdmin
      .from("user_wallets" as never)
      .select(
        "id, name, address, network, balance, onchain_balance, onchain_trx_balance, is_default, wallet_type, custody, backup_status, gas_sponsorship_status",
      )
      .eq("user_id", userId as never)
      .eq("is_archived", false as never)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(20),
  ]);

  return {
    profile,
    activeOrders:
      (orders as { status?: string }[] | null)?.filter((order) =>
        [
          "created",
          "escrow_locked",
          "payment_pending",
          "payment_submitted",
          "release_pending",
          "disputed",
        ].includes(String(order.status)),
      ) ?? [],
    orders: orders ?? [],
    directSellOrders: directSellOrders ?? [],
    directSellPaymentItems: directSellPaymentItems ?? [],
    transactions: transactions ?? [],
    notifications: notifications ?? [],
    wallets: wallets ?? [],
  };
}

export async function fetchTelegramMarketplace(initData: string) {
  await requireLinkedTelegramUser(initData);
  const { data: adRows, error } = await supabaseAdmin
    .from("p2p_advertisements" as never)
    .select(
      "id, merchant_id, side, asset, fiat, price_inr, available_usdt, min_order_inr, max_order_inr, payment_methods, terms",
    )
    .eq("is_active", true as never)
    .gt("available_usdt", 0 as never)
    .order("price_inr", { ascending: true })
    .limit(30);
  if (error) throw new Error(error.message);
  const ads = (adRows ?? []) as unknown as Array<{
    id: string;
    merchant_id: string;
    side: "buy" | "sell";
    asset?: string | null;
    fiat?: string | null;
    price_inr: unknown;
    available_usdt: unknown;
    min_order_inr: unknown;
    max_order_inr: unknown;
    payment_methods?: string[] | null;
    terms?: string | null;
  }>;
  const merchantIds = [...new Set(ads.map((ad) => ad.merchant_id).filter(Boolean))];
  const { data: merchantRows, error: merchantError } = merchantIds.length
    ? await supabaseAdmin
        .from("merchants" as never)
        .select("id, display_name, completed_orders, total_orders, status")
        .in("id", merchantIds as never)
    : { data: [], error: null };
  if (merchantError) throw new Error(merchantError.message);
  const merchants = new Map(
    ((merchantRows ?? []) as Array<{ id: string }>).map((merchant) => [merchant.id, merchant]),
  );
  return ads.map((ad) => ({
    ...normalizeP2pMarketplaceAd(ad),
    merchants: merchants.get(ad.merchant_id) ?? null,
  }));
}

export async function fetchTelegramDepositAddress(initData: string) {
  const { userId } = await requireLinkedTelegramUser(initData);
  const { data } = await supabaseAdmin
    .from("wallets")
    .select("id, name, network, address, assigned_user_id, is_default")
    .or(`assigned_user_id.eq.${userId},is_default.eq.true` as never)
    .eq("is_active", true as never)
    .order("assigned_user_id", { ascending: false, nullsFirst: false })
    .order("is_default", { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}

export async function createTelegramDepositRequest(input: { initData: string; amount: number }) {
  const { userId } = await requireLinkedTelegramUser(input.initData);
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error("Enter a valid amount");

  const [{ data: settings }, wallet] = await Promise.all([
    supabaseAdmin
      .from("system_settings")
      .select("key, value")
      .in("key", ["active_network", "required_confirmations", "deposit_expiry_minutes"]),
    fetchTelegramDepositAddress(input.initData),
  ]);

  if (!wallet) throw new Error("No active company deposit wallet is configured");
  const settingsMap = Object.fromEntries((settings ?? []).map((row) => [row.key, row.value]));
  const requiredConfirmations = Number(settingsMap["required_confirmations"] ?? 16) || 16;
  const expiryMinutes = Number(settingsMap["deposit_expiry_minutes"] ?? 120) || 120;
  const expiresAt = new Date(Date.now() + expiryMinutes * 60_000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("deposit_requests")
    .insert({
      user_id: userId,
      wallet_id: wallet.id,
      network: wallet.network,
      expected_amount: input.amount,
      required_confirmations: requiredConfirmations,
      expires_at: expiresAt,
    } as never)
    .select("id, order_ref, expected_amount, status, required_confirmations, expires_at")
    .single();
  if (error) throw new Error(error.message);
  return {
    ...data,
    wallet_address: wallet.address,
    wallet_name: wallet.name,
    network: wallet.network,
  };
}

export async function fetchTelegramDeposits(initData: string) {
  const { userId } = await requireLinkedTelegramUser(initData);
  const { data, error } = await supabaseAdmin
    .from("deposit_requests")
    .select(
      "id, order_ref, expected_amount, received_amount, status, txid, confirmations, required_confirmations, network, expires_at, created_at, wallets(address)",
    )
    .eq("user_id", userId as never)
    .order("created_at", { ascending: false })
    .limit(12);
  if (error) throw new Error(error.message);
  return data ?? [];
}

function telegramMessage(title: string, body: string) {
  return `<b>${escapeHtml(title)}</b>\n${escapeHtml(body)}`;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export async function sendTelegramMessage(chatId: number, text: string, replyMarkup?: unknown) {
  const token = requiredEnv("TELEGRAM_BOT_TOKEN");
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: replyMarkup,
    }),
  });
  if (!response.ok) throw new Error(`Telegram sendMessage failed with HTTP ${response.status}`);
}

export async function processTelegramNotificationQueue(limit = 20) {
  const { data } = await supabaseAdmin
    .from("telegram_notification_queue")
    .select("id, chat_id, title, body, attempts, max_attempts")
    .in("status", ["pending", "failed"] as never)
    .lte("next_retry_at", new Date().toISOString() as never)
    .order("created_at", { ascending: true })
    .limit(limit);

  let processed = 0;
  for (const item of (data ?? []) as QueueRow[]) {
    const attempts = item.attempts + 1;
    await supabaseAdmin
      .from("telegram_notification_queue")
      .update({ status: "sending", attempts } as never)
      .eq("id", item.id as never);
    try {
      await sendTelegramMessage(item.chat_id, telegramMessage(item.title, item.body));
      await supabaseAdmin
        .from("telegram_notification_queue")
        .update({ status: "sent", sent_at: new Date().toISOString(), last_error: null } as never)
        .eq("id", item.id as never);
      processed += 1;
    } catch (error) {
      const lastError = error instanceof Error ? error.message : "Telegram notification failed";
      const nextRetrySeconds = Math.min(21_600, 60 * 2 ** Math.min(attempts, 8));
      await supabaseAdmin
        .from("telegram_notification_queue")
        .update({
          status: attempts >= item.max_attempts ? "failed" : "pending",
          last_error: lastError,
          next_retry_at:
            attempts >= item.max_attempts
              ? new Date().toISOString()
              : new Date(Date.now() + nextRetrySeconds * 1000).toISOString(),
        } as never)
        .eq("id", item.id as never);
    }
  }
  return { processed };
}

function miniAppUrl(path = "/mini-app", handoffToken?: string) {
  return new URL(
    appendTelegramHandoff(path, handoffToken),
    requiredEnv("TELEGRAM_MINI_APP_URL"),
  ).toString();
}

function openMiniAppKeyboard(path = "/mini-app", handoffToken?: string) {
  const url = miniAppUrl(path, handoffToken);
  return {
    inline_keyboard: [[createTelegramWebAppButton("OPEN MINI APP", url)]],
  };
}

function linkedMenuKeyboard(linked: boolean, handoffToken?: string) {
  if (!linked) {
    return {
      inline_keyboard: [
        [
          { text: "LOGIN", callback_data: "auth:login" },
          { text: "REGISTER", callback_data: "auth:register" },
        ],
        [createTelegramWebAppButton("OPEN MINI APP", miniAppUrl("/mini-app?auth=login"))],
        [{ text: "HELP", callback_data: "help" }],
      ],
    };
  }

  return {
    inline_keyboard: [
      [createTelegramWebAppButton("OPEN MINI APP", miniAppUrl("/mini-app", handoffToken))],
      [
        createTelegramWebAppButton("WALLET", miniAppUrl("/mini-app?tab=wallet", handoffToken)),
        createTelegramWebAppButton("P2P", miniAppUrl("/mini-app?tab=p2p", handoffToken)),
      ],
      [
        createTelegramWebAppButton("ORDERS", miniAppUrl("/mini-app?tab=orders", handoffToken)),
        createTelegramWebAppButton("DEPOSIT", miniAppUrl("/mini-app?tab=wallet", handoffToken)),
      ],
      [createTelegramWebAppButton("HISTORY", miniAppUrl("/mini-app?tab=more", handoffToken))],
      [
        { text: "HELP", callback_data: "help" },
        { text: "LOGOUT", callback_data: "auth:logout" },
      ],
    ],
  };
}

function helpText() {
  return [
    "WTRON Help",
    "",
    "Register: tap REGISTER and follow the prompts.",
    "Login: tap LOGIN and enter your platform email and password.",
    "Open Mini App: tap OPEN MINI APP after login to use wallet, P2P and orders.",
    "P2P: buy or sell USDT with INR using the same platform account.",
    "Deposit: create a TRC20 deposit request and send USDT to the assigned address.",
    "Wallet: view available, locked and pending USDT from the shared platform ledger.",
    "",
    "Security: Never share your password, seed phrase, private key or OTP with another person.",
  ].join("\n");
}

async function readLinkedState(telegramUserId: number) {
  const { data: account } = await supabaseAdmin
    .from("telegram_accounts")
    .select("id, user_id, telegram_user_id, status")
    .eq("telegram_user_id", telegramUserId as never)
    .maybeSingle();
  const row = account as TelegramAccountRow | null;
  const linked = row?.status === "active";
  const authorized = linked ? await hasActiveTelegramSession(telegramUserId) : false;
  return { account: row, linked, authorized };
}

async function menuKeyboardForLinkedState(state: {
  account: TelegramAccountRow | null;
  authorized: boolean;
}) {
  if (!state.authorized || !state.account) return linkedMenuKeyboard(false);
  const handoff = await createTelegramAppHandoff(state.account, "bot_menu");
  return linkedMenuKeyboard(true, handoff.token);
}

async function openKeyboardForAccount(account: TelegramAccountRow | null, path: string) {
  const handoff = account ? await createTelegramAppHandoff(account, "bot_shortcut") : null;
  return openMiniAppKeyboard(path, handoff?.token);
}

export async function handleTelegramCommand(user: TelegramWebAppUser, text: string) {
  const command = text.split(/\s+/, 1)[0]?.toLowerCase() || "/start";
  if (command === "/start") {
    await clearBotAuthState(user.id);
    pendingRegistrationPasswords.delete(user.id);
  }
  const state = await readLinkedState(user.id);

  const pathByCommand: Record<string, string> = {
    "/wallet": "/mini-app?tab=wallet",
    "/p2p": "/mini-app?tab=p2p",
    "/orders": "/mini-app?tab=orders",
    "/deposit": "/mini-app?tab=wallet",
    "/history": "/mini-app?tab=more",
  };

  if (command === "/help") {
    return {
      text: helpText(),
      replyMarkup: await menuKeyboardForLinkedState(state),
    };
  }

  if (!state.authorized && command !== "/start") {
    return {
      text: "Welcome to WTRON. Login or register to access wallet, P2P, orders and deposits.",
      replyMarkup: linkedMenuKeyboard(false),
    };
  }

  return {
    text: state.authorized
      ? "Welcome back to WTRON."
      : "Welcome to WTRON. Login or register to access wallet, P2P, orders and deposits.",
    replyMarkup:
      command === "/start"
        ? await menuKeyboardForLinkedState(state)
        : await openKeyboardForAccount(state.account, pathByCommand[command] ?? "/mini-app"),
  };
}

export async function handleTelegramCallback(input: {
  user: TelegramWebAppUser;
  chatId: number;
  data: string;
}) {
  if (input.data === "auth:login") {
    return beginBotAuthFlow({ user: input.user, chatId: input.chatId, flow: "login" });
  }
  if (input.data === "auth:register") {
    return beginBotAuthFlow({ user: input.user, chatId: input.chatId, flow: "register" });
  }
  if (input.data === "auth:logout") {
    const { account } = await readLinkedState(input.user.id);
    await supabaseAdmin
      .from("telegram_app_sessions" as never)
      .update({ status: "revoked" } as never)
      .eq("telegram_user_id", input.user.id as never)
      .eq("status", "active" as never);
    await supabaseAdmin
      .from("telegram_app_handoffs" as never)
      .update({ status: "revoked" } as never)
      .eq("telegram_user_id", input.user.id as never)
      .eq("status", "pending" as never);
    await clearBotAuthState(input.user.id);
    pendingRegistrationPasswords.delete(input.user.id);
    await supabaseAdmin.from("telegram_link_audit").insert({
      user_id: account?.user_id ?? null,
      telegram_account_id: account?.id ?? null,
      telegram_user_id: input.user.id,
      action: "telegram.logout",
      actor_id: account?.user_id ?? null,
      actor_type: "telegram",
    } as never);
    return {
      text: "Logged out from Telegram. Your platform account was not deleted.",
      replyMarkup: linkedMenuKeyboard(false),
    };
  }
  if (input.data === "help") {
    const state = await readLinkedState(input.user.id);
    return { text: helpText(), replyMarkup: await menuKeyboardForLinkedState(state) };
  }
  const state = await readLinkedState(input.user.id);
  return { text: "Choose an action.", replyMarkup: await menuKeyboardForLinkedState(state) };
}

export async function handleTelegramAuthMessage(input: {
  user: TelegramWebAppUser;
  chatId: number;
  text: string;
}): Promise<BotAuthMessageResult> {
  cleanPendingRegistrationPasswords();
  const state = await readBotAuthState(input.user.id);
  if (!state) return { handled: false };

  if (state.locked_until && new Date(state.locked_until).getTime() > Date.now()) {
    return {
      handled: true,
      text: "Too many failed attempts. Try again later.",
      replyMarkup: linkedMenuKeyboard(false),
    };
  }

  if (state.step === "email") {
    const email = normalizeEmail(input.text);
    if (!isEmail(email)) {
      return {
        handled: true,
        text: "Enter a valid email address.",
      };
    }
    await supabaseAdmin
      .from("telegram_bot_auth_states" as never)
      .update({
        email,
        step: "password",
        expires_at: new Date(Date.now() + botAuthTtlMs()).toISOString(),
      } as never)
      .eq("telegram_user_id", input.user.id as never);
    return {
      handled: true,
      text: telegramAuthPasswordPrompt(state.flow),
    };
  }

  if (state.step === "password") {
    if (!state.email) {
      await clearBotAuthState(input.user.id);
      return {
        handled: true,
        text: "Session expired. Tap LOGIN or REGISTER to start again.",
        replyMarkup: linkedMenuKeyboard(false),
      };
    }
    if (state.flow === "login") {
      return {
        handled: true,
        ...(await completeBotLogin({
          user: input.user,
          chatId: input.chatId,
          email: state.email,
          password: input.text,
          state,
        })),
      };
    }
    pendingRegistrationPasswords.set(input.user.id, {
      email: state.email,
      password: input.text,
      expiresAt: Date.now() + botAuthTtlMs(),
    });
    await supabaseAdmin
      .from("telegram_bot_auth_states" as never)
      .update({
        step: "confirm_password",
        expires_at: new Date(Date.now() + botAuthTtlMs()).toISOString(),
      } as never)
      .eq("telegram_user_id", input.user.id as never);
    return {
      handled: true,
      text: "Confirm your password",
    };
  }

  const pending = pendingRegistrationPasswords.get(input.user.id);
  if (!pending || pending.expiresAt <= Date.now() || pending.email !== state.email) {
    pendingRegistrationPasswords.delete(input.user.id);
    await clearBotAuthState(input.user.id);
    return {
      handled: true,
      text: "Session expired. Tap REGISTER to start again.",
      replyMarkup: linkedMenuKeyboard(false),
    };
  }
  if (pending.password !== input.text) {
    pendingRegistrationPasswords.delete(input.user.id);
    const locked = await recordBotAuthFailure({
      user: input.user,
      chatId: input.chatId,
      flow: "register",
      attempts: state.attempts,
      reason: "password_confirmation_mismatch",
      email: state.email,
    });
    return {
      handled: true,
      text: locked ? "Too many failed attempts. Try again later." : "Passwords do not match.",
      replyMarkup: linkedMenuKeyboard(false),
    };
  }

  return {
    handled: true,
    ...(await completeBotRegistration({
      user: input.user,
      chatId: input.chatId,
      email: pending.email,
      password: pending.password,
      state,
    })),
  };
}

export async function writeTelegramHealth(
  status: "ok" | "degraded" | "offline",
  detail: string,
  metadata: Record<string, unknown> = {},
) {
  await supabaseAdmin.from("telegram_bot_health").upsert(
    {
      service: "telegram-worker",
      status,
      detail,
      bot_username: optionalEnv("TELEGRAM_BOT_USERNAME") || null,
      mini_app_url: optionalEnv("TELEGRAM_MINI_APP_URL") || null,
      ...(status === "ok"
        ? { last_ok_at: new Date().toISOString(), last_error: null }
        : { last_error: detail, last_error_at: new Date().toISOString() }),
      metadata,
    } as never,
    { onConflict: "service" },
  );
}
