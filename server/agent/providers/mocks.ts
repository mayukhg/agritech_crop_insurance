import type {
  AsrProvider,
  AsrResult,
  LlmProvider,
  LlmResult,
  TtsProvider,
  TtsResult,
  VisionProvider,
  VisionResult,
} from "./types";

/** Deterministic mocks — no network, no Math.random on golden paths. */
export class MockAsrProvider implements AsrProvider {
  constructor(private forced?: Partial<AsrResult>) {}

  async transcribe(_audio: Buffer): Promise<AsrResult> {
    return {
      text: this.forced?.text ?? "बारिश नहीं हुई सोयाबीन सूख रही है",
      language: this.forced?.language ?? "hi-IN",
      confidence: this.forced?.confidence ?? 0.91,
    };
  }
}

export class MockTtsProvider implements TtsProvider {
  async synthesize(text: string, _language: string): Promise<TtsResult> {
    // Tiny placeholder Opus-like payload for demos (not real audio).
    const payload = Buffer.from(`TTS:${text}`).toString("base64");
    return {
      audioBase64: payload,
      mimeType: "audio/ogg; codecs=opus",
      text,
    };
  }
}

export class MockVisionProvider implements VisionProvider {
  constructor(private forced?: Partial<VisionResult>) {}

  async assessCropDamage(_image: Buffer, _cropHint?: string): Promise<VisionResult> {
    return {
      damageType: this.forced?.damageType ?? "leaf_rust",
      severityPercentage: this.forced?.severityPercentage ?? 35,
      confidence: this.forced?.confidence ?? 0.88,
    };
  }
}

export class MockLlmProvider implements LlmProvider {
  async complete(prompt: string, language: string): Promise<LlmResult> {
    const lower = prompt.toLowerCase();
    let text =
      language.startsWith("hi")
        ? "मैं CropGuard हूँ। आपकी फसल और मौसम की मदद के लिए तैयार हूँ।"
        : language.startsWith("mr")
          ? "मी CropGuard आहे. पीक आणि हवामानासाठी मदत करेन."
          : "I am CropGuard. I can help with weather, claim status, and agronomy.";

    if (lower.includes("weather") || lower.includes("spray") || lower.includes("हवामान")) {
      text =
        "Wind speeds in your sector will reach 28 km/h by 11:00. Delay pesticide spraying until tomorrow morning.";
    } else if (lower.includes("mandi") || lower.includes("price")) {
      text = "Wheat in your district is up 12% since Monday. Last benchmark ₹2,240 / quintal.";
    } else if (lower.includes("status") || lower.includes("claim")) {
      text = "I am checking your latest claim status now.";
    }

    return {
      text,
      modelId: "mock-slm-7b",
      estimatedCost: 0.0004,
    };
  }
}

export const mockProviders = {
  asr: new MockAsrProvider(),
  tts: new MockTtsProvider(),
  vision: new MockVisionProvider(),
  llm: new MockLlmProvider(),
};
