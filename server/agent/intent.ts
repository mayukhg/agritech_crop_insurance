export type Intent =
  | "claim_filing_voice"
  | "claim_status"
  | "weather_forecast"
  | "mandi_price"
  | "general_agronomy"
  | "onboarding"
  | "image_damage"
  | "location_pin"
  | "unknown";

export type ModelRoute = "slm" | "vision" | "rules";

export function classifyIntent(input: {
  messageType: "text" | "voice" | "image" | "location";
  text?: string;
}): Intent {
  if (input.messageType === "image") return "image_damage";
  if (input.messageType === "location") return "location_pin";

  const t = (input.text || "").toLowerCase();
  if (
    t.includes("drought") ||
    t.includes("dry") ||
    t.includes("rain") ||
    t.includes("बारिश") ||
    t.includes("सूख") ||
    t.includes("पाऊस") ||
    t.includes("claim") ||
    t.includes("दावा")
  ) {
    return "claim_filing_voice";
  }
  if (t.includes("status") || t.includes("payment") || t.includes("track") || t.includes("स्थिति")) {
    return "claim_status";
  }
  if (t.includes("weather") || t.includes("spray") || t.includes("हवामान") || t.includes("wind")) {
    return "weather_forecast";
  }
  if (t.includes("mandi") || t.includes("price") || t.includes("भाव") || t.includes("बाजार")) {
    return "mandi_price";
  }
  if (t.includes("hello") || t.includes("hi") || t.includes("start") || t.includes("नमस्ते") || t.includes("नमस्कार")) {
    return "onboarding";
  }
  if (t.includes("crop") || t.includes("pest") || t.includes("spray") || t.includes("खेत")) {
    return "general_agronomy";
  }
  return "unknown";
}

export function routeModel(intent: Intent): ModelRoute {
  if (intent === "image_damage") return "vision";
  if (intent === "claim_filing_voice") return "rules";
  return "slm";
}
