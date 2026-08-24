import type { WtronAccountType } from "@/lib/role-auth-policy";

export type TelegramBotAuthFlow = "login" | "register";
export type TelegramBotAuthStep = "email" | "password" | "confirm_password";

export interface TelegramHandoffState {
  status: "pending" | "used" | "expired" | "revoked";
  expiresAt: string;
  telegramUserId: number;
  userId: string;
}

export interface TelegramWebAppButtonPayload {
  text: string;
  web_app: { url: string };
  url?: never;
}

export function isTelegramAuthStateExpired(expiresAt: string, nowMs = Date.now()) {
  const expiry = new Date(expiresAt).getTime();
  return !Number.isFinite(expiry) || expiry <= nowMs;
}

export function shouldLockTelegramAuth(attemptsAfterFailure: number, maxAttempts: number) {
  return attemptsAfterFailure >= maxAttempts;
}

export function nextTelegramAuthStep(flow: TelegramBotAuthFlow, step: TelegramBotAuthStep) {
  if (step === "email") return "password" as const;
  if (flow === "register" && step === "password") return "confirm_password" as const;
  return null;
}

export function isCredentialMessageStep(step: TelegramBotAuthStep) {
  return step === "email" || step === "password" || step === "confirm_password";
}

export function telegramAuthEmailPrompt(flow: TelegramBotAuthFlow) {
  return flow === "register"
    ? "Enter the email address you want to use for your WTRON account."
    : "Enter your registered email address.";
}

export function telegramAuthFlowLabel(flow: TelegramBotAuthFlow, accountType: WtronAccountType) {
  const role = accountType === "vendor" ? "Vendor" : "Trader";
  return `${flow === "register" ? "Register" : "Login"} ${role}`;
}

export function telegramAuthPasswordPrompt(flow: TelegramBotAuthFlow) {
  return flow === "register" ? "Create your password" : "Enter your password.";
}

export function telegramAuthSuccessMessage(flow: TelegramBotAuthFlow) {
  return flow === "register"
    ? "Registration successful. Your WTRON account is ready."
    : "Login successful.";
}

export function canConsumeTelegramHandoff(
  handoff: TelegramHandoffState,
  telegramUserId: number,
  userId: string,
  nowMs = Date.now(),
) {
  return (
    handoff.status === "pending" &&
    handoff.telegramUserId === telegramUserId &&
    handoff.userId === userId &&
    !isTelegramAuthStateExpired(handoff.expiresAt, nowMs)
  );
}

export function appendTelegramHandoff(path: string, handoffToken?: string) {
  const url = new URL(path, "https://wtron.local");
  if (handoffToken) url.searchParams.set("handoff", handoffToken);
  return `${url.pathname}${url.search}`;
}

export function createTelegramWebAppButton(text: string, url: string): TelegramWebAppButtonPayload {
  return { text, web_app: { url } };
}
