import mixpanel from "mixpanel-browser";
import type { InsurerPeopleProps } from "@shared/mixpanel-events";

const token =
  (typeof import.meta !== "undefined" &&
    (import.meta.env.VITE_MIXPANEL_TOKEN ||
      import.meta.env.NEXT_PUBLIC_MIXPANEL_TOKEN)) ||
  "";

let initialized = false;

function ensureInit(): boolean {
  if (typeof window === "undefined") return false;
  if (!token) return false;
  if (!initialized) {
    mixpanel.init(token, {
      persistence: "localStorage",
      ignore_dnt: false,
      api_host: "https://api.mixpanel.com",
    });
    initialized = true;
  }
  return true;
}

export function track(
  event: string,
  props?: Record<string, string | number | boolean | null | undefined>,
): void {
  if (!ensureInit()) return;
  mixpanel.track(event, props);
}

export function identify(
  userId: string,
  userProps?: Partial<InsurerPeopleProps> & Record<string, unknown>,
): void {
  if (!ensureInit()) return;
  mixpanel.identify(userId);
  if (userProps) {
    mixpanel.people.set(userProps);
  }
}

export function reset(): void {
  if (!ensureInit()) return;
  mixpanel.reset();
}

export function isMixpanelBrowserEnabled(): boolean {
  return Boolean(token) && typeof window !== "undefined";
}
