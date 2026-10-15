/**
 * Generate 90 days of synthetic Mixpanel activity for CropGuard.
 *
 * Usage:
 *   npm run generate-data
 *   npm run generate-data -- --dry-run
 *
 * Auth (any alias works):
 *   MIXPANEL_SERVICE_ACCOUNT_USERNAME | MIXPANEL_SERVICE_ACCOUNT_USER
 *   MIXPANEL_SERVICE_ACCOUNT_SECRET   | MIXPANEL_SERVICE_ACCOUNT_PASS
 *   MIXPANEL_PROJECT_ID
 *   MIXPANEL_TOKEN | MIXPANEL_PROJECT_TOKEN  (for People $set via /engage)
 */
import "dotenv/config";
import { createHash, randomUUID } from "crypto";

const PROJECT_ID = process.env.MIXPANEL_PROJECT_ID || "";
const TOKEN =
  process.env.MIXPANEL_TOKEN || process.env.MIXPANEL_PROJECT_TOKEN || "";
const SA_USER =
  process.env.MIXPANEL_SERVICE_ACCOUNT_USERNAME ||
  process.env.MIXPANEL_SERVICE_ACCOUNT_USER ||
  "";
const SA_SECRET =
  process.env.MIXPANEL_SERVICE_ACCOUNT_SECRET ||
  process.env.MIXPANEL_SERVICE_ACCOUNT_PASS ||
  "";

const DRY_RUN = process.argv.includes("--dry-run");
const BATCH_SIZE = 2000;
const DAYS = 90;
const SEED = 20261015;

const STATES = {
  Maharashtra: {
    districts: ["Latur", "Osmanabad", "Solapur"],
    language: "mr",
    payoutRate: 0.4,
  },
  Rajasthan: {
    districts: ["Barmer", "Jaisalmer", "Jodhpur"],
    language: "hi",
    payoutRate: 0.4,
  },
  Punjab: {
    districts: ["Ludhiana", "Amritsar", "Patiala", "Bathinda"],
    language: "pa",
    payoutRate: 0.1,
  },
} as const;

const CROPS = ["wheat", "cotton", "soybean", "groundnut", "bajra", "rice"] as const;
const REJECTION_REASONS = [
  "photo_quality",
  "location_mismatch",
  "outside_coverage_area",
] as const;

type MixpanelEvent = {
  event: string;
  properties: Record<string, string | number | boolean | null>;
};

type Farmer = {
  id: number;
  distinctId: string;
  state: keyof typeof STATES;
  district: string;
  language: string;
  channel: "whatsapp" | "voice";
  crop: (typeof CROPS)[number];
  coverage: number;
  premium: number;
  buyPath: "purchase" | "renew" | "quote_only";
  policyId: string;
};

type Insurer = {
  id: number;
  distinctId: string;
  organizationId: string;
  role: "underwriter" | "claims_manager" | "admin";
  name: string;
  email: string;
};

/** Deterministic PRNG (mulberry32) */
function makeRng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function insertId(eventName: string, distinctId: string, dateStr: string, salt = ""): string {
  return createHash("sha256")
    .update(`${eventName}|${distinctId}|${dateStr}|${salt}`)
    .digest("hex")
    .slice(0, 32);
}

function dayTimestamp(dayOffset: number, rng: () => number): number {
  const end = Date.UTC(2026, 9, 15, 12, 0, 0); // 15 Oct 2026 noon UTC
  const start = end - DAYS * 24 * 60 * 60 * 1000;
  const dayMs = start + dayOffset * 24 * 60 * 60 * 1000;
  const hour = Math.floor(rng() * 14) + 6; // 06–19
  const minute = Math.floor(rng() * 60);
  return Math.floor((dayMs + hour * 3600000 + minute * 60000) / 1000);
}

function dateStr(dayOffset: number): string {
  const end = new Date(Date.UTC(2026, 9, 15));
  const d = new Date(end.getTime() - (DAYS - 1 - dayOffset) * 86400000);
  return d.toISOString().slice(0, 10);
}

