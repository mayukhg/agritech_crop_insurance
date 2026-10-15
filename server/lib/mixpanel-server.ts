import Mixpanel from "mixpanel";
import { randomUUID } from "crypto";
import type { FarmerPeopleProps } from "@shared/mixpanel-events";

const token =
  process.env.MIXPANEL_TOKEN ||
  process.env.MIXPANEL_PROJECT_TOKEN ||
  "";

let client: Mixpanel.Mixpanel | null = null;

function getClient(): Mixpanel.Mixpanel | null {
  if (!token) {
    if (process.env.NODE_ENV !== "test") {
      console.warn("[mixpanel] MIXPANEL_TOKEN / MIXPANEL_PROJECT_TOKEN unset — server events skipped");
    }
    return null;
  }
  if (!client) {
    client = Mixpanel.init(token, { protocol: "https" });
  }
  return client;
}

export type ServerTrackProps = Record<string, string | number | boolean | null | undefined>;

/**
 * Server-side track with required distinct_id and $insert_id for deduplication.
 */
export function trackServer(
  event: string,
  distinctId: string,
  props: object = {},
  insertId?: string,
): void {
  const mp = getClient();
  if (!mp) return;

  const payload: Record<string, unknown> = {
    distinct_id: distinctId,
    $insert_id: insertId || randomUUID(),
    ...(props as ServerTrackProps),
  };

  try {
    mp.track(event, payload as Mixpanel.PropertyDict);
  } catch (err) {
    console.error(`[mixpanel] track failed for ${event}:`, err);
  }
}

export function identifyServer(
  distinctId: string,
  props: Partial<FarmerPeopleProps> & Record<string, unknown>,
): void {
  const mp = getClient();
  if (!mp) return;

  try {
    mp.people.set(distinctId, props as Mixpanel.PropertyDict);
  } catch (err) {
    console.error("[mixpanel] people.set failed:", err);
  }
}

export function isMixpanelServerEnabled(): boolean {
  return Boolean(token);
}
