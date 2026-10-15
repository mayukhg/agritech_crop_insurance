import { waIdToE164 } from "../../lib/phone";

export type ParsedWhatsAppMessage = {
  externalMessageId: string;
  waId: string;
  phoneE164: string | null;
  messageType: "text" | "voice" | "image" | "location" | "unknown";
  text?: string;
  mediaId?: string;
  mimeType?: string;
  location?: { lat: number; lng: number };
  contactName?: string;
};

export function parseWhatsAppWebhook(body: any): ParsedWhatsAppMessage[] {
  const out: ParsedWhatsAppMessage[] = [];
  const entries = body?.entry || [];
  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value?.messages) continue;
      const contactName = value.contacts?.[0]?.profile?.name;
      for (const msg of value.messages) {
        const waId = msg.from;
        const phoneE164 = waIdToE164(waId);
        const base = {
          externalMessageId: msg.id,
          waId,
          phoneE164,
          contactName,
        };
        if (msg.type === "text") {
          out.push({ ...base, messageType: "text", text: msg.text?.body });
        } else if (msg.type === "audio") {
          out.push({
            ...base,
            messageType: "voice",
            mediaId: msg.audio?.id,
            mimeType: msg.audio?.mime_type,
          });
        } else if (msg.type === "image") {
          out.push({
            ...base,
            messageType: "image",
            mediaId: msg.image?.id,
            mimeType: msg.image?.mime_type,
            text: msg.image?.caption,
          });
        } else if (msg.type === "location") {
          out.push({
            ...base,
            messageType: "location",
            location: {
              lat: Number(msg.location?.latitude),
              lng: Number(msg.location?.longitude),
            },
          });
        } else {
          out.push({ ...base, messageType: "unknown" });
        }
      }
    }
  }
  return out;
}
