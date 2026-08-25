import {
  handleTelegramAuthMessage,
  handleTelegramCallback,
  handleTelegramCommand,
  processTelegramNotificationQueue,
  sendTelegramMessage,
  telegramMiniAppHomeUrl,
  writeTelegramHealth,
} from "@/lib/telegram.server";
import { recordSystemError, writeServiceHeartbeat } from "@/lib/system-health.server";

const DEFAULT_POLL_MS = 2_000;
const DEFAULT_QUEUE_BATCH_SIZE = 20;

function numberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const token = process.env["TELEGRAM_BOT_TOKEN"];
const pollMs = numberEnv("TELEGRAM_POLL_MS", DEFAULT_POLL_MS);
const queueBatchSize = numberEnv("TELEGRAM_NOTIFICATION_BATCH_SIZE", DEFAULT_QUEUE_BATCH_SIZE);
const startedAt = Date.now();

let stopping = false;
let offset = 0;
let consecutiveFailures = 0;

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number };
    from?: {
      id: number;
      is_bot?: boolean;
      first_name?: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
  };
  callback_query?: {
    id: string;
    data?: string;
    message?: {
      message_id: number;
      chat: { id: number };
    };
    from: {
      id: number;
      is_bot?: boolean;
      first_name?: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
  };
}

async function getUpdates() {
  if (!token) return [];
  const url = new URL(`https://api.telegram.org/bot${token}/getUpdates`);
  url.searchParams.set("timeout", "20");
  url.searchParams.set("limit", "25");
  if (offset > 0) url.searchParams.set("offset", String(offset));

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Telegram getUpdates failed with HTTP ${response.status}`);
  const payload = (await response.json()) as { ok: boolean; result?: TelegramUpdate[] };
  if (!payload.ok) throw new Error("Telegram getUpdates returned ok=false");
  return payload.result ?? [];
}

async function telegramApi(method: string, body: Record<string, unknown>) {
  if (!token) return;
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Telegram ${method} failed with HTTP ${response.status}`);
}

async function configureTelegramMenuButton() {
  const url = telegramMiniAppHomeUrl();
  await telegramApi("setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "Open WTRON",
      web_app: { url },
    },
  });
  return url;
}

async function deleteMessageBestEffort(chatId: number, messageId: number) {
  try {
    await telegramApi("deleteMessage", { chat_id: chatId, message_id: messageId });
  } catch {
    // Private chat deletion can fail depending on Telegram client/bot constraints.
  }
}

async function answerCallbackBestEffort(callbackQueryId: string) {
  try {
    await telegramApi("answerCallbackQuery", { callback_query_id: callbackQueryId });
  } catch {
    // Non-critical acknowledgement.
  }
}

async function processUpdate(update: TelegramUpdate) {
  offset = Math.max(offset, update.update_id + 1);
  const callback = update.callback_query;
  if (callback?.data) {
    await answerCallbackBestEffort(callback.id);
    const chatId = callback.message?.chat.id ?? callback.from.id;
    const result = await handleTelegramCallback({
      user: callback.from,
      chatId,
      data: callback.data,
    });
    await sendTelegramMessage(chatId, result.text, result.replyMarkup);
    return;
  }

  const message = update.message;
  if (!message?.from || !message.text) return;

  if (!message.text.startsWith("/")) {
    const result = await handleTelegramAuthMessage({
      user: message.from,
      chatId: message.chat.id,
      text: message.text,
    });
    if (result.handled) {
      await deleteMessageBestEffort(message.chat.id, message.message_id);
      if (result.text) await sendTelegramMessage(message.chat.id, result.text, result.replyMarkup);
    }
    return;
  }

  const result = await handleTelegramCommand(message.from, message.text);
  await sendTelegramMessage(message.chat.id, result.text, result.replyMarkup);
}

function installSignalHandlers() {
  const shutdown = (signal: NodeJS.Signals) => {
    stopping = true;
    void writeTelegramHealth("offline", `Telegram worker received ${signal}; shutting down`, {
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      offset,
    }).finally(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

async function runForever() {
  installSignalHandlers();

  if (!token) {
    await writeTelegramHealth("degraded", "TELEGRAM_BOT_TOKEN is not configured", {
      uptimeSeconds: 0,
    });
    await writeServiceHeartbeat({
      service: "TELEGRAM WORKER",
      status: "DEGRADED",
      message: "TELEGRAM_BOT_TOKEN is not configured",
      errorCode: "TELEGRAM_TOKEN_MISSING",
      metadata: { uptimeSeconds: 0 },
    });
    while (!stopping) await sleep(60_000);
    return;
  }

  let menuUrl: string | null = null;
  try {
    menuUrl = await configureTelegramMenuButton();
  } catch (error) {
    await writeTelegramHealth("degraded", "Telegram Mini App menu button update failed", {
      pollMs,
      queueBatchSize,
      error: error instanceof Error ? error.message : "Unknown Telegram menu error",
    });
  }

  await writeTelegramHealth("ok", "Telegram worker started", {
    pollMs,
    queueBatchSize,
    menuUrl,
  });
  await writeServiceHeartbeat({
    service: "TELEGRAM WORKER",
    status: "HEALTHY",
    message: "Telegram worker started",
    metadata: { pollMs, queueBatchSize },
  });

  while (!stopping) {
    try {
      const updates = await getUpdates();
      for (const update of updates) {
        await processUpdate(update);
      }

      const queue = await processTelegramNotificationQueue(queueBatchSize);
      consecutiveFailures = 0;
      await writeTelegramHealth("ok", "Telegram worker tick completed", {
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
        offset,
        updates: updates.length,
        notificationsProcessed: queue.processed,
      });
      await writeServiceHeartbeat({
        service: "TELEGRAM WORKER",
        status: "HEALTHY",
        message: "Telegram worker tick completed",
        metadata: {
          uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
          offset,
          updates: updates.length,
          notificationsProcessed: queue.processed,
        },
      });
    } catch (error) {
      consecutiveFailures += 1;
      const detail = error instanceof Error ? error.message : "Telegram worker tick failed";
      console.error("[telegram-worker]", error);
      await writeTelegramHealth("degraded", detail, {
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
        offset,
        consecutiveFailures,
      });
      await writeServiceHeartbeat({
        service: "TELEGRAM WORKER",
        status: "DEGRADED",
        message: detail,
        errorCode: "TELEGRAM_WORKER_TICK_ERROR",
        metadata: { offset, consecutiveFailures },
      });
      await recordSystemError({
        service: "TELEGRAM WORKER",
        severity: "error",
        code: "TELEGRAM_WORKER_TICK_ERROR",
        message: detail,
        retryable: true,
        metadata: { offset, consecutiveFailures },
      });
    }

    const backoff = consecutiveFailures
      ? Math.min(60_000, pollMs * 2 ** Math.min(consecutiveFailures, 5))
      : pollMs;
    await sleep(backoff);
  }
}

runForever().catch((error) => {
  console.error("[telegram-worker] fatal", error);
  process.exit(1);
});
