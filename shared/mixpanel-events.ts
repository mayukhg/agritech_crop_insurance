/**
 * Typed Mixpanel event property shapes.
 * Never include raw phone, Aadhaar, bank details, names, or lat/lng.
 */

export type AmbientChannel = "whatsapp" | "voice";
export type MessageIntent = "purchase" | "query" | "claim_status" | "renewal";
export type TriggerType = "rainfall_deficit" | "dry_day";
export type PaymentMethod = "upi" | "bank_transfer";
export type InsurerRole = "underwriter" | "claims_manager" | "admin";
export type PolicyStatus =
  | "active"
  | "pending_evidence"
  | "payout_triggered"
  | "settled"
  | "rejected";
export type EvidenceType = "photo" | "location";
export type ReviewOutcome = "approved" | "flagged" | "pending";
export type ReportFormat = "csv" | "pdf" | "json";
export type ParametricRuleType = "rainfall_threshold" | "dry_day_count";

export interface FarmerOnboardedProps {
  channel: AmbientChannel;
  language: string;
  state: string;
  district: string;
  is_returning: boolean;
}

export interface PolicyQuoteRequestedProps {
  crop_type: string;
  coverage_amount: number;
  district: string;
  season: string;
  channel: AmbientChannel;
  language: string;
}

export interface PolicyPurchasedProps {
  policy_id: string;
  crop_type: string;
  coverage_amount: number;
  premium_amount: number;
  district: string;
  state: string;
  season: string;
  channel: AmbientChannel;
  language: string;
}

export interface PolicyRenewedProps {
  policy_id: string;
  previous_season: string;
  crop_type: string;
  district: string;
  channel: AmbientChannel;
}

export interface FieldPhotoSubmittedProps {
  policy_id: string;
  district: string;
  has_location_pin: boolean;
  photo_count: number;
  channel: AmbientChannel;
}

export interface LocationPinSharedProps {
  policy_id: string;
  district: string;
  state: string;
  accuracy_meters: number;
}

export interface EvidenceSubmissionFailedProps {
  policy_id: string;
  failure_reason: string;
  channel: string;
}

export interface WhatsappMessageReceivedProps {
  language: string;
  intent: MessageIntent;
  district: string;
}

export interface VoiceCallReceivedProps {
  language: string;
  duration_seconds: number;
  intent: MessageIntent;
  district: string;
  call_outcome: "completed" | "dropped" | "no_answer";
}

export interface LanguageDetectedProps {
  language: string;
  channel: AmbientChannel;
  district: string;
}

export interface WeatherDataIngestedProps {
  district: string;
  state: string;
  data_source: string;
  rainfall_mm: number;
  dry_day_count: number;
}

export interface PayoutTriggerEvaluatedProps {
  policy_id: string;
  district: string;
  trigger_type: TriggerType;
  threshold_met: boolean;
  season: string;
}

export interface PayoutTriggerFiredProps {
  district: string;
  trigger_type: string;
  affected_policies_count: number;
  total_payout_amount: number;
}

export interface PayoutInitiatedProps {
  policy_id: string;
  payout_amount: number;
  trigger_type: string;
  district: string;
  crop_type: string;
}

export interface PayoutCompletedProps {
  policy_id: string;
  payout_amount: number;
  payment_method: PaymentMethod;
  time_to_payout_hours: number;
  district: string;
}

export interface PayoutFailedProps {
  policy_id: string;
  failure_reason: string;
  retry_count: number;
}

export interface InsurerSignedInProps {
  organization_id: string;
  role: InsurerRole;
}

export interface PolicyListViewedProps {
  filter_district: string | null;
  filter_season: string | null;
  filter_crop_type: string | null;
  result_count: number;
}

export interface PolicyDetailViewedProps {
  policy_id: string;
  district: string;
  crop_type: string;
  status: PolicyStatus;
}

export interface EvidenceInspectedProps {
  policy_id: string;
  evidence_type: EvidenceType;
  review_outcome: ReviewOutcome;
}

export interface ClaimDebuggedProps {
  policy_id: string;
  issue_type: string;
  resolution_action: string;
}

export interface ClaimApprovedProps {
  policy_id: string;
  payout_amount: number;
  district: string;
  crop_type: string;
}

export interface ClaimRejectedProps {
  policy_id: string;
  rejection_reason: string;
  district: string;
}

export interface ParametricRuleUpdatedProps {
  rule_type: ParametricRuleType;
  old_value: number;
  new_value: number;
  district: string;
}

export interface ReportExportedProps {
  report_type: string;
  district: string;
  season: string;
  format: ReportFormat;
}

export interface FarmerPeopleProps {
  $name: string;
  primary_channel: AmbientChannel;
  preferred_language: string;
  state: string;
  district: string;
  active_policies_count: number;
  total_premium_paid: number;
  total_payout_received: number;
  first_policy_season: string;
  created_at: string;
}

export interface InsurerPeopleProps {
  $name: string;
  $email: string;
  organization_id: string;
  role: string;
  districts_managed: string[];
  created_at: string;
}
