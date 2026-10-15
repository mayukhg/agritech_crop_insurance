export type AsrResult = {
  text: string;
  language: string;
  confidence: number;
};

export type TtsResult = {
  audioBase64: string;
  mimeType: string;
  text: string;
};

export type VisionResult = {
  damageType: string;
  severityPercentage: number;
  confidence: number;
};

export type LlmResult = {
  text: string;
  modelId: string;
  estimatedCost: number;
};

export interface AsrProvider {
  transcribe(audio: Buffer, mimeType?: string): Promise<AsrResult>;
}

export interface TtsProvider {
  synthesize(text: string, language: string): Promise<TtsResult>;
}

export interface VisionProvider {
  assessCropDamage(image: Buffer, cropHint?: string): Promise<VisionResult>;
}

export interface LlmProvider {
  complete(prompt: string, language: string): Promise<LlmResult>;
}
