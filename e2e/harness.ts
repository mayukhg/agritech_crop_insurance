/**
 * In-memory E2E harness: Express API + Vite client, no Postgres required.
 * Serves the real React UI against synthetic CropGuard 2.0 data.
 */
import express from "express";
import { createServer } from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import viteConfig from "../vite.config";
import { fixtures } from "../server/synthetic/world";
import { decideClaim, isSurveyNumberVerifiable } from "../server/agent/decideClaim";
import { createOrchestrator } from "../server/agent/orchestrator";
import { verifyWhatsAppSignature, signWhatsAppBody } from "../server/channels/whatsapp/signature";
import { parseWhatsAppWebhook } from "../server/channels/whatsapp/parse";
import { mustUseApprovedTemplate } from "../server/channels/whatsapp/sessionWindow";
import { isWithinParcel, parcelCenter } from "../server/lib/geofence";
import { normalizeToE164 } from "../server/lib/phone";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.E2E_PORT || 5055);
const orch = createOrchestrator();

type User = {
  id: number;
  fullName: string;
  mobileNumber: string;
  userType: string;
  state: string;
  district: string;
  isVerified: boolean;
};
type Policy = {
  id: number;
  farmerId: number;
  landHoldingId: number;
  policyType: string;
  coverageAmount: string;
  premiumAmount: string;
  rainfallThreshold: number;
  season: string;
  status: string;
  validFrom: string;
  validTo: string;
};
type Claim = {
  id: number;
  claimNumber: string;
  farmerId: number;
  policyId: number;
  claimAmount: string;
  actualRainfall: number | null;
  status: string;
  reasonCode?: string | null;
  processedAt?: string | null;
  settledAt?: string | null;
};
type Payment = {
  id: number;
  claimId: number;
  amount: string;
  status: string;
  transactionId: string;
  bankAccount: string;
  createdAt: string;
  completedAt?: string | null;
};

const db = {
  users: [] as User[],
  policies: [] as Policy[],
  claims: [] as Claim[],
  payments: [] as Payment[],
  land: [] as Array<{
    id: number;
    farmerId: number;
    area: string;
    surveyNumber: string;
    coordinates: { lat: number; lng: number };
    isVerified: boolean;
  }>,
  chats: [] as Array<{ id: number; farmerId: number; language: string; messages: any[] }>,
  ambient: [] as Array<{ externalMessageId: string; reply?: string }>,
  nextId: 1,
};

function seed() {
  db.users = [];
  db.policies = [];
  db.claims = [];
  db.payments = [];
  db.land = [];
  db.chats = [];
  db.ambient = [];
  db.nextId = 1;

  const ramesh: User = {
    id: db.nextId++,
    fullName: "Ramesh Patil",
    mobileNumber: "+919800000001",
    userType: "farmer",
    state: "Maharashtra",
    district: "Latur",
    isVerified: true,
  };
  const suresh: User = {
    id: db.nextId++,
    fullName: "Suresh Singh",
    mobileNumber: "+919800000002",
    userType: "farmer",
    state: "Punjab",
    district: "Ludhiana",
    isVerified: true,
  };
  const anita: User = {
    id: db.nextId++,
    fullName: "Anita Deshmukh",
    mobileNumber: "+919800000003",
    userType: "farmer",
    state: "Maharashtra",
    district: "Wardha",
    isVerified: true,
  };
  const ibrahim: User = {
    id: db.nextId++,
    fullName: "Ibrahim Khan",
    mobileNumber: "+919800000004",
    userType: "farmer",
    state: "Maharashtra",
    district: "Aurangabad",
    isVerified: true,
  };
  const pooja: User = {
    id: db.nextId++,
    fullName: "Pooja Shah",
    mobileNumber: "+919800000099",
    userType: "insurer",
    state: "Maharashtra",
    district: "Pune",
    isVerified: true,
  };
  db.users.push(ramesh, suresh, anita, ibrahim, pooja);

  const rLand = {
    id: db.nextId++,
    farmerId: ramesh.id,
    area: "1.20",
    surveyNumber: "LTR-2218",
    coordinates: { lat: 18.4088, lng: 76.5604 },
    isVerified: true,
  };
  db.land.push(rLand);

  const rPolicy: Policy = {
    id: db.nextId++,
    farmerId: ramesh.id,
    landHoldingId: rLand.id,
    policyType: "premium",
    coverageAmount: "60000",
    premiumAmount: "4800",
    rainfallThreshold: 120,
    season: "kharif",
    status: "active",
    validFrom: "2026-06-01T00:00:00.000Z",
    validTo: "2026-09-30T00:00:00.000Z",
  };
  db.policies.push(rPolicy);

  const settled: Claim = {
    id: db.nextId++,
    claimNumber: "CR-2026-1104",
    farmerId: ramesh.id,
    policyId: rPolicy.id,
    claimAmount: "18000",
    actualRainfall: 84,
    status: "settled",
    processedAt: "2026-09-01T10:00:00.000Z",
    settledAt: "2026-09-01T12:00:00.000Z",
  };
  const approved: Claim = {
    id: db.nextId++,
    claimNumber: "CR-2026-1842",
    farmerId: ramesh.id,
    policyId: rPolicy.id,
    claimAmount: "36000",
    actualRainfall: 48,
    status: "approved",
    processedAt: "2026-10-01T06:02:00.000Z",
  };
  const rejected: Claim = {
    id: db.nextId++,
    claimNumber: "CR-2026-2201",
    farmerId: ibrahim.id,
    policyId: rPolicy.id,
    claimAmount: "0",
    actualRainfall: null,
    status: "rejected",
    reasonCode: "land_not_verified",
  };
  db.claims.push(settled, approved, rejected);

  db.payments.push(
    {
      id: db.nextId++,
      claimId: settled.id,
      amount: "18000",
      status: "completed",
      transactionId: "UPI-2026-1104",
      bankAccount: "****7890",
      createdAt: "2026-09-01T10:05:00.000Z",
      completedAt: "2026-09-01T12:00:00.000Z",
    },
    {
      id: db.nextId++,
      claimId: approved.id,
      amount: "36000",
      status: "initiated",
      transactionId: "TXN-PEND-1842",
      bankAccount: "****7890",
      createdAt: "2026-10-01T06:05:00.000Z",
    },
    {
      id: db.nextId++,
      claimId: rejected.id,
      amount: "5000",
      status: "failed",
      transactionId: "TXN-FAIL-2201",
      bankAccount: "****1111",
      createdAt: "2026-08-01T10:00:00.000Z",
    },
  );

  return { ramesh, approved, settled };
}

