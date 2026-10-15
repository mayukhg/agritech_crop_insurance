import { describe, expect, it } from "vitest";
import { normalizeToE164, phonesMatch, waIdToE164 } from "../lib/phone";

describe("phone normalization", () => {
  it("normalizes 10-digit Indian mobiles", () => {
    expect(normalizeToE164("9876543210")).toBe("+919876543210");
  });

  it("normalizes +91 and 91 prefixes to the same E.164", () => {
    expect(normalizeToE164("+91 98765 43210")).toBe("+919876543210");
    expect(normalizeToE164("919876543210")).toBe("+919876543210");
    expect(phonesMatch("919876543210", "+91 98765 43210")).toBe(true);
  });

  it("maps WhatsApp wa_id to E.164", () => {
    expect(waIdToE164("919800000001")).toBe("+919800000001");
  });
});
