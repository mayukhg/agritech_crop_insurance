import crypto from "crypto";

/**
 * Verify Meta X-Hub-Signature-256.
 * When WHATSAPP_APP_SECRET is unset, signature checks are skipped in development.
 */
export function verifyWhatsAppSignature(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
  appSecret = process.env.WHATSAPP_APP_SECRET,
): boolean {
  if (!appSecret) {
    return process.env.NODE_ENV !== "production";
  }
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = signatureHeader.slice("sha256=".length);
  const hmac = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(hmac, "hex"));
  } catch {
    return false;
  }
}

export function signWhatsAppBody(rawBody: string, appSecret: string): string {
  const hmac = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return `sha256=${hmac}`;
}