seed();

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/api/policy-types", (_req, res) => {
  res.json([
    {
      id: "basic",
      name: "Basic Protection",
      premiumPerHectare: 2500,
      coveragePerHectare: 25000,
      rainfallThreshold: 100,
      settlementTime: 24,
      features: ["Coverage up to ₹25,000/hectare", "Rainfall threshold: <100mm", "AI-powered instant claims", "24-hour settlement"],
    },
    {
      id: "premium",
      name: "Premium Protection",
      premiumPerHectare: 4000,
      coveragePerHectare: 50000,
      rainfallThreshold: 120,
      settlementTime: 12,
      features: ["Coverage up to ₹50,000/hectare", "Rainfall threshold: <120mm", "Priority AI support", "12-hour settlement"],
      recommended: true,
    },
    {
      id: "comprehensive",
      name: "Comprehensive",
      premiumPerHectare: 6500,
      coveragePerHectare: 75000,
      rainfallThreshold: 150,
      settlementTime: 6,
      features: ["Coverage up to ₹75,000/hectare", "Rainfall threshold: <150mm", "Dedicated support agent", "6-hour settlement"],
    },
  ]);
});

app.post("/api/auth/send-otp", (req, res) => {
  res.json({ message: "OTP sent successfully", otp: "111111" });
});

app.post("/api/auth/verify-otp", (req, res) => {
  const { otp } = req.body || {};
  if (otp === "111111" || otp === "123456") {
    return res.json({ message: "OTP verified successfully" });
  }
  return res.status(400).json({ message: "Invalid or expired OTP" });
});

app.post("/api/users/register", (req, res) => {
  const mobileNumber = normalizeToE164(req.body.mobileNumber) || req.body.mobileNumber;
  if (db.users.find((u) => u.mobileNumber === mobileNumber)) {
    return res.status(400).json({ message: "User already exists with this mobile number" });
  }
  const user: User = {
    id: db.nextId++,
    fullName: req.body.fullName,
    mobileNumber,
    userType: "farmer",
    state: req.body.state || "Maharashtra",
    district: req.body.district || "Nashik",
    isVerified: true,
  };
  db.users.push(user);
  res.status(201).json(user);
});

app.post("/api/users/login", (req, res) => {
  const normalized = normalizeToE164(req.body.mobileNumber) || req.body.mobileNumber;
  const user = db.users.find((u) => u.mobileNumber === normalized || u.mobileNumber === req.body.mobileNumber);
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(user);
});

app.get("/api/users/:id", (req, res) => {
  const user = db.users.find((u) => u.id === Number(req.params.id));
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(user);
});

app.get("/api/policies/farmer/:farmerId", (req, res) => {
  res.json(db.policies.filter((p) => p.farmerId === Number(req.params.farmerId)));
});

