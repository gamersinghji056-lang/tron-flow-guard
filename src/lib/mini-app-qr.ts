export async function qrToDataUrl(payload: string) {
  const qrcode = await import("qrcode");
  return qrcode.default.toDataURL(payload, { width: 260, margin: 1 });
}
