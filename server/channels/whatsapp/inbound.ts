import { and, eq, gte } from "drizzle-orm";
import { db } from "../../db";
import {
  ambientMessages,
  channelSessions,
  farmerChannelProfiles,
  landHoldings,
  policies,
  users,
} from "@shared/schema";
import { orchestrator } from "../../agent/orchestrator";
import { parseWhatsAppWebhook } from "./parse";
import { normalizeToE164 } from "../../lib/phone";
import {
  mapOrchestratorIntent,
  trackEvidenceSubmissionFailed,
  trackFarmerOnboarded,
  trackFieldPhotoSubmitted,
  trackLanguageDetected,
  trackLocationPinShared,
  trackVoiceCallReceived,
  trackWhatsappMessageReceived,
} from "../../lib/mixpanel-analytics";

const processedIds = new Set<string>();

export { mustUseApprovedTemplate, hoursSinceLastInbound } from "./sessionWindow";

export async function handleWhatsAppInbound(body: any): Promise<{
  accepted: boolean;
  results: Array<{
    externalMessageId: string;
    duplicate?: boolean;
    reply?: string;
    intent?: string;
  }>;
}> {
  const messages = parseWhatsAppWebhook(body);
  const results: Array<{
    externalMessageId: string;
    duplicate?: boolean;
    reply?: string;
    intent?: string;
  }> = [];

  for (const msg of messages) {
    if (!msg.externalMessageId) continue;

    // In-memory + DB dedupe
    const existing = await db
      .select()
      .from(ambientMessages)
      .where(eq(ambientMessages.externalMessageId, msg.externalMessageId));
    if (existing[0] || processedIds.has(msg.externalMessageId)) {
      results.push({ externalMessageId: msg.externalMessageId, duplicate: true });
      continue;
    }
    processedIds.add(msg.externalMessageId);

    const phone = msg.phoneE164 || normalizeToE164(msg.waId);
    if (!phone) {
      results.push({ externalMessageId: msg.externalMessageId, reply: "Invalid phone" });
      continue;
    }

    const [profile] = await db
      .select()
      .from(farmerChannelProfiles)
      .where(eq(farmerChannelProfiles.phoneE164, phone));

    let farmer = profile
      ? (await db.select().from(users).where(eq(users.id, profile.userId)))[0]
      : (await db.select().from(users).where(eq(users.mobileNumber, phone)))[0];

    // Onboarding path for unknown numbers
    if (!farmer) {
      const expires = new Date(Date.now() + 15 * 60 * 1000);
      const sessions = await db
        .select()
        .from(channelSessions)
        .where(and(eq(channelSessions.phoneE164, phone), gte(channelSessions.expiresAt, new Date())));
      const isReturning = sessions.length > 0;
      if (!sessions[0]) {
        await db.insert(channelSessions).values({
          phoneE164: phone,
          state: { step: "awaiting_registration", contactName: msg.contactName },
          expiresAt: expires,
        });
      }
      const reply =
        "Namaste. I can continue in your language. Reply with Hindi, Marathi, or English. What is your name and district? (We will ask for your land survey number next — not Aadhaar.)";
      await db.insert(ambientMessages).values({
        externalMessageId: msg.externalMessageId,
        phoneE164: phone,
        direction: "inbound",
        messageType: msg.messageType === "unknown" ? "text" : msg.messageType,
        transcribedText: msg.text || null,
        intent: "onboarding",
        aiModelUsed: "rules",
        latencyMs: 50,
      });
      await db.insert(ambientMessages).values({
        externalMessageId: `${msg.externalMessageId}.out`,
        phoneE164: phone,
        direction: "outbound",
        messageType: "text",
        transcribedText: reply,
        intent: "onboarding",
        aiModelUsed: "rules",
        latencyMs: 50,
      });

      const channel = msg.messageType === "voice" ? "voice" : "whatsapp";
      const language = "und";
      trackWhatsappMessageReceived(phone, {
        language,
        intent: "purchase",
        district: "unknown",
      });
      trackFarmerOnboarded(
        phone,
        {
          channel,
          language,
          state: "unknown",
          district: "unknown",
          is_returning: isReturning,
        },
        {
          $name: "Farmer-unknown",
          primary_channel: channel,
          preferred_language: language,
          state: "unknown",
          district: "unknown",
          active_policies_count: 0,
          total_premium_paid: 0,
          total_payout_received: 0,
          first_policy_season: "",
          created_at: new Date().toISOString(),
        },
      );

      results.push({
        externalMessageId: msg.externalMessageId,
        reply,
        intent: "onboarding",
      });
      continue;
    }

    const farmerPolicies = await db
      .select()
      .from(policies)
      .where(and(eq(policies.farmerId, farmer.id), eq(policies.status, "active")));
    const policy = farmerPolicies[0];
    const [land] = policy
      ? await db.select().from(landHoldings).where(eq(landHoldings.id, policy.landHoldingId))
      : [undefined];

    const messageType =
      msg.messageType === "unknown" ? "text" : msg.messageType;

    const language = profile?.preferredLanguage || "hi-IN";
    const district = farmer.district || "unknown";
    const state = farmer.state || "unknown";
    const channel = messageType === "voice" ? "voice" : "whatsapp";
    const policyId = policy ? String(policy.id) : "none";

    const reply = await orchestrator.handle({
      channel: "whatsapp",
      externalMessageId: msg.externalMessageId,
      phoneE164: phone,
      farmerId: farmer.id,
      messageType,
      text: msg.text,
      language,
      audio: messageType === "voice" ? Buffer.from("mock-audio") : undefined,
      image: messageType === "image" ? Buffer.from("mock-image") : undefined,
      location: msg.location,
      parcelCoordinates: land?.coordinates,
      policy: policy
        ? {
            coverageAmount: parseFloat(policy.coverageAmount),
            rainfallThreshold: policy.rainfallThreshold,
            surveyNumber: land?.surveyNumber,
          }
        : undefined,
      rainfallMm: 48,
    });

    await db.insert(ambientMessages).values({
      externalMessageId: msg.externalMessageId,
      phoneE164: phone,
      direction: "inbound",
      messageType,
      transcribedText: msg.text ?? null,
      asrConfidence: reply.asrConfidence?.toString(),
      language: reply.language,
      extractedEntities: reply.metadata || null,
      aiModelUsed: reply.modelUsed,
      intent: reply.intent,
      latencyMs: reply.latencyMs,
      estimatedCost: reply.estimatedCost.toString(),
    });

    await db.insert(ambientMessages).values({
      externalMessageId: `${msg.externalMessageId}.out`,
      phoneE164: phone,
      direction: "outbound",
      messageType: reply.voiceNote ? "voice" : "text",
      transcribedText: reply.text,
      language: reply.language,
      aiModelUsed: reply.modelUsed,
      intent: reply.intent,
      latencyMs: reply.latencyMs,
      estimatedCost: reply.estimatedCost.toString(),
    });

    const analyticsIntent = mapOrchestratorIntent(reply.intent);
    trackWhatsappMessageReceived(phone, {
      language: reply.language || language,
      intent: analyticsIntent,
      district,
    });
    trackLanguageDetected(phone, {
      language: reply.language || language,
      channel,
      district,
    });

    if (messageType === "voice") {
      trackVoiceCallReceived(phone, {
        language: reply.language || language,
        duration_seconds: Math.max(1, Math.round((reply.latencyMs || 1000) / 1000) * 15),
        intent: analyticsIntent,
        district,
        call_outcome: reply.handoff ? "dropped" : "completed",
      });
    }

    if (messageType === "image") {
      const accepted = reply.metadata?.awaitsLocation !== false;
      if (accepted) {
        trackFieldPhotoSubmitted(phone, {
          policy_id: policyId,
          district,
          has_location_pin: false,
          photo_count: 1,
          channel,
        });
      } else {
        trackEvidenceSubmissionFailed(phone, {
          policy_id: policyId,
          failure_reason: "image_assessment_failed",
          channel,
        });
      }
    }

    if (messageType === "location" && msg.location) {
      const accepted = Boolean(reply.metadata?.accepted);
      if (accepted) {
        trackLocationPinShared(phone, {
          policy_id: policyId,
          district,
          state,
          accuracy_meters: Number(reply.metadata?.distanceM ?? 0),
        });
        trackFieldPhotoSubmitted(phone, {
          policy_id: policyId,
          district,
          has_location_pin: true,
          photo_count: 1,
          channel,
        });
      } else {
        trackEvidenceSubmissionFailed(phone, {
          policy_id: policyId,
          failure_reason:
            reply.metadata?.accepted === false ? "outside_geofence" : "missing_parcel_coordinates",
          channel,
        });
      }
    }

    if (profile) {
      await db
        .update(farmerChannelProfiles)
        .set({ lastInboundAt: new Date() })
        .where(eq(farmerChannelProfiles.id, profile.id));
    }

    results.push({
      externalMessageId: msg.externalMessageId,
      reply: reply.text,
      intent: reply.intent,
    });
  }

  return { accepted: true, results };
}