function skewedCoverage(rng: () => number): number {
  // Skew toward 25k–75k within 10k–200k
  const u = rng();
  if (u < 0.7) return Math.round(25000 + rng() * 50000);
  if (u < 0.9) return Math.round(10000 + rng() * 15000);
  return Math.round(75000 + rng() * 125000);
}

function buildFarmers(rng: () => number): Farmer[] {
  const districtPool: Array<{ state: keyof typeof STATES; district: string }> = [];
  for (const [state, cfg] of Object.entries(STATES) as Array<
    [keyof typeof STATES, (typeof STATES)[keyof typeof STATES]]
  >) {
    for (const district of cfg.districts) {
      districtPool.push({ state, district });
    }
  }

  const farmers: Farmer[] = [];
  for (let i = 1; i <= 150; i++) {
    const loc = districtPool[(i - 1) % districtPool.length]!;
    const cfg = STATES[loc.state];
    const coverage = skewedCoverage(rng);
    const premiumRate = 0.02 + rng() * 0.03;
    const pathRoll = rng();
    const buyPath: Farmer["buyPath"] =
      pathRoll < 0.6 ? "purchase" : pathRoll < 0.85 ? "renew" : "quote_only";
    farmers.push({
      id: i,
      distinctId: `farmer_${i}`,
      state: loc.state,
      district: loc.district,
      language: rng() < 0.15 ? "hi" : cfg.language,
      channel: rng() < 0.7 ? "whatsapp" : "voice",
      crop: pick(rng, CROPS),
      coverage,
      premium: Math.round(coverage * premiumRate),
      buyPath,
      policyId: randomUUID(), // overwritten with deterministic below
    });
  }

  // Deterministic policy UUIDs from seed
  for (const f of farmers) {
    const hex = createHash("sha256").update(`policy_${SEED}_${f.id}`).digest("hex");
    f.policyId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }
  return farmers;
}

function buildInsurers(): Insurer[] {
  const roles: Insurer["role"][] = [
    "claims_manager",
    "claims_manager",
    "claims_manager",
    "claims_manager",
    "underwriter",
    "underwriter",
    "underwriter",
    "underwriter",
    "admin",
    "admin",
  ];
  return roles.map((role, idx) => {
    const id = idx + 1;
    const org = `org_${((id - 1) % 3) + 1}`;
    return {
      id,
      distinctId: `insurer_${id}`,
      organizationId: org,
      role,
      name: `Insurer ${id}`,
      email: `insurer${id}@cropguard.demo`,
    };
  });
}

function rainfallFor(state: keyof typeof STATES, dayOffset: number, rng: () => number): number {
  // Seasonal deficit: lower rain mid-window for MH/RJ
  const base =
    state === "Punjab" ? 8 + rng() * 12 : state === "Maharashtra" ? 2 + rng() * 6 : 0.5 + rng() * 4;
  const droughtDip = dayOffset > 40 && dayOffset < 70 ? 0.4 : 1;
  return Math.round(base * droughtDip * 10) / 10;
}

