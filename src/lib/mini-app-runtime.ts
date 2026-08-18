function randomHex(bytes = 16) {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const buffer = new Uint8Array(bytes);
    cryptoApi.getRandomValues(buffer);
    return Array.from(buffer, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

export function createMiniAppClientId(prefix: string) {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === "function") {
    return `${prefix}-${cryptoApi.randomUUID()}`;
  }
  return `${prefix}-${randomHex()}`;
}

export function miniAppErrorHomeHref(pathname: string) {
  return pathname.startsWith("/mini-app") ? "/mini-app" : "/";
}

export function isMiniAppSessionError(message: string) {
  return /telegram|session|expired|linked|disabled|verification|launch/i.test(message);
}
