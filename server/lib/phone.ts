/**
 * Normalize Indian and international mobile numbers to E.164.
 * Examples: 9876543210, 919876543210, +91 98765 43210 → +919876543210
 */
export function normalizeToE164(raw: string, defaultCountry = "91"): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.length === 10) {
    return `+${defaultCountry}${digits}`;
  }
  if (digits.length === 12 && digits.startsWith(defaultCountry)) {
    return `+${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return `+${defaultCountry}${digits.slice(1)}`;
  }
  if (raw.trim().startsWith("+") && digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}

/** WhatsApp wa_id is usually digits without +. */
export function waIdToE164(waId: string): string | null {
  return normalizeToE164(waId);
}

export function phonesMatch(a: string, b: string): boolean {
  const na = normalizeToE164(a);
  const nb = normalizeToE164(b);
  return !!na && !!nb && na === nb;
}