app.get("/api/claims/farmer/:farmerId", (req, res) => {
  res.json(db.claims.filter((c) => c.farmerId === Number(req.params.farmerId)));
});

app.get("/api/claims/:id", (req, res) => {
  const claim = db.claims.find((c) => c.id === Number(req.params.id));
  if (!claim) return res.status(404).json({ message: "Claim not found" });
  res.json(claim);
});

app.get("/api/payments/claim/:claimId", (req, res) => {
  res.json(db.payments.filter((p) => p.claimId === Number(req.params.claimId)));
});

app.get("/api/dashboard/farmer/:farmerId", (req, res) => {
  const farmerId = Number(req.params.farmerId);
  const activePolicies = db.policies.filter((p) => p.farmerId === farmerId && p.status === "active").length;
  const settled = db.claims.filter((c) => c.farmerId === farmerId && c.status === "settled");
  res.json({
    activePolicies,
    totalClaims: db.claims.filter((c) => c.farmerId === farmerId).length,
    settledClaims: settled.length,
    totalSettlementAmount: settled.reduce((s, c) => s + Number(c.claimAmount), 0),
  });
});

app.get("/api/dashboard/insurer", (_req, res) => {
  res.json({
    stats: {
      totalPolicies: db.policies.length,
      activeClaims: db.claims.filter((c) => c.status === "processing").length,
      autoApprovalRate: 80,
      avgSettlementTime: 6,
    },
    recentClaims: db.claims.slice(-10),
  });
});

app.post("/api/policies/purchase", (req, res) => {
  const farmerId = Number(req.body.farmerId);
  const catalog: Record<string, { premium: number; coverage: number; threshold: number }> = {
    basic: { premium: 2500, coverage: 25000, threshold: 100 },
    premium: { premium: 4000, coverage: 50000, threshold: 120 },
    comprehensive: { premium: 6500, coverage: 75000, threshold: 150 },
  };
  const plan = catalog[req.body.policyType] || catalog.premium;
  const area = Number(req.body.areaHa || 1);
  const land = {
    id: db.nextId++,
    farmerId,
    area: area.toFixed(2),
    surveyNumber: req.body.surveyNumber || `SYNTH-${farmerId}-4418`,
    coordinates: req.body.coordinates || { lat: 19.99, lng: 73.78 },
    isVerified: isSurveyNumberVerifiable(req.body.surveyNumber || "SYNTH-XX-4418"),
  };
  db.land.push(land);
  const policy: Policy = {
    id: db.nextId++,
    farmerId,
    landHoldingId: land.id,
    policyType: req.body.policyType || "premium",
    coverageAmount: (plan.coverage * area).toFixed(2),
    premiumAmount: (plan.premium * area).toFixed(2),
    rainfallThreshold: plan.threshold,
    season: req.body.season || "kharif",
    status: "active",
    validFrom: new Date().toISOString(),
    validTo: new Date(Date.now() + 120 * 86400000).toISOString(),
  };
  db.policies.push(policy);
  res.status(201).json({ land, policy });
});

app.post("/api/chat/conversations", (req, res) => {
  const conversation = {
    id: db.nextId++,
    farmerId: Number(req.body.farmerId || 1),
    language: req.body.language || "en",
    messages: [] as any[],
  };
  db.chats.push(conversation);
  res.status(201).json(conversation);
});

app.post("/api/chat/conversations/:id/messages", async (req, res) => {
  const conversation = db.chats.find((c) => c.id === Number(req.params.id));
  if (!conversation) return res.status(404).json({ message: "Conversation not found" });
  const message = req.body.message || "";
  conversation.messages.push({
    id: Date.now(),
    sender: "user",
    message,
    timestamp: new Date().toISOString(),
  });
  const policy = db.policies.find((p) => p.farmerId === conversation.farmerId && p.status === "active");
  const land = policy ? db.land.find((l) => l.id === policy.landHoldingId) : undefined;
  const reply = await orch.handle({
    channel: "web",
    externalMessageId: `web-${conversation.id}-${Date.now()}`,
    farmerId: conversation.farmerId,
    messageType: "text",
    text: message,
    language: conversation.language,
    policy: policy
      ? {
          coverageAmount: Number(policy.coverageAmount),
          rainfallThreshold: policy.rainfallThreshold,
          surveyNumber: land?.surveyNumber,
        }
      : undefined,
    rainfallMm: 48,
  });
  conversation.messages.push({
    id: Date.now() + 1,
    sender: "ai",
    message: reply.text,
    timestamp: new Date().toISOString(),
    metadata: { intent: reply.intent, modelUsed: reply.modelUsed },
  });
  res.json({ messages: conversation.messages, aiResponse: reply.text, intent: reply.intent });
});

