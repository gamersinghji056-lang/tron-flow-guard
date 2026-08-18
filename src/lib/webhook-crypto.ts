import { createHmac, timingSafeEqual } from "node:crypto";

export function signWebhookBody(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex");
}

export function formatWebhookSignature(signature: string): string {
  return `sha256=${signature}`;
}

export function verifyWebhookSignature(
  secret: string,
  timestamp: string,
  body: string,
  header: string,
): boolean {
  const expected = Buffer.from(formatWebhookSignature(signWebhookBody(secret, timestamp, body)));
  const actual = Buffer.from(header);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
