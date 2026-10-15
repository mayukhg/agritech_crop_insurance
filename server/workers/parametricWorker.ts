import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db";
import {
  claims,
  farmerChannelProfiles,
  parametricTriggers,
  payments,
  policies,
  users,
  weatherData,
} from "@shared/schema";
import { decideClaim, isSurveyNumberVerifiable } from "../agent/decideClaim";
import { landHoldings } from "@shared/schema";
import {
  trackPayoutCompleted,
  trackPayoutInitiated,
  trackPayoutTriggerEvaluated,
  trackPayoutTriggerFired,
  trackWeatherDataIngested,
} from "../lib/mixpanel-analytics";

/**
 * Scan active dry_day policies. If trailing dry days >= dryDayLimit,
 * create one parametric trigger + claim + payment for that window.
 */
export async function runParametricScan(asOf: Date = new Date()): Promise<{
  evaluated: number;
  disbursed: number;
  skipped: number;
  details: string[];
}> {
  const details: string[] = [];
  let disbursed = 0;
  let skipped = 0;
  const firedByDistrict = new Map<string, { count: number; amount: number }>();

  const active = await db
    .select()
    .from(policies)
    .where(and(eq(policies.status, "active"), eq(policies.triggerType, "dry_day")));

  for (const policy of active) {
    const [farmer] = await db.select().from(users).where(eq(users.id, policy.farmerId));
    if (!farmer?.district || !farmer.state) {
      skipped += 1;
      details.push(`policy ${policy.id}: missing farmer district`);
      continue;
    }

    const windowEnd = new Date(asOf);
    windowEnd.setHours(0, 0, 0, 0);
    const windowStart = new Date(windowEnd);
    windowStart.setDate(windowStart.getDate() - (policy.dryDayLimit - 1));

    const rows = await db
      .select()
      .from(weatherData)
      .where(
        and(
          eq(weatherData.district, farmer.district),
          eq(weatherData.state, farmer.state),
          gte(weatherData.date, windowStart),
          lte(weatherData.date, windowEnd),
        ),
      );

    // Prefer SYNTHETIC / real rows; never invent here
    if (rows.length === 0) {
      skipped += 1;
      details.push(`policy ${policy.id}: no weather rows`);
      continue;
    }

    const dryDays = rows.filter((r) => r.rainfall < policy.dryDayMaxMm).length;
    const totalRain = rows.reduce((s, r) => s + r.rainfall, 0);
    const phone = farmer.mobileNumber;

    trackWeatherDataIngested(`weather_${farmer.district}`, {
      district: farmer.district,
      state: farmer.state,
      data_source: rows[0]?.source || "unknown",
      rainfall_mm: totalRain,
      dry_day_count: dryDays,
    });

    if (phone) {
      trackPayoutTriggerEvaluated(phone, {
        policy_id: String(policy.id),
        district: farmer.district,
        trigger_type: "dry_day",
        threshold_met: dryDays >= policy.dryDayLimit,
        season: policy.season || "kharif",
      });
    }

    if (dryDays < policy.dryDayLimit) {
      skipped += 1;
      details.push(`policy ${policy.id}: ${dryDays}/${policy.dryDayLimit} dry days`);
      continue;
    }

    const existing = await db
      .select()
      .from(parametricTriggers)
      .where(
        and(
          eq(parametricTriggers.policyId, policy.id),
          eq(parametricTriggers.triggerType, "drought_deficit"),
          eq(parametricTriggers.windowEnd, windowEnd),
        ),
      );

    if (existing[0]) {
      skipped += 1;
      details.push(`policy ${policy.id}: already triggered for window`);
      continue;
    }

    const [land] = await db
      .select()
      .from(landHoldings)
      .where(eq(landHoldings.id, policy.landHoldingId));

    const decision = decideClaim({
      rainfallMm: totalRain,
      rainfallThresholdMm: policy.rainfallThreshold,
      coverageAmount: parseFloat(policy.coverageAmount),
      landVerified: isSurveyNumberVerifiable(land?.surveyNumber),
    });

    // For dry_day policies, meeting the dry-day count is the payout gate;
    // still require land verification.
    if (!isSurveyNumberVerifiable(land?.surveyNumber)) {
      skipped += 1;
      details.push(`policy ${policy.id}: land not verified`);
      continue;
    }

    const amount = decision.approved
      ? decision.amount
      : Math.round(parseFloat(policy.coverageAmount) * (dryDays / Math.max(policy.dryDayLimit, 1)));

    const claimNumber = `CR-${asOf.getFullYear()}-P${policy.id}-${windowEnd.toISOString().slice(0, 10).replace(/-/g, "")}`;
    const [claim] = await db
      .insert(claims)
      .values({
        claimNumber,
        farmerId: policy.farmerId,
        policyId: policy.id,
        claimAmount: amount.toString(),
        actualRainfall: totalRain,
        status: "approved",
        aiDecision: {
          trigger: "dry_day",
          dryDays,
          totalRain,
          parametric: true,
        },
        settlementTime: 6,
        processedAt: asOf,
      })
      .returning();

    const [channel] = await db
      .select()
      .from(farmerChannelProfiles)
      .where(eq(farmerChannelProfiles.userId, policy.farmerId));

    const [payment] = await db
      .insert(payments)
      .values({
        claimId: claim.id,
        amount: amount.toString(),
        bankAccount: "****7890",
        ifscCode: "SBIN0001234",
        transactionId: `UPI-${Date.now()}`,
        status: process.env.PAYMENT_PROVIDER === "live" ? "processing" : "completed",
        paymentMethod: "upi",
        upiVpa: channel?.upiVpa || null,
        disbursementMode: "upi",
        completedAt: asOf,
      })
      .returning();

    await db.update(claims).set({ status: "settled", settledAt: asOf }).where(eq(claims.id, claim.id));

    await db.insert(parametricTriggers).values({
      policyId: policy.id,
      triggerType: "drought_deficit",
      windowStart,
      windowEnd,
      dryDayCount: dryDays,
      rainfallMm: totalRain,
      isAutoDisbursed: true,
      claimId: claim.id,
      disbursementRef: payment.transactionId,
    });

    if (phone) {
      trackPayoutInitiated(phone, {
        policy_id: String(policy.id),
        payout_amount: amount,
        trigger_type: "dry_day",
        district: farmer.district,
        crop_type: policy.policyType || "unknown",
      });
      trackPayoutCompleted(phone, {
        policy_id: String(policy.id),
        payout_amount: amount,
        payment_method: (payment.paymentMethod as "upi" | "bank_transfer") || "upi",
        time_to_payout_hours: Number(process.env.CLAIM_SETTLEMENT_HOURS || 6),
        district: farmer.district,
      });
    }

    const agg = firedByDistrict.get(farmer.district) || { count: 0, amount: 0 };
    agg.count += 1;
    agg.amount += amount;
    firedByDistrict.set(farmer.district, agg);

    disbursed += 1;
    details.push(
      `policy ${policy.id}: disbursed ₹${amount} ref ${payment.transactionId} (dryDays=${dryDays})`,
    );
  }

  for (const [district, agg] of firedByDistrict) {
    trackPayoutTriggerFired(`district_${district}`, {
      district,
      trigger_type: "dry_day",
      affected_policies_count: agg.count,
      total_payout_amount: agg.amount,
    });
  }

  return { evaluated: active.length, disbursed, skipped, details };
}

/** Count weather rows tagged SYNTHETIC for a district (used by regression). */
export async function countSyntheticWeather(district: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(weatherData)
    .where(and(eq(weatherData.district, district), eq(weatherData.source, "SYNTHETIC")));
  return Number(rows[0]?.count || 0);
}
