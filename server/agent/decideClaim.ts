/**
 * Pure claim decision used by processClaimAsync and regression goldens.
 * Amount = coverage × (threshold − rainfall) / threshold when rainfall < threshold.
 */

export type DecideClaimInput = {
  rainfallMm: number;
  rainfallThresholdMm: number;
  coverageAmount: number;
  landVerified: boolean;
};

export type DecideClaimResult =
  | {
      approved: true;
      amount: number;
      shortfallPercentage: number;
      reasonCode: null;
      confidence: number;
      reasoning: string;
    }
  | {
      approved: false;
      amount: 0;
      shortfallPercentage: 0;
      reasonCode: "land_not_verified" | "rainfall_above_threshold";
      confidence: number;
      reasoning: string;
    };

export function decideClaim(input: DecideClaimInput): DecideClaimResult {
  const { rainfallMm, rainfallThresholdMm, coverageAmount, landVerified } = input;

  if (!landVerified) {
    return {
      approved: false,
      amount: 0,
      shortfallPercentage: 0,
      reasonCode: "land_not_verified",
      confidence: 0.95,
      reasoning: "Land ownership could not be verified.",
    };
  }

  if (rainfallMm >= rainfallThresholdMm) {
    return {
      approved: false,
      amount: 0,
      shortfallPercentage: 0,
      reasonCode: "rainfall_above_threshold",
      confidence: 0.95,
      reasoning: `Rainfall of ${rainfallMm}mm is at or above threshold ${rainfallThresholdMm}mm.`,
    };
  }

  const shortfall = (rainfallThresholdMm - rainfallMm) / rainfallThresholdMm;
  const amount = Math.round(coverageAmount * shortfall);

  return {
    approved: true,
    amount,
    shortfallPercentage: Math.round(shortfall * 100),
    reasonCode: null,
    confidence: 0.95,
    reasoning: `Rainfall of ${rainfallMm}mm is below threshold of ${rainfallThresholdMm}mm. Land ownership verified.`,
  };
}

/** Survey numbers longer than 5 characters are treated as verified (matches blockchain mock). */
export function isSurveyNumberVerifiable(surveyNumber?: string | null): boolean {
  return !!surveyNumber && surveyNumber.length > 5;
}