app.get("/api/chat/conversations/:id", (req, res) => {
  const conversation = db.chats.find((c) => c.id === Number(req.params.id));
  if (!conversation) return res.status(404).json({ message: "Conversation not found" });
  res.json(conversation);
});

app.get("/api/notifications/user/:userId", (_req, res) => res.json([]));

app.get("/api/dev/scenarios", (_req, res) => {
  res.json({
    clock: "2026-10-01",
    scenarios: db.users.map((u) => ({
      id: u.fullName.split(" ")[0].toLowerCase(),
      label: u.fullName,
      phone: u.mobileNumber,
      userId: u.id,
    })),
  });
});

app.post("/api/whatsapp/demo-inbound", async (req, res) => {
  const raw = JSON.stringify(req.body);
  const signature = req.header("x-hub-signature-256");
  if (process.env.WHATSAPP_APP_SECRET && !verifyWhatsAppSignature(raw, signature || undefined)) {
    return res.status(401).json({ message: "Invalid signature" });
  }
  const parsed = parseWhatsAppWebhook(req.body);
  const results = [];
  for (const msg of parsed) {
    if (db.ambient.find((a) => a.externalMessageId === msg.externalMessageId)) {
      results.push({ externalMessageId: msg.externalMessageId, duplicate: true });
      continue;
    }
    const phone = msg.phoneE164 || normalizeToE164(msg.waId);
    const user = db.users.find((u) => u.mobileNumber === phone);
    if (!user) {
      const reply =
        "Namaste. I can continue in your language. Reply with Hindi, Marathi, or English.";
      db.ambient.push({ externalMessageId: msg.externalMessageId, reply });
      results.push({ externalMessageId: msg.externalMessageId, reply, intent: "onboarding" });
      continue;
    }
    const policy = db.policies.find((p) => p.farmerId === user.id && p.status === "active");
    const land = policy ? db.land.find((l) => l.id === policy.landHoldingId) : undefined;
    const reply = await orch.handle({
      channel: "whatsapp",
      externalMessageId: msg.externalMessageId,
      phoneE164: phone || undefined,
      farmerId: user.id,
      messageType: msg.messageType === "unknown" ? "text" : msg.messageType,
      text: msg.text || "drought dry rain",
      language: "hi-IN",
      audio: msg.messageType === "voice" ? Buffer.from("x") : undefined,
      location: msg.location,
      parcelCoordinates: land?.coordinates,
      policy: policy
        ? {
            coverageAmount: Number(policy.coverageAmount),
            rainfallThreshold: policy.rainfallThreshold,
            surveyNumber: land?.surveyNumber,
        }
        : undefined,
      rainfallMm: 48,
    });
    db.ambient.push({ externalMessageId: msg.externalMessageId, reply: reply.text });
    results.push({
      externalMessageId: msg.externalMessageId,
      reply: reply.text,
      intent: reply.intent,
    });
  }
  res.json({ accepted: true, results });
});

app.post("/api/e2e/reset", (_req, res) => {
  const seeded = seed();
  res.json({ ok: true, rameshId: seeded.ramesh.id, approvedClaimId: seeded.approved.id });
});

app.get("/api/e2e/meta", (_req, res) => {
  const ramesh = db.users.find((u) => u.mobileNumber === "+919800000001")!;
  const approved = db.claims.find((c) => c.claimNumber === "CR-2026-1842")!;
  res.json({
    rameshId: ramesh.id,
    approvedClaimId: approved.id,
    decideClaimSample: decideClaim({
      rainfallMm: 48,
      rainfallThresholdMm: 120,
      coverageAmount: 60000,
      landVerified: true,
    }),
    geofenceOutside: isWithinParcel(
      { lat: 18.4145, lng: 76.5604 },
      { lat: 18.4088, lng: 76.5604 },
    ),
    templateRequired: mustUseApprovedTemplate(new Date("2026-09-29T06:00:00+05:30"), new Date("2026-10-01T07:00:00+05:30")),
    fixtures,
    signDemo: signWhatsAppBody("{}", "test"),
    parcel: parcelCenter({ lat: 18.4, lng: 76.5 }),
  });
});

app.use("/mockups", express.static(path.resolve(__dirname, "..", "mockups")));

const httpServer = createServer(app);

async function start() {
  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: { middlewareMode: true, hmr: { server: httpServer } },
    appType: "custom",
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    try {
      const url = req.originalUrl;
      const clientTemplate = path.resolve(__dirname, "..", "client", "index.html");
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });

  httpServer.listen(PORT, "127.0.0.1", () => {
    console.log(`E2E harness listening on http://127.0.0.1:${PORT}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