function generateEvents(farmers: Farmer[], insurers: Insurer[]): MixpanelEvent[] {
  const rng = makeRng(SEED);
  const events: MixpanelEvent[] = [];

  // Onboard + people profiles (day 0..14 staggered)
  for (const f of farmers) {
    const onboardDay = Math.floor(rng() * 15);
    const t = dayTimestamp(onboardDay, rng);
    const d = dateStr(onboardDay);
    events.push({
      event: "farmer_onboarded",
      properties: {
        token: TOKEN,
        time: t,
        distinct_id: f.distinctId,
        $insert_id: insertId("farmer_onboarded", f.distinctId, d),
        channel: f.channel,
        language: f.language,
        state: f.state,
        district: f.district,
        is_returning: f.buyPath === "renew",
      },
    });
  }

  for (let day = 0; day < DAYS; day++) {
    const d = dateStr(day);
    const dayRng = makeRng(SEED + day * 9973);

    // Weather per district
    for (const [state, cfg] of Object.entries(STATES) as Array<
      [keyof typeof STATES, (typeof STATES)[keyof typeof STATES]]
    >) {
      for (const district of cfg.districts) {
        const rain = rainfallFor(state, day, dayRng);
        const dry = rain < 5 ? 1 : 0;
        events.push({
          event: "weather_data_ingested",
          properties: {
            token: TOKEN,
            time: dayTimestamp(day, dayRng),
            distinct_id: `weather_${district}`,
            $insert_id: insertId("weather_data_ingested", district, d),
            district,
            state,
            data_source: "SYNTHETIC_IMD",
            rainfall_mm: rain,
            dry_day_count: dry,
          },
        });
      }
    }

    // WhatsApp / voice volume
    const waCount = 20 + Math.floor(dayRng() * 41);
    const voiceCount = 5 + Math.floor(dayRng() * 11);
    for (let i = 0; i < waCount; i++) {
      const f = pick(dayRng, farmers);
      events.push({
        event: "whatsapp_message_received",
        properties: {
          token: TOKEN,
          time: dayTimestamp(day, dayRng),
          distinct_id: f.distinctId,
          $insert_id: insertId("whatsapp_message_received", f.distinctId, d, String(i)),
          language: f.language,
          intent: pick(dayRng, ["purchase", "query", "claim_status", "renewal"] as const),
          district: f.district,
        },
      });
      events.push({
        event: "language_detected",
        properties: {
          token: TOKEN,
          time: dayTimestamp(day, dayRng),
          distinct_id: f.distinctId,
          $insert_id: insertId("language_detected", f.distinctId, d, String(i)),
          language: f.language,
          channel: "whatsapp",
          district: f.district,
        },
      });
    }
    for (let i = 0; i < voiceCount; i++) {
      const f = pick(dayRng, farmers.filter((x) => x.channel === "voice").length
        ? farmers.filter((x) => x.channel === "voice")
        : farmers);
      events.push({
        event: "voice_call_received",
        properties: {
          token: TOKEN,
          time: dayTimestamp(day, dayRng),
          distinct_id: f.distinctId,
          $insert_id: insertId("voice_call_received", f.distinctId, d, String(i)),
          language: f.language,
          duration_seconds: 30 + Math.floor(dayRng() * 240),
          intent: pick(dayRng, ["purchase", "query", "claim_status", "renewal"] as const),
          district: f.district,
          call_outcome: pick(dayRng, ["completed", "completed", "completed", "dropped", "no_answer"] as const),
        },
      });
    }

    // Policy purchases front-loaded first 30 days
    const purchaseTarget =
      day < 30 ? 2 + Math.floor(dayRng() * 7) : Math.floor(dayRng() * 3);
    const candidates = farmers.filter((f) => f.buyPath !== "quote_only");
    for (let i = 0; i < purchaseTarget; i++) {
      const f = pick(dayRng, candidates);
      const isRenew = f.buyPath === "renew" && dayRng() < 0.5;
      if (isRenew) {
        events.push({
          event: "policy_renewed",
          properties: {
            token: TOKEN,
            time: dayTimestamp(day, dayRng),
            distinct_id: f.distinctId,
            $insert_id: insertId("policy_renewed", f.distinctId, d, String(i)),
            policy_id: f.policyId,
            previous_season: "rabi",
            crop_type: f.crop,
            district: f.district,
            channel: f.channel,
          },
        });
      } else {
        events.push({
          event: "policy_quote_requested",
          properties: {
            token: TOKEN,
            time: dayTimestamp(day, dayRng),
            distinct_id: f.distinctId,
            $insert_id: insertId("policy_quote_requested", f.distinctId, d, String(i)),
            crop_type: f.crop,
            coverage_amount: f.coverage,
            district: f.district,
            season: "kharif",
            channel: f.channel,
            language: f.language,
          },
        });
        if (f.buyPath !== "quote_only") {
          events.push({
            event: "policy_purchased",
            properties: {
              token: TOKEN,
              time: dayTimestamp(day, dayRng),
              distinct_id: f.distinctId,
              $insert_id: insertId("policy_purchased", f.distinctId, d, String(i)),
              policy_id: f.policyId,
              crop_type: f.crop,
              coverage_amount: f.coverage,
              premium_amount: f.premium,
              district: f.district,
              state: f.state,
              season: "kharif",
              channel: f.channel,
              language: f.language,
            },
          });
        }
      }
    }

    // Quote-only farmers occasionally
    if (day % 3 === 0) {
      const f = pick(
        dayRng,
        farmers.filter((x) => x.buyPath === "quote_only"),
      );
      events.push({
        event: "policy_quote_requested",
        properties: {
          token: TOKEN,
          time: dayTimestamp(day, dayRng),
          distinct_id: f.distinctId,
          $insert_id: insertId("policy_quote_requested", f.distinctId, d, "qo"),
          crop_type: f.crop,
          coverage_amount: f.coverage,
          district: f.district,
          season: "kharif",
          channel: f.channel,
          language: f.language,
        },
      });
    }

    // Field evidence
    const photoCount = 3 + Math.floor(dayRng() * 10);
    for (let i = 0; i < photoCount; i++) {
      const f = pick(dayRng, farmers);
      const hasPin = dayRng() < 0.75;
      events.push({
        event: "field_photo_submitted",
        properties: {
          token: TOKEN,
          time: dayTimestamp(day, dayRng),
          distinct_id: f.distinctId,
          $insert_id: insertId("field_photo_submitted", f.distinctId, d, String(i)),
          policy_id: f.policyId,
          district: f.district,
          has_location_pin: hasPin,
          photo_count: 1 + Math.floor(dayRng() * 3),
          channel: f.channel,
        },
      });
      if (hasPin) {
        events.push({
          event: "location_pin_shared",
          properties: {
            token: TOKEN,
            time: dayTimestamp(day, dayRng),
            distinct_id: f.distinctId,
            $insert_id: insertId("location_pin_shared", f.distinctId, d, String(i)),
            policy_id: f.policyId,
            district: f.district,
            state: f.state,
            accuracy_meters: Math.round(5 + dayRng() * 80),
          },
        });
      } else if (dayRng() < 0.1) {
        events.push({
          event: "evidence_submission_failed",
          properties: {
            token: TOKEN,
            time: dayTimestamp(day, dayRng),
            distinct_id: f.distinctId,
            $insert_id: insertId("evidence_submission_failed", f.distinctId, d, String(i)),
            policy_id: f.policyId,
            failure_reason: pick(dayRng, ["outside_geofence", "photo_blurry", "upload_timeout"] as const),
            channel: f.channel,
          },
        });
      }
    }

    // Payout pipeline ramps from day 45
    if (day >= 45) {
      const evalCount = 10 + Math.floor(dayRng() * 11);
      for (let i = 0; i < evalCount; i++) {
        const f = pick(dayRng, farmers);
        const rate = STATES[f.state].payoutRate;
        const met = dayRng() < rate;
        events.push({
          event: "payout_trigger_evaluated",
          properties: {
            token: TOKEN,
            time: dayTimestamp(day, dayRng),
            distinct_id: f.distinctId,
            $insert_id: insertId("payout_trigger_evaluated", f.distinctId, d, String(i)),
            policy_id: f.policyId,
            district: f.district,
            trigger_type: dayRng() < 0.5 ? "dry_day" : "rainfall_deficit",
            threshold_met: met,
            season: "kharif",
          },
        });
      }
    }

    if (day >= 50) {
      const payouts = 1 + Math.floor(dayRng() * 6);
      const districtBuckets = new Map<string, { count: number; amount: number; trigger: string }>();
      for (let i = 0; i < payouts; i++) {
        const f = pick(dayRng, farmers);
        if (dayRng() > STATES[f.state].payoutRate) continue;
        const amount = Math.round(f.coverage * (0.4 + dayRng() * 0.6));
        const trigger = dayRng() < 0.5 ? "dry_day" : "rainfall_deficit";
        const hours = 12 + Math.floor(dayRng() * 61);
        events.push({
          event: "payout_initiated",
          properties: {
            token: TOKEN,
            time: dayTimestamp(day, dayRng),
            distinct_id: f.distinctId,
            $insert_id: insertId("payout_initiated", f.distinctId, d, String(i)),
            policy_id: f.policyId,
            payout_amount: amount,
            trigger_type: trigger,
            district: f.district,
            crop_type: f.crop,
          },
        });
        if (dayRng() < 0.05) {
          events.push({
            event: "payout_failed",
            properties: {
              token: TOKEN,
              time: dayTimestamp(day, dayRng),
              distinct_id: f.distinctId,
              $insert_id: insertId("payout_failed", f.distinctId, d, String(i)),
              policy_id: f.policyId,
              failure_reason: pick(dayRng, ["upi_timeout", "bank_rejected", "insufficient_funds"] as const),
              retry_count: 1 + Math.floor(dayRng() * 3),
            },
          });
        } else {
          events.push({
            event: "payout_completed",
            properties: {
              token: TOKEN,
              time: dayTimestamp(day, dayRng),
              distinct_id: f.distinctId,
              $insert_id: insertId("payout_completed", f.distinctId, d, String(i)),
              policy_id: f.policyId,
              payout_amount: amount,
              payment_method: dayRng() < 0.8 ? "upi" : "bank_transfer",
              time_to_payout_hours: hours,
              district: f.district,
            },
          });
          const b = districtBuckets.get(f.district) || { count: 0, amount: 0, trigger };
          b.count += 1;
          b.amount += amount;
          districtBuckets.set(f.district, b);
        }
      }
      for (const [district, b] of districtBuckets) {
        events.push({
          event: "payout_trigger_fired",
          properties: {
            token: TOKEN,
            time: dayTimestamp(day, dayRng),
            distinct_id: `district_${district}`,
            $insert_id: insertId("payout_trigger_fired", district, d),
            district,
            trigger_type: b.trigger,
            affected_policies_count: b.count,
            total_payout_amount: b.amount,
          },
        });
      }
    }

    // Insurer console DAU
    const weekday = new Date(dateStr(day) + "T12:00:00Z").getUTCDay();
    const isWeekend = weekday === 0 || weekday === 6;
    const activeCount = isWeekend ? 1 + Math.floor(dayRng() * 2) : 5 + Math.floor(dayRng() * 4);
    const shuffled = [...insurers].sort(() => dayRng() - 0.5).slice(0, activeCount);
    for (const ins of shuffled) {
      events.push({
        event: "insurer_signed_in",
        properties: {
          token: TOKEN,
          time: dayTimestamp(day, dayRng),
          distinct_id: ins.distinctId,
          $insert_id: insertId("insurer_signed_in", ins.distinctId, d),
          organization_id: ins.organizationId,
          role: ins.role,
        },
      });
      events.push({
        event: "policy_list_viewed",
        properties: {
          token: TOKEN,
          time: dayTimestamp(day, dayRng),
          distinct_id: ins.distinctId,
          $insert_id: insertId("policy_list_viewed", ins.distinctId, d),
          filter_district: dayRng() < 0.5 ? pick(dayRng, ["Latur", "Barmer", "Ludhiana"] as const) : null,
          filter_season: "kharif",
          filter_crop_type: dayRng() < 0.3 ? pick(dayRng, CROPS) : null,
          result_count: 20 + Math.floor(dayRng() * 80),
        },
      });
    }

    // Evidence inspected for photos (lag 1–3 days → approximate same-day sample)
    if (day >= 2) {
      const inspectN = 3 + Math.floor(dayRng() * 8);
      for (let i = 0; i < inspectN; i++) {
        const f = pick(dayRng, farmers);
        const ins = pick(dayRng, insurers);
        const approved = dayRng() < 0.85;
        events.push({
          event: "evidence_inspected",
          properties: {
            token: TOKEN,
            time: dayTimestamp(day, dayRng),
            distinct_id: ins.distinctId,
            $insert_id: insertId("evidence_inspected", ins.distinctId, d, String(i)),
            policy_id: f.policyId,
            evidence_type: dayRng() < 0.7 ? "photo" : "location",
            review_outcome: approved ? "approved" : dayRng() < 0.5 ? "flagged" : "pending",
          },
        });
        events.push({
          event: "policy_detail_viewed",
          properties: {
            token: TOKEN,
            time: dayTimestamp(day, dayRng),
            distinct_id: ins.distinctId,
            $insert_id: insertId("policy_detail_viewed", ins.distinctId, d, String(i)),
            policy_id: f.policyId,
            district: f.district,
            crop_type: f.crop,
            status: pick(dayRng, [
              "active",
              "pending_evidence",
              "payout_triggered",
              "settled",
              "rejected",
            ] as const),
          },
        });
        if (approved && dayRng() < 0.4) {
          events.push({
            event: "claim_approved",
            properties: {
              token: TOKEN,
              time: dayTimestamp(day, dayRng),
              distinct_id: ins.distinctId,
              $insert_id: insertId("claim_approved", ins.distinctId, d, String(i)),
              policy_id: f.policyId,
              payout_amount: Math.round(f.coverage * 0.5),
              district: f.district,
              crop_type: f.crop,
            },
          });
        } else if (!approved && dayRng() < 0.5) {
          events.push({
            event: "claim_rejected",
            properties: {
              token: TOKEN,
              time: dayTimestamp(day, dayRng),
              distinct_id: ins.distinctId,
              $insert_id: insertId("claim_rejected", ins.distinctId, d, String(i)),
              policy_id: f.policyId,
              rejection_reason: pick(dayRng, REJECTION_REASONS),
              district: f.district,
            },
          });
        }
        if (dayRng() < 0.15) {
          events.push({
            event: "claim_debugged",
            properties: {
              token: TOKEN,
              time: dayTimestamp(day, dayRng),
              distinct_id: ins.distinctId,
              $insert_id: insertId("claim_debugged", ins.distinctId, d, String(i)),
              policy_id: f.policyId,
              issue_type: pick(dayRng, ["geofence", "rainfall_mismatch", "duplicate_claim"] as const),
              resolution_action: pick(dayRng, ["manual_approve", "request_reupload", "escalate"] as const),
            },
          });
        }
      }
    }

    if (dayRng() < 0.2) {
      const ins = pick(dayRng, insurers);
      events.push({
        event: "report_exported",
        properties: {
          token: TOKEN,
          time: dayTimestamp(day, dayRng),
          distinct_id: ins.distinctId,
          $insert_id: insertId("report_exported", ins.distinctId, d),
          report_type: pick(dayRng, ["claims_overview", "payout_ledger", "portfolio_risk"] as const),
          district: pick(dayRng, ["Latur", "Barmer", "Ludhiana"] as const),
          season: "kharif",
          format: pick(dayRng, ["csv", "pdf", "json"] as const),
        },
      });
    }

    // Rule updates day 15 and 60
    if (day === 15 || day === 60) {
      const ins = insurers.find((x) => x.role === "admin") || insurers[0]!;
      events.push({
        event: "parametric_rule_updated",
        properties: {
          token: TOKEN,
          time: dayTimestamp(day, dayRng),
          distinct_id: ins.distinctId,
          $insert_id: insertId("parametric_rule_updated", ins.distinctId, d),
          rule_type: day === 15 ? "dry_day_count" : "rainfall_threshold",
          old_value: day === 15 ? 21 : 100,
          new_value: day === 15 ? 18 : 90,
          district: "Latur",
        },
      });
    }
  }

  return events;
}

