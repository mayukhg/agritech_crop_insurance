import { createHash } from "crypto";
import { normalizeToE164 } from "./phone";

/**
 * Stable Mixpanel distinct_id for a farmer phone.
 * NEVER send the raw phone number to Mixpanel.
 */
export function hashPhone(phone: string): string {
  const normalized = normalizeToE164(phone) || phone.trim();
  return createHash("sha256").update(normalized).digest("hex");
}

/** District-level location label only — never lat/lng. */
export function districtLabel(district: string, state?: string): string {
  if (state) return `${district}, ${state}`;
  return district;
}
