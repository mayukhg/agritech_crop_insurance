/**
 * High-level Mixpanel helpers for farmer / payout journeys.
 * All farmer distinct_ids are SHA-256 phone hashes.
 */
import { trackServer, identifyServer } from "./mixpanel-server";
import { hashPhone } from "./mixpanel-privacy";
import type {
  AmbientChannel,
  EvidenceSubmissionFailedProps,
  FarmerOnboardedProps,
  FarmerPeopleProps,
  FieldPhotoSubmittedProps,
  LanguageDetectedProps,
  LocationPinSharedProps,
  MessageIntent,
  PayoutCompletedProps,
  PayoutFailedProps,
  PayoutInitiatedProps,
  PayoutTriggerEvaluatedProps,
  PayoutTriggerFiredProps,
  PolicyPurchasedProps,
  PolicyQuoteRequestedProps,
  PolicyRenewedProps,
  VoiceCallReceivedProps,
  WeatherDataIngestedProps,
  WhatsappMessageReceivedProps,
} from "@shared/mixpanel-events";
import type { Intent } from "../agent/intent";

export function farmerDistinctId(phoneE164: string): string {
  return hashPhone(phoneE164);
}

export function mapOrchestratorIntent(intent: Intent | string | undefined): MessageIntent {
  switch (intent) {
    case "onboarding":
    case "claim_filing_voice":
      return intent === "onboarding" ? "purchase" : "claim_status";
    case "claim_status":
      return "claim_status";
    case "image_damage":
    case "location_pin":
      return "claim_status";
    default:
      return "query";
  }
}

export function trackFarmerOnboarded(
  phoneE164: string,
  props: FarmerOnboardedProps,
  people?: Partial<FarmerPeopleProps>,
): void {
  const id = farmerDistinctId(phoneE164);
  trackServer("farmer_onboarded", id, props);
  if (people) {
    identifyServer(id, {
      $name: people.$name || `Farmer-${props.district}`,
      primary_channel: props.channel,
      preferred_language: props.language,
      state: props.state,
      district: props.district,
      active_policies_count: people.active_policies_count ?? 0,
      total_premium_paid: people.total_premium_paid ?? 0,
      total_payout_received: people.total_payout_received ?? 0,
      first_policy_season: people.first_policy_season ?? "",
      created_at: people.created_at || new Date().toISOString(),
    });
  }
}

export function trackPolicyQuoteRequested(phoneE164: string, props: PolicyQuoteRequestedProps): void {
  trackServer("policy_quote_requested", farmerDistinctId(phoneE164), props);
}

export function trackPolicyPurchased(phoneE164: string, props: PolicyPurchasedProps): void {
  trackServer("policy_purchased", farmerDistinctId(phoneE164), props);
}

export function trackPolicyRenewed(phoneE164: string, props: PolicyRenewedProps): void {
  trackServer("policy_renewed", farmerDistinctId(phoneE164), props);
}

export function trackFieldPhotoSubmitted(phoneE164: string, props: FieldPhotoSubmittedProps): void {
  trackServer("field_photo_submitted", farmerDistinctId(phoneE164), props);
}

export function trackLocationPinShared(phoneE164: string, props: LocationPinSharedProps): void {
  trackServer("location_pin_shared", farmerDistinctId(phoneE164), props);
}

export function trackEvidenceSubmissionFailed(
  phoneE164: string,
  props: EvidenceSubmissionFailedProps,
): void {
  trackServer("evidence_submission_failed", farmerDistinctId(phoneE164), props);
}

export function trackWhatsappMessageReceived(
  phoneE164: string,
  props: WhatsappMessageReceivedProps,
): void {
  trackServer("whatsapp_message_received", farmerDistinctId(phoneE164), props);
}

export function trackVoiceCallReceived(phoneE164: string, props: VoiceCallReceivedProps): void {
  trackServer("voice_call_received", farmerDistinctId(phoneE164), props);
}

export function trackLanguageDetected(phoneE164: string, props: LanguageDetectedProps): void {
  trackServer("language_detected", farmerDistinctId(phoneE164), props);
}

export function trackWeatherDataIngested(
  distinctId: string,
  props: WeatherDataIngestedProps,
): void {
  trackServer("weather_data_ingested", distinctId, props);
}

export function trackPayoutTriggerEvaluated(
  phoneE164: string,
  props: PayoutTriggerEvaluatedProps,
): void {
  trackServer("payout_trigger_evaluated", farmerDistinctId(phoneE164), props);
}

export function trackPayoutTriggerFired(
  distinctId: string,
  props: PayoutTriggerFiredProps,
): void {
  trackServer("payout_trigger_fired", distinctId, props);
}

export function trackPayoutInitiated(phoneE164: string, props: PayoutInitiatedProps): void {
  trackServer("payout_initiated", farmerDistinctId(phoneE164), props);
}

export function trackPayoutCompleted(phoneE164: string, props: PayoutCompletedProps): void {
  trackServer("payout_completed", farmerDistinctId(phoneE164), props);
}

export function trackPayoutFailed(phoneE164: string, props: PayoutFailedProps): void {
  trackServer("payout_failed", farmerDistinctId(phoneE164), props);
}

export type { AmbientChannel };