function buildPeopleUpdates(farmers: Farmer[], insurers: Insurer[]): unknown[] {
  const updates: unknown[] = [];
  const now = new Date().toISOString();
  for (const f of farmers) {
    updates.push({
      $token: TOKEN,
      $distinct_id: f.distinctId,
      $set: {
        $name: `Farmer-${f.district}`,
        primary_channel: f.channel,
        preferred_language: f.language,
        state: f.state,
        district: f.district,
        active_policies_count: f.buyPath === "quote_only" ? 0 : 1,
        total_premium_paid: f.buyPath === "quote_only" ? 0 : f.premium,
        total_payout_received: 0,
        first_policy_season: "kharif",
        created_at: now,
      },
    });
  }
  for (const ins of insurers) {
    updates.push({
      $token: TOKEN,
      $distinct_id: ins.distinctId,
      $set: {
        $name: ins.name,
        $email: ins.email,
        organization_id: ins.organizationId,
        role: ins.role,
        districts_managed: ["Latur", "Barmer", "Ludhiana"],
        created_at: now,
      },
    });
  }
  return updates;
}

async function sendImportBatch(batch: MixpanelEvent[], batchIndex: number, totalBatches: number) {
  const auth = Buffer.from(`${SA_USER}:${SA_SECRET}`).toString("base64");
  const url = `https://api.mixpanel.com/import?strict=1&project_id=${encodeURIComponent(PROJECT_ID)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(batch),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Import batch ${batchIndex}/${totalBatches} failed (${res.status}): ${text}`);
  }
  console.log(`Sent batch ${batchIndex}/${totalBatches} — ${batch.length} events`);
}

