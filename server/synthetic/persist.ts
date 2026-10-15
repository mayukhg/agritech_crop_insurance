import { eq } from "drizzle-orm";
import { db } from "../db";
import {
  users,
  landHoldings,
  policies,
  claims,
  payments,
  weatherData,
  farmerChannelProfiles,
  channelSessions,
  farmProfiles,
  parametricTriggers,
  notifications,
  damageAssessments,
  ambientMessages,
} from "@shared/schema";
import {
  anitaDryDaySeries,
  claimNumbers,
  personas,
  rameshRainfallSeries,
  SYNTHETIC_CLOCK,
} from "./world";

async function upsertUser(data: {
  fullName: string;
  mobileNumber: string;
  userType: string;
  state?: string;
  district?: string;
}) {
  const existing = await db.select().from(users).where(eq(users.mobileNumber, data.mobileNumber));
  if (existing[0]) {
    const [u] = await db
      .update(users)
      .set({ ...data, isVerified: true, updatedAt: new Date() })
      .where(eq(users.id, existing[0].id))
      .returning();
    return u;
  }
  const [u] = await db
    .insert(users)
    .values({ ...data, isVerified: true })
    .returning();
  return u;
}

export async function seedSyntheticWorld(): Promise<{
  urls: string[];
  farmerIds: Record<string, number>;
}> {
  const urls: string[] = [];
  const farmerIds: Record<string, number> = {};

  const ramesh = await upsertUser(personas.ramesh);
  const suresh = await upsertUser(personas.suresh);
  const anita = await upsertUser(personas.anita);
  const ibrahim = await upsertUser(personas.ibrahim);
  const pooja = await upsertUser(personas.pooja);
  farmerIds.ramesh = ramesh.id;
  farmerIds.suresh = suresh.id;
  farmerIds.anita = anita.id;
  farmerIds.ibrahim = ibrahim.id;
  farmerIds.pooja = pooja.id;

  async function ensureLand(farmerId: number, p: typeof personas.ramesh) {
    const existing = await db.select().from(landHoldings).where(eq(landHoldings.farmerId, farmerId));
    if (existing[0]) return existing[0];
    const [land] = await db
      .insert(landHoldings)
      .values({
        farmerId,
        area: p.areaHa,
        surveyNumber: p.surveyNumber,
        coordinates: p.coordinates,
        isVerified: p.surveyNumber.length > 5,
        blockchainHash: p.surveyNumber.length > 5 ? `0xsynth${farmerId}` : null,
      })
      .returning();
    return land;
  }

  const rameshLand = await ensureLand(ramesh.id, personas.ramesh);
  const sureshLand = await ensureLand(suresh.id, personas.suresh);
  const anitaLand = await ensureLand(anita.id, personas.anita);
  const ibrahimLand = await ensureLand(ibrahim.id, personas.ibrahim);

  const seasonStart = new Date("2026-06-01T00:00:00+05:30");
  const seasonEnd = new Date("2026-09-30T00:00:00+05:30");

  async function ensurePolicy(opts: {
    farmerId: number;
    landId: number;
    type: string;
    coverage: string;
    premium: string;
    threshold: number;
    status?: string;
    triggerType?: string;
    dryDayLimit?: number;
  }) {
    const existing = await db.select().from(policies).where(eq(policies.farmerId, opts.farmerId));
    const match = existing.find((p) => p.policyType === opts.type && p.status === (opts.status || "active"));
    if (match) return match;
    const [policy] = await db
      .insert(policies)
      .values({
        farmerId: opts.farmerId,
        landHoldingId: opts.landId,
        policyType: opts.type,
        coverageAmount: opts.coverage,
        premiumAmount: opts.premium,
        rainfallThreshold: opts.threshold,
        season: "kharif",
        validFrom: seasonStart,
        validTo: seasonEnd,
        status: opts.status || "active",
        triggerType: opts.triggerType || "cumulative_rainfall",
        dryDayLimit: opts.dryDayLimit ?? 21,
        dryDayMaxMm: 5,
      })
      .returning();
    return policy;
  }

  const rameshPolicy = await ensurePolicy({
    farmerId: ramesh.id,
    landId: rameshLand.id,
    type: "premium",
    coverage: "60000",
    premium: "4800",
    threshold: 120,
  });
  await ensurePolicy({
    farmerId: suresh.id,
    landId: sureshLand.id,
    type: "comprehensive",
    coverage: "750000",
    premium: "65000",
    threshold: 150,
  });
  const anitaPolicy21 = await ensurePolicy({
    farmerId: anita.id,
    landId: anitaLand.id,
    type: "premium",
    coverage: "12500",
    premium: "8000",
    threshold: 100,
    triggerType: "dry_day",
    dryDayLimit: 21,
  });
  // Twin policy stopped at dry-day limit 20 — should not auto-pay in scan demos
  const anitaPolicies = await db.select().from(policies).where(eq(policies.farmerId, anita.id));
  let anitaPolicy20 = anitaPolicies.find((p) => p.dryDayLimit === 20);
  if (!anitaPolicy20) {
    const [p] = await db
      .insert(policies)
      .values({
        farmerId: anita.id,
        landHoldingId: anitaLand.id,
        policyType: "basic",
        coverageAmount: "10000",
        premiumAmount: "5000",
        rainfallThreshold: 100,
        season: "kharif",
        validFrom: seasonStart,
        validTo: seasonEnd,
        status: "active",
        triggerType: "dry_day",
        dryDayLimit: 20,
        dryDayMaxMm: 5,
      })
      .returning();
    anitaPolicy20 = p;
  }
  void anitaPolicy20;

  await ensurePolicy({
    farmerId: ibrahim.id,
    landId: ibrahimLand.id,
    type: "basic",
    coverage: "25000",
    premium: "2500",
    threshold: 100,
    status: "expired",
  });

  async function ensureClaim(opts: {
    claimNumber: string;
    farmerId: number;
    policyId: number;
    amount: string;
    status: string;
    rainfall?: number;
    reason?: string;
  }) {
    const existing = await db.select().from(claims).where(eq(claims.claimNumber, opts.claimNumber));
    if (existing[0]) return existing[0];
    const [claim] = await db
      .insert(claims)
      .values({
        claimNumber: opts.claimNumber,
        farmerId: opts.farmerId,
        policyId: opts.policyId,
        claimAmount: opts.amount,
        actualRainfall: opts.rainfall,
        status: opts.status,
        reasonCode: opts.reason,
        settlementTime: opts.status === "settled" ? 6 : 12,
        processedAt: SYNTHETIC_CLOCK,
        settledAt: opts.status === "settled" ? SYNTHETIC_CLOCK : null,
        aiDecision: { synthetic: true },
      })
      .returning();
    return claim;
  }

  const settled = await ensureClaim({
    claimNumber: claimNumbers.rameshSettled,
    farmerId: ramesh.id,
    policyId: rameshPolicy.id,
    amount: "18000",
    status: "settled",
    rainfall: 84,
  });
  const approved = await ensureClaim({
    claimNumber: claimNumbers.rameshApproved,
    farmerId: ramesh.id,
    policyId: rameshPolicy.id,
    amount: "36000",
    status: "approved",
    rainfall: 48,
  });
  await ensureClaim({
    claimNumber: claimNumbers.ibrahimRejected,
    farmerId: ibrahim.id,
    policyId: (await db.select().from(policies).where(eq(policies.farmerId, ibrahim.id)))[0].id,
    amount: "0",
    status: "rejected",
    reason: "land_not_verified",
  });
  const anitaClaim = await ensureClaim({
    claimNumber: claimNumbers.anitaParametric,
    farmerId: anita.id,
    policyId: anitaPolicy21.id,
    amount: "12500",
    status: "settled",
    rainfall: 42,
  });

  async function ensurePayment(claimId: number, amount: string, status: string, upi?: string) {
    const existing = await db.select().from(payments).where(eq(payments.claimId, claimId));
    if (existing[0]) return existing[0];
    const [payment] = await db
      .insert(payments)
      .values({
        claimId,
        amount,
        bankAccount: "****7890",
        ifscCode: "SBIN0001234",
        transactionId: status === "completed" ? `UPI-2026-${claimId}` : `TXN-PEND-${claimId}`,
        status,
        paymentMethod: upi ? "upi" : "bank_transfer",
        upiVpa: upi,
        disbursementMode: upi ? "upi" : "bank_transfer",
        completedAt: status === "completed" ? SYNTHETIC_CLOCK : null,
      })
      .returning();
    return payment;
  }

  await ensurePayment(settled.id, "18000", "completed");
  await ensurePayment(approved.id, "36000", "initiated");
  await ensurePayment(anitaClaim.id, "12500", "completed", personas.anita.upiVpa);
  const ibrahimClaims = await db.select().from(claims).where(eq(claims.farmerId, ibrahim.id));
  if (ibrahimClaims[0]) {
    await ensurePayment(ibrahimClaims[0].id, "5000", "failed");
  }

  for (const row of rameshRainfallSeries()) {
    const day = new Date(row.date);
    const existing = await db
      .select()
      .from(weatherData)
      .where(eq(weatherData.district, "Latur"));
    const already = existing.some(
      (w) => w.source === "SYNTHETIC" && w.date.toISOString().slice(0, 10) === day.toISOString().slice(0, 10),
    );
    if (!already) {
      await db.insert(weatherData).values({
        district: "Latur",
        state: "Maharashtra",
        date: day,
        rainfall: row.rainfall,
        temperature: "32.0",
        humidity: 45,
        source: "SYNTHETIC",
        isVerified: true,
      });
    }
  }

  for (const row of anitaDryDaySeries()) {
    const day = new Date(row.date);
    const existing = await db.select().from(weatherData).where(eq(weatherData.district, "Wardha"));
    const already = existing.some(
      (w) => w.source === "SYNTHETIC" && w.date.toISOString().slice(0, 10) === day.toISOString().slice(0, 10),
    );
    if (!already) {
      await db.insert(weatherData).values({
        district: "Wardha",
        state: "Maharashtra",
        date: day,
        rainfall: row.rainfall,
        temperature: "34.0",
        humidity: 40,
        source: "SYNTHETIC",
        isVerified: true,
      });
    }
  }

  async function ensureChannel(userId: number, phone: string, language: string, upi?: string) {
    const existing = await db
      .select()
      .from(farmerChannelProfiles)
      .where(eq(farmerChannelProfiles.phoneE164, phone));
    if (existing[0]) return existing[0];
    const [row] = await db
      .insert(farmerChannelProfiles)
      .values({
        userId,
        phoneE164: phone,
        waId: phone.replace("+", ""),
        preferredLanguage: language,
        upiVpa: upi,
        advisoryOptIn: true,
        lastInboundAt: SYNTHETIC_CLOCK,
      })
      .returning();
    return row;
  }

  await ensureChannel(ramesh.id, personas.ramesh.mobileNumber, personas.ramesh.language, personas.ramesh.upiVpa);
  await ensureChannel(suresh.id, personas.suresh.mobileNumber, personas.suresh.language, personas.suresh.upiVpa);
  await ensureChannel(anita.id, personas.anita.mobileNumber, personas.anita.language, personas.anita.upiVpa);

  const meeraSessions = await db
    .select()
    .from(channelSessions)
    .where(eq(channelSessions.phoneE164, personas.meera.mobileNumber));
  if (!meeraSessions[0]) {
    await db.insert(channelSessions).values({
      phoneE164: personas.meera.mobileNumber,
      state: { step: "awaiting_registration" },
      expiresAt: new Date(SYNTHETIC_CLOCK.getTime() + 15 * 60 * 1000),
    });
  }

  const sureshFarms = await db.select().from(farmProfiles).where(eq(farmProfiles.farmerId, suresh.id));
  if (!sureshFarms[0]) {
    await db.insert(farmProfiles).values({
      farmerId: suresh.id,
      landHoldingId: sureshLand.id,
      crop: "wheat",
      sowingDate: new Date(personas.suresh.sowingDate),
      acreage: "10.00",
    });
  }

  const triggers = await db
    .select()
    .from(parametricTriggers)
    .where(eq(parametricTriggers.policyId, anitaPolicy21.id));
  if (!triggers[0]) {
    await db.insert(parametricTriggers).values({
      policyId: anitaPolicy21.id,
      triggerType: "drought_deficit",
      windowStart: new Date("2026-09-10T00:00:00+05:30"),
      windowEnd: new Date("2026-09-30T00:00:00+05:30"),
      dryDayCount: 21,
      rainfallMm: 42,
      isAutoDisbursed: true,
      claimId: anitaClaim.id,
      disbursementRef: "UPI-2026-4419",
    });
  }

  await db.insert(notifications).values({
    userId: ramesh.id,
    title: "Claim Approved",
    message: `Claim ${claimNumbers.rameshApproved} approved for ₹36,000.`,
    type: "success",
    isRead: false,
    metadata: { claimNumber: claimNumbers.rameshApproved },
  }).catch(() => undefined);

  // Damage assessments for Pooja's queue (inside + outside)
  const existingAssessments = await db.select().from(damageAssessments);
  if (existingAssessments.length === 0) {
    const [msgIn] = await db
      .insert(ambientMessages)
      .values({
        externalMessageId: "wamid.SYNTH_PHOTO_IN",
        phoneE164: personas.ramesh.mobileNumber,
        direction: "inbound",
        messageType: "image",
        intent: "image_damage",
        aiModelUsed: "mock-vision",
        latencyMs: 400,
      })
      .returning();
    await db.insert(damageAssessments).values({
      messageId: msgIn.id,
      claimId: approved.id,
      damageType: "leaf_rust",
      severityPct: 35,
      confidence: "0.880",
      lat: "18.4089000",
      lng: "76.5605000",
      distanceM: 180,
      accepted: true,
    });
    const [msgOut] = await db
      .insert(ambientMessages)
      .values({
        externalMessageId: "wamid.SYNTH_PHOTO_OUT",
        phoneE164: personas.ibrahim.mobileNumber,
        direction: "inbound",
        messageType: "image",
        intent: "image_damage",
        aiModelUsed: "mock-vision",
        latencyMs: 420,
      })
      .returning();
    await db.insert(damageAssessments).values({
      messageId: msgOut.id,
      damageType: "leaf_rust",
      severityPct: 40,
      confidence: "0.850",
      lat: "19.8818000",
      lng: "75.3433000",
      distanceM: 620,
      accepted: false,
    });
  }

  urls.push(`/dashboard/farmer/${ramesh.id}`);
  urls.push(`/payment/${approved.id}`);
  urls.push(`/dashboard/farmer/${suresh.id}`);
  urls.push(`/dashboard/farmer/${anita.id}`);
  urls.push(`/dashboard/farmer/${ibrahim.id}`);
  urls.push(`/dashboard/insurer`);
  urls.push(`/dev/scenarios`);

  return { urls, farmerIds };
}
