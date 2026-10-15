import { describe, expect, it } from "vitest";
import { createOrchestrator } from "../agent/orchestrator";
import { MockAsrProvider, MockLlmProvider, MockTtsProvider, MockVisionProvider } from "../agent/providers/mocks";
import { classifyIntent, routeModel } from "../agent/intent";
import { mustUseApprovedTemplate } from "../channels/whatsapp/sessionWindow";
import { verifyWhatsAppSignature, signWhatsAppBody } from "../channels/whatsapp/signature";
import { parseWhatsAppWebhook } from "../channels/whatsapp/parse";
import { fixtures } from "../synthetic/world";

describe("intent routing R15", () => {
  it("routes images to vision and weather to SLM", () => {
    expect(routeModel(classifyIntent({ messageType: "image" }))).toBe("vision");
    expect(routeModel(classifyIntent({ messageType: "text", text: "weather spray window" }))).toBe("slm");
  });
});

describe("orchestrator voice confidence R10", () => {
  it("asks to re-record when ASR confidence is 0.62", async () => {
    const orch = createOrchestrator({
      asr: new MockAsrProvider({ confidence: 0.62, text: "unclear" }),
      tts: new MockTtsProvider(),
      vision: new MockVisionProvider(),
      llm: new MockLlmProvider(),
    });
    const reply = await orch.handle({
      channel: "whatsapp",
      externalMessageId: "wamid.test.low",
      messageType: "voice",
      audio: Buffer.from("x"),
      asrConfidenceOverride: 0.62,
    });
    expect(reply.handoff).toBe(true);
    expect(reply.text.toLowerCase()).toContain("could not catch");
  });
});

describe("orchestrator claim decision", () => {
  it("approves a drought voice claim against policy", async () => {
    const orch = createOrchestrator();
    const reply = await orch.handle({
      channel: "whatsapp",
      externalMessageId: "wamid.test.claim",
      messageType: "text",
      text: "drought dry rain no rainfall",
      policy: {
        coverageAmount: 60000,
        rainfallThreshold: 120,
        surveyNumber: "LTR-2218",
      },
      rainfallMm: 48,
    });
    expect(reply.intent).toBe("claim_filing_voice");
    expect(reply.text).toContain("36,000");
  });
});

describe("WhatsApp signature & parse R8", () => {
  it("verifies a signed body", () => {
    const secret = "test-secret";
    const body = JSON.stringify(fixtures.whatsappText);
    const sig = signWhatsAppBody(body, secret);
    expect(verifyWhatsAppSignature(body, sig, secret)).toBe(true);
    expect(verifyWhatsAppSignature(body, "sha256=deadbeef", secret)).toBe(false);
  });

  it("parses the PRD audio fixture", () => {
    const parsed = parseWhatsAppWebhook(fixtures.whatsappAudio);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].messageType).toBe("voice");
    expect(parsed[0].externalMessageId).toBe("wamid.FIXTURE_AUDIO_RAMESH_01");
  });
});

describe("24-hour template window R12", () => {
  it("requires an approved template when last inbound is older than 24h", () => {
    const now = new Date("2026-10-01T07:00:00+05:30");
    const old = new Date("2026-09-29T06:00:00+05:30");
    expect(mustUseApprovedTemplate(old, now)).toBe(true);
    expect(mustUseApprovedTemplate(now, now)).toBe(false);
  });
});

describe("policy catalog R4", () => {
  it("keeps Basic / Premium / Comprehensive rupee rates", () => {
    const catalog = [
      { id: "basic", premiumPerHectare: 2500, coveragePerHectare: 25000, rainfallThreshold: 100 },
      { id: "premium", premiumPerHectare: 4000, coveragePerHectare: 50000, rainfallThreshold: 120 },
      { id: "comprehensive", premiumPerHectare: 6500, coveragePerHectare: 75000, rainfallThreshold: 150 },
    ];
    expect(catalog.map((c) => c.id)).toEqual(["basic", "premium", "comprehensive"]);
    expect(catalog[1].premiumPerHectare).toBe(4000);
  });
});