async function sendPeopleBatch(updates: unknown[]) {
  // Mixpanel engage endpoint accepts form-encoded data list
  const auth = Buffer.from(`${SA_USER}:${SA_SECRET}`).toString("base64");
  for (let i = 0; i < updates.length; i += 200) {
    const chunk = updates.slice(i, i + 200);
    const body = new URLSearchParams();
    body.set("data", JSON.stringify(chunk));
    body.set("verbose", "1");
    const res = await fetch("https://api.mixpanel.com/engage?verbose=1", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const text = await res.text();
    if (!res.ok) {
      console.warn(`People batch failed (${res.status}): ${text}`);
    } else {
      console.log(`Sent people profiles ${i + 1}–${i + chunk.length}`);
    }
  }
}

async function main() {
  if (!DRY_RUN) {
    if (!PROJECT_ID || !SA_USER || !SA_SECRET) {
      console.error(
        "Missing Mixpanel credentials. Set MIXPANEL_PROJECT_ID and service account user/secret.",
      );
      process.exit(1);
    }
    if (!TOKEN) {
      console.error("Missing MIXPANEL_TOKEN / MIXPANEL_PROJECT_TOKEN (needed on event payloads).");
      process.exit(1);
    }
  }

  const rng = makeRng(SEED);
  const farmers = buildFarmers(rng);
  const insurers = buildInsurers();
  const events = generateEvents(farmers, insurers);
  const people = buildPeopleUpdates(farmers, insurers);

  console.log(`Generated ${events.length} events and ${people.length} people profiles`);

  if (DRY_RUN) {
    const byType = new Map<string, MixpanelEvent[]>();
    for (const e of events) {
      const list = byType.get(e.event) || [];
      list.push(e);
      byType.set(e.event, list);
    }
    for (const [name, list] of [...byType.entries()].sort()) {
      console.log(`\n=== ${name} (${list.length}) — first 5 ===`);
      console.log(JSON.stringify(list.slice(0, 5), null, 2));
    }
    return;
  }

  // Strip token from properties for import API (auth is service account; token optional)
  const importEvents = events.map((e) => ({
    event: e.event,
    properties: { ...e.properties },
  }));

  const totalBatches = Math.ceil(importEvents.length / BATCH_SIZE);
  for (let i = 0; i < importEvents.length; i += BATCH_SIZE) {
    const batch = importEvents.slice(i, i + BATCH_SIZE);
    const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
    await sendImportBatch(batch, batchIndex, totalBatches);
  }

  await sendPeopleBatch(people);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
