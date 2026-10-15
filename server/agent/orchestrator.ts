import { classifyIntent, routeModel, type Intent } from "./intent";
import { mockProviders } from "./providers/mocks";
import type { AsrProvider, LlmProvider, TtsProvider, VisionProvider } from "./providers/types";
import { decideClaim, isSurveyNumberVerifiable } from "./decideClaim";
import { isWithinParcel, parcelCenter } from "../lib/geofence";

export type InboundEvent = {
  channel: "whatsapp" | "web" | "sms" | "voice";
  externalMessageId: string;
  phoneE164?: string;
  farmerId?: number;
  messageType: "text" | "voice" | "image" | "location";
  text?: string;
  language?: string;
  audio?: Buffer;
  image?: Buffer;
  location?: { lat: number; lng: number };
  /** Optional forced ASR confidence for demos / tests */
  asrConfidenceOverride?: number;
  /** Parcel coordinates for geofence checks */
  parcelCoordinates?: unknown;
  /** Active policy snapshot for claim rules */
  policy?: {
    coverageAmount: number;
    rainfallThreshold: number;
    surveyNumber?: string | null;
  };
  /** Observed rainfall for claim rules (mm) */
  rainfallMm?: number;
};

export type OrchestratorReply = {
  intent: Intent;
  modelUsed: string;
  text: string;
  language: string;
  asrConfidence?: number;
  estimatedCost: number;
  latencyMs: number;
  handoff?: boolean;
  metadata?: Record<string, unknown>;
  voiceNote?: { audioBase64: string; mimeType: string };
};

export type OrchestratorDeps = {
  asr: AsrProvider;
  tts: TtsProvider;
  vision: VisionProvider;
  llm: LlmProvider;
  now?: () => number;
};

const ASR_MIN_CONFIDENCE = 0.7;

export function createOrchestrator(deps: OrchestratorDeps = {
  asr: mockProviders.asr,
  tts: mockProviders.tts,
  vision: mockProviders.vision,
  llm: mockProviders.llm,
}) {
  return {
    async handle(event: InboundEvent): Promise<OrchestratorReply> {
      const started = (deps.now ?? Date.now)();
      const language = event.language || "en";

      let text = event.text || "";
      let asrConfidence: number | undefined;

      if (event.messageType === "voice" && event.audio) {
        const asr = await deps.asr.transcribe(event.audio);
        text = asr.text;
        asrConfidence = event.asrConfidenceOverride ?? asr.confidence;
        if (asrConfidence < ASR_MIN_CONFIDENCE) {
          const replyText =
            "I could not catch that. Hold the phone close and say the crop and what happened. Or tap to speak with a field officer.";
          const tts = await deps.tts.synthesize(replyText, language);
          return {
            intent: "claim_filing_voice",
            modelUsed: "asr-fallback",
            text: replyText,
            language,
            asrConfidence,
            estimatedCost: 0.0001,
            latencyMs: (deps.now ?? Date.now)() - started,
            handoff: true,
            voiceNote: { audioBase64: tts.audioBase64, mimeType: tts.mimeType },
            metadata: { step: "re_record" },
          };
        }
      }

      const intent = classifyIntent({ messageType: event.messageType, text });
      const route = routeModel(intent);

      if (intent === "image_damage") {
        const vision = await deps.vision.assessCropDamage(event.image || Buffer.alloc(0));
        const replyText = `This looks like ${vision.damageType.replace("_", " ")} on about ${vision.severityPercentage}% of the crop. Send your location so I can match this picture to your field.`;
        return {
          intent,
          modelUsed: "mock-vision",
          text: replyText,
          language,
          estimatedCost: 0.006,
          latencyMs: (deps.now ?? Date.now)() - started,
          metadata: { vision, awaitsLocation: true },
        };
      }

      if (intent === "location_pin" && event.location) {
        const center = parcelCenter(event.parcelCoordinates);
        if (!center) {
          return {
            intent,
            modelUsed: "rules",
            text: "I could not find your registered field coordinates. Please contact support.",
            language,
            estimatedCost: 0,
            latencyMs: (deps.now ?? Date.now)() - started,
            metadata: { accepted: false },
          };
        }
        const geo = isWithinParcel(event.location, center);
        if (!geo.accepted) {
          return {
            intent,
            modelUsed: "rules",
            text: `This location is ${geo.distanceM} m outside your registered field, so I cannot attach the picture. Stand in the field and send the location again.`,
            language,
            estimatedCost: 0,
            latencyMs: (deps.now ?? Date.now)() - started,
            metadata: { accepted: false, distanceM: geo.distanceM },
          };
        }
        return {
          intent,
          modelUsed: "rules",
          text: `Location accepted (${geo.distanceM} m inside your field). The picture is attached for the insurer. Drought payouts still follow the rain gauge, not this photo.`,
          language,
          estimatedCost: 0,
          latencyMs: (deps.now ?? Date.now)() - started,
          metadata: { accepted: true, distanceM: geo.distanceM },
        };
      }

      if (intent === "claim_filing_voice" && event.policy) {
        const landVerified = isSurveyNumberVerifiable(event.policy.surveyNumber);
        const rainfallMm = event.rainfallMm ?? 48;
        const decision = decideClaim({
          rainfallMm,
          rainfallThresholdMm: event.policy.rainfallThreshold,
          coverageAmount: event.policy.coverageAmount,
          landVerified,
        });
        const replyText = decision.approved
          ? `Rain this season is ${rainfallMm} mm. Your cover pays below ${event.policy.rainfallThreshold} mm. ₹${decision.amount.toLocaleString("en-IN")} is approved.`
          : `Your claim cannot be approved. ${decision.reasoning}`;
        const tts = event.messageType === "voice"
          ? await deps.tts.synthesize(replyText, language)
          : undefined;
        return {
          intent,
          modelUsed: "decideClaim",
          text: replyText,
          language,
          asrConfidence,
          estimatedCost: 0.0002,
          latencyMs: (deps.now ?? Date.now)() - started,
          metadata: { decision },
          voiceNote: tts
            ? { audioBase64: tts.audioBase64, mimeType: tts.mimeType }
            : undefined,
        };
      }

      if (route === "slm" || intent === "unknown" || intent === "onboarding") {
        const llm = await deps.llm.complete(text || "hello", language);
        return {
          intent: intent === "unknown" ? "general_agronomy" : intent,
          modelUsed: llm.modelId,
          text: llm.text,
          language,
          asrConfidence,
          estimatedCost: llm.estimatedCost,
          latencyMs: (deps.now ?? Date.now)() - started,
        };
      }

      return {
        intent,
        modelUsed: "rules",
        text: "How can I help with your crop or claim?",
        language,
        estimatedCost: 0,
        latencyMs: (deps.now ?? Date.now)() - started,
      };
    },
  };
}

export const orchestrator = createOrchestrator();
