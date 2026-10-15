import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { 
  insertUserSchema, 
  insertLandHoldingSchema, 
  insertPolicySchema, 
  insertClaimSchema,
} from "@shared/schema";
import { weatherService } from "./services/weatherService";
import { blockchainService } from "./services/blockchainService";
import { paymentService } from "./services/paymentService";
import { notificationService } from "./services/notificationService";
import { decideClaim, isSurveyNumberVerifiable } from "./agent/decideClaim";
import { orchestrator } from "./agent/orchestrator";
import { verifyWhatsAppSignature } from "./channels/whatsapp/signature";
import { handleWhatsAppInbound } from "./channels/whatsapp/inbound";
import { runParametricScan } from "./workers/parametricWorker";
import { normalizeToE164 } from "./lib/phone";
import { DEV_OTP, personas } from "./synthetic/world";
import { seedSyntheticWorld } from "./synthetic/persist";

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Authentication endpoints
  app.post("/api/auth/send-otp", async (req, res) => {
    try {
      const { mobileNumber, purpose = "registration" } = req.body;
      
      if (!mobileNumber) {
        return res.status(400).json({ message: "Mobile number is required" });
      }

      // Generate 6-digit OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      await storage.createOtpVerification({
        mobileNumber,
        otp,
        purpose,
        expiresAt,
      });

      // In production, send actual SMS
      console.log(`OTP for ${mobileNumber}: ${otp}`);

      res.json({ 
        message: "OTP sent successfully",
        // For demo purposes, return OTP (remove in production)
        otp: process.env.NODE_ENV === "development" ? otp : undefined
      });
    } catch (error) {
      console.error("Send OTP error:", error);
      res.status(500).json({ message: "Failed to send OTP" });
    }
  });

  app.post("/api/auth/verify-otp", async (req, res) => {
    try {
      const { mobileNumber, otp, purpose = "registration" } = req.body;
      const normalized = normalizeToE164(mobileNumber) || mobileNumber;

      // Fixed demo OTP for Ramesh's seeded number in development
      if (
        process.env.NODE_ENV === "development" &&
        otp === DEV_OTP &&
        normalizeToE164(mobileNumber) === personas.ramesh.mobileNumber
      ) {
        return res.json({ message: "OTP verified successfully", demo: true });
      }
      
      const otpRecord = await storage.getOtpVerification(normalized, purpose)
        || await storage.getOtpVerification(mobileNumber, purpose);
      
      if (!otpRecord || otpRecord.otp !== otp) {
        return res.status(400).json({ message: "Invalid or expired OTP" });
      }

      await storage.markOtpAsUsed(otpRecord.id);
      
      res.json({ message: "OTP verified successfully" });
    } catch (error) {
      console.error("Verify OTP error:", error);
      res.status(500).json({ message: "Failed to verify OTP" });
    }
  });

  // User registration and profile
  app.post("/api/users/register", async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const mobileNumber = normalizeToE164(userData.mobileNumber) || userData.mobileNumber;
      
      // Check if user already exists
      const existingUser = await storage.getUserByMobile(mobileNumber);
      if (existingUser) {
        return res.status(400).json({ message: "User already exists with this mobile number" });
      }

      const user = await storage.createUser({
        ...userData,
        mobileNumber,
        isVerified: true, // Since OTP was verified
      });

      res.status(201).json(user);
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Failed to register user" });
    }
  });

  app.get("/api/users/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const user = await storage.getUser(id);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(user);
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ message: "Failed to get user" });
    }
  });

  app.post("/api/users/login", async (req, res) => {
    try {
      const { mobileNumber } = req.body;
      const normalized = normalizeToE164(mobileNumber) || mobileNumber;
      
      const user = await storage.getUserByMobile(normalized)
        || await storage.getUserByMobile(mobileNumber);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json(user);
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Failed to login" });
    }
  });

  // Land holdings
  app.post("/api/land-holdings", async (req, res) => {
    try {
      const landHoldingData = insertLandHoldingSchema.parse(req.body);
      
      // Mock blockchain verification
      const blockchainHash = await blockchainService.verifyLandOwnership(
        landHoldingData.farmerId,
        landHoldingData.surveyNumber ?? undefined
      );

      const landHolding = await storage.createLandHolding({
        ...landHoldingData,
        isVerified: !!blockchainHash,
        blockchainHash,
      });

      res.status(201).json(landHolding);
    } catch (error) {
      console.error("Create land holding error:", error);
      res.status(500).json({ message: "Failed to create land holding" });
    }
  });

  app.get("/api/land-holdings/farmer/:farmerId", async (req, res) => {
    try {
      const farmerId = parseInt(req.params.farmerId);
      const landHoldings = await storage.getLandHoldingsByFarmer(farmerId);
      res.json(landHoldings);
    } catch (error) {
      console.error("Get land holdings error:", error);
      res.status(500).json({ message: "Failed to get land holdings" });
    }
  });

  // Policies
  app.post("/api/policies", async (req, res) => {
    try {
      const policyData = insertPolicySchema.parse(req.body);
      const policy = await storage.createPolicy(policyData);
      res.status(201).json(policy);
    } catch (error) {
      console.error("Create policy error:", error);
      res.status(500).json({ message: "Failed to create policy" });
    }
  });

  app.get("/api/policies/farmer/:farmerId", async (req, res) => {
    try {
      const farmerId = parseInt(req.params.farmerId);
      const policies = await storage.getPoliciesByFarmer(farmerId);
      res.json(policies);
    } catch (error) {
      console.error("Get policies error:", error);
      res.status(500).json({ message: "Failed to get policies" });
    }
  });

  // Policy types and pricing
  app.get("/api/policy-types", async (req, res) => {
    try {
      const policyTypes = [
        {
          id: "basic",
          name: "Basic Protection",
          premiumPerHectare: 2500,
          coveragePerHectare: 25000,
          rainfallThreshold: 100,
          settlementTime: 24,
          features: [
            "Coverage up to ₹25,000/hectare",
            "Rainfall threshold: <100mm",
            "AI-powered instant claims",
            "24-hour settlement"
          ]
        },
        {
          id: "premium",
          name: "Premium Protection",
          premiumPerHectare: 4000,
          coveragePerHectare: 50000,
          rainfallThreshold: 120,
          settlementTime: 12,
          features: [
            "Coverage up to ₹50,000/hectare",
            "Rainfall threshold: <120mm",
            "Priority AI support",
            "12-hour settlement",
            "SMS + App notifications"
          ],
          recommended: true
        },
        {
          id: "comprehensive",
          name: "Comprehensive",
          premiumPerHectare: 6500,
          coveragePerHectare: 75000,
          rainfallThreshold: 150,
          settlementTime: 6,
          features: [
            "Coverage up to ₹75,000/hectare",
            "Rainfall threshold: <150mm",
            "Dedicated support agent",
            "6-hour settlement",
            "Multiple contact methods"
          ]
        }
      ];

      res.json(policyTypes);
    } catch (error) {
      console.error("Get policy types error:", error);
      res.status(500).json({ message: "Failed to get policy types" });
    }
  });

  // Claims
  app.post("/api/claims", async (req, res) => {
    try {
      const claimData = insertClaimSchema.parse(req.body);
      
      // Generate unique claim number
      const claimNumber = `CR-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
      
      const claim = await storage.createClaim({
        ...claimData,
        claimNumber,
        status: "submitted",
      });

      // Start automated claim processing
      processClaimAsync(claim.id);

      res.status(201).json(claim);
    } catch (error) {
      console.error("Create claim error:", error);
      res.status(500).json({ message: "Failed to create claim" });
    }
  });

  app.get("/api/claims/farmer/:farmerId", async (req, res) => {
    try {
      const farmerId = parseInt(req.params.farmerId);
      const claims = await storage.getClaimsByFarmer(farmerId);
      res.json(claims);
    } catch (error) {
      console.error("Get claims error:", error);
      res.status(500).json({ message: "Failed to get claims" });
    }
  });

  app.get("/api/claims/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const claim = await storage.getClaim(id);
      
      if (!claim) {
        return res.status(404).json({ message: "Claim not found" });
      }

      res.json(claim);
    } catch (error) {
      console.error("Get claim error:", error);
      res.status(500).json({ message: "Failed to get claim" });
    }
  });

  // AI Chat for claims
  app.post("/api/chat/conversations", async (req, res) => {
    try {
      const { farmerId, language = "en" } = req.body;
      
      const conversation = await storage.createChatConversation({
        farmerId,
        language,
        messages: [],
      });

      res.status(201).json(conversation);
    } catch (error) {
      console.error("Create conversation error:", error);
      res.status(500).json({ message: "Failed to create conversation" });
    }
  });

  app.post("/api/chat/conversations/:id/messages", async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const { message, sender = "user" } = req.body;
      
      const conversation = await storage.getChatConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const messages = [...(conversation.messages as any[]), {
        id: Date.now(),
        sender,
        message,
        timestamp: new Date().toISOString(),
      }];

      let aiResponse = null;
      if (sender === "user") {
        const policies = await storage.getPoliciesByFarmer(conversation.farmerId);
        const active = policies.find((p) => p.status === "active");
        const holdings = await storage.getLandHoldingsByFarmer(conversation.farmerId);
        const orch = await orchestrator.handle({
          channel: "web",
          externalMessageId: `web-${conversationId}-${Date.now()}`,
          farmerId: conversation.farmerId,
          messageType: "text",
          text: message,
          language: conversation.language,
          policy: active
            ? {
                coverageAmount: parseFloat(active.coverageAmount),
                rainfallThreshold: active.rainfallThreshold,
                surveyNumber: holdings[0]?.surveyNumber,
              }
            : undefined,
        });
        aiResponse = {
          message: orch.text,
          metadata: { ...orch.metadata, intent: orch.intent, modelUsed: orch.modelUsed },
        };
        
        messages.push({
          id: Date.now() + 1,
          sender: "ai",
          message: aiResponse.message,
          timestamp: new Date().toISOString(),
          metadata: aiResponse.metadata,
        });
      }

      await storage.updateChatConversation(conversationId, { messages });

      res.json({ 
        messages,
        aiResponse: aiResponse?.message,
        intent: aiResponse?.metadata?.intent,
      });
    } catch (error) {
      console.error("Send message error:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  app.get("/api/chat/conversations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const conversation = await storage.getChatConversation(id);
      
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      res.json(conversation);
    } catch (error) {
      console.error("Get conversation error:", error);
      res.status(500).json({ message: "Failed to get conversation" });
    }
  });

  // Payments
  app.get("/api/payments/claim/:claimId", async (req, res) => {
    try {
      const claimId = parseInt(req.params.claimId);
      const payments = await storage.getPaymentsByClaim(claimId);
      res.json(payments);
    } catch (error) {
      console.error("Get payments error:", error);
      res.status(500).json({ message: "Failed to get payments" });
    }
  });

  // Dashboard analytics
  app.get("/api/dashboard/farmer/:farmerId", async (req, res) => {
    try {
      const farmerId = parseInt(req.params.farmerId);
      const stats = await storage.getDashboardStats(farmerId);
      res.json(stats);
    } catch (error) {
      console.error("Get farmer dashboard error:", error);
      res.status(500).json({ message: "Failed to get dashboard stats" });
    }
  });

  app.get("/api/dashboard/insurer", async (req, res) => {
    try {
      const stats = await storage.getInsurerStats();
      const recentClaims = await storage.getAllClaims(10);
      
      res.json({
        stats,
        recentClaims,
      });
    } catch (error) {
      console.error("Get insurer dashboard error:", error);
      res.status(500).json({ message: "Failed to get dashboard stats" });
    }
  });

  // Notifications
  app.get("/api/notifications/user/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const notifications = await storage.getNotificationsByUser(userId);
      res.json(notifications);
    } catch (error) {
      console.error("Get notifications error:", error);
      res.status(500).json({ message: "Failed to get notifications" });
    }
  });

  app.post("/api/notifications/:id/read", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.markNotificationAsRead(id);
      res.json({ message: "Notification marked as read" });
    } catch (error) {
      console.error("Mark notification read error:", error);
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  // Weather data (for testing and seeding)
  app.post("/api/weather-data", async (req, res) => {
    try {
      const weatherData = req.body;
      const data = await storage.createWeatherData(weatherData);
      res.status(201).json(data);
    } catch (error) {
      console.error("Create weather data error:", error);
      res.status(500).json({ message: "Failed to create weather data" });
    }
  });

  // --- CropGuard 2.0 ambient channel & workers ---

  app.get("/api/whatsapp/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === (process.env.WHATSAPP_VERIFY_TOKEN || "cropguard-dev")) {
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  });

  app.post("/api/whatsapp/webhook", async (req, res) => {
    try {
      const signature = req.header("x-hub-signature-256") || undefined;
      const raw = JSON.stringify(req.body);
      if (!verifyWhatsAppSignature(raw, signature)) {
        return res.status(401).json({ message: "Invalid signature" });
      }
      // Ack immediately; process asynchronously for latency budget
      res.status(200).json({ status: "received" });
      handleWhatsAppInbound(req.body).catch((err) =>
        console.error("WhatsApp inbound error:", err),
      );
    } catch (error) {
      console.error("WhatsApp webhook error:", error);
      if (!res.headersSent) res.status(500).json({ message: "Webhook failed" });
    }
  });

  /** Synchronous fixture replay for demos / regression (waits for reply). */
  app.post("/api/whatsapp/demo-inbound", async (req, res) => {
    try {
      const result = await handleWhatsAppInbound(req.body);
      res.json(result);
    } catch (error) {
      console.error("Demo inbound error:", error);
      res.status(500).json({ message: "Failed to process inbound" });
    }
  });

  app.post("/api/workers/parametric-scan", async (req, res) => {
    try {
      if (process.env.WORKER_ENABLED === "false") {
        return res.status(403).json({ message: "Workers disabled" });
      }
      const asOf = req.body?.asOf ? new Date(req.body.asOf) : new Date("2026-09-30T12:00:00+05:30");
      const result = await runParametricScan(asOf);
      res.json(result);
    } catch (error) {
      console.error("Parametric scan error:", error);
      res.status(500).json({ message: "Scan failed" });
    }
  });

  app.post("/api/seed/synthetic", async (req, res) => {
    try {
      if (process.env.NODE_ENV === "production" && req.header("x-seed-token") !== process.env.SEED_TOKEN) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const result = await seedSyntheticWorld();
      res.json({ message: "Synthetic world seeded", ...result });
    } catch (error) {
      console.error("Seed error:", error);
      res.status(500).json({ message: "Seed failed", error: String(error) });
    }
  });

  app.get("/api/dev/scenarios", async (_req, res) => {
    try {
      const scenarios = [
        { id: "ramesh", label: "Ramesh — settled + approved claims", phone: personas.ramesh.mobileNumber },
        { id: "suresh", label: "Suresh — farm twin / advisory", phone: personas.suresh.mobileNumber },
        { id: "anita", label: "Anita — 21 dry-day parametric payout", phone: personas.anita.mobileNumber },
        { id: "ibrahim", label: "Ibrahim — rejected / failed payment", phone: personas.ibrahim.mobileNumber },
        { id: "meera", label: "Meera — awaiting registration", phone: personas.meera.mobileNumber },
        { id: "pooja", label: "Pooja — insurer desk", phone: personas.pooja.mobileNumber },
      ];
      res.json({ clock: "2026-10-01", scenarios, mockup: "/mockups/cropguard-2-workflow.html" });
    } catch (error) {
      res.status(500).json({ message: "Failed to list scenarios" });
    }
  });

  // Purchase helper: create land + policy in one call (used by PolicySelection)
  app.post("/api/policies/purchase", async (req, res) => {
    try {
      const schema = z.object({
        farmerId: z.number(),
        policyType: z.enum(["basic", "premium", "comprehensive"]),
        areaHa: z.number().positive().default(1),
        surveyNumber: z.string().min(6),
        season: z.enum(["kharif", "rabi"]).default("kharif"),
        state: z.string().optional(),
        district: z.string().optional(),
        coordinates: z
          .object({ lat: z.number(), lng: z.number() })
          .optional(),
      });
      const body = schema.parse(req.body);
      const catalog: Record<string, { premium: number; coverage: number; threshold: number }> = {
        basic: { premium: 2500, coverage: 25000, threshold: 100 },
        premium: { premium: 4000, coverage: 50000, threshold: 120 },
        comprehensive: { premium: 6500, coverage: 75000, threshold: 150 },
      };
      const plan = catalog[body.policyType];
      const blockchainHash = await blockchainService.verifyLandOwnership(
        body.farmerId,
        body.surveyNumber,
      );
      const land = await storage.createLandHolding({
        farmerId: body.farmerId,
        area: body.areaHa.toFixed(2),
        surveyNumber: body.surveyNumber,
        coordinates: body.coordinates || null,
        isVerified: !!blockchainHash,
        blockchainHash,
      });
      const now = new Date();
      const validTo = new Date(now);
      validTo.setMonth(validTo.getMonth() + 4);
      const policy = await storage.createPolicy({
        farmerId: body.farmerId,
        landHoldingId: land.id,
        policyType: body.policyType,
        coverageAmount: (plan.coverage * body.areaHa).toFixed(2),
        premiumAmount: (plan.premium * body.areaHa).toFixed(2),
        rainfallThreshold: plan.threshold,
        season: body.season,
        validFrom: now,
        validTo,
        status: "active",
        triggerType: "cumulative_rainfall",
        dryDayLimit: 21,
        dryDayMaxMm: 5,
      });
      res.status(201).json({ land, policy });
    } catch (error) {
      console.error("Policy purchase error:", error);
      res.status(500).json({ message: "Failed to purchase policy" });
    }
  });

  // Automated claim processing function
  async function processClaimAsync(claimId: number) {
    try {
      const claim = await storage.getClaim(claimId);
      if (!claim) return;

      await storage.updateClaim(claimId, { 
        status: "processing",
        processedAt: new Date()
      });

      const policy = await storage.getPolicyWithDetails(claim.policyId);
      if (!policy) return;

      const isLandVerified = !!(await blockchainService.verifyLandOwnership(
        claim.farmerId,
        policy.landHolding?.surveyNumber
      )) || isSurveyNumberVerifiable(policy.landHolding?.surveyNumber);

      const weatherRows = await weatherService.getRainfallData(
        policy.farmer.district,
        policy.farmer.state,
        policy.policy.validFrom,
        policy.policy.validTo
      );

      const totalRainfall = weatherRows.reduce((sum, data) => sum + data.rainfall, 0);
      const decision = decideClaim({
        rainfallMm: totalRainfall,
        rainfallThresholdMm: policy.policy.rainfallThreshold,
        coverageAmount: parseFloat(policy.policy.coverageAmount),
        landVerified: isLandVerified,
      });

      if (!decision.approved) {
        await storage.updateClaim(claimId, {
          status: "rejected",
          reasonCode: decision.reasonCode || "rejected",
          actualRainfall: totalRainfall,
          aiDecision: decision,
        });
        return;
      }

      const settlementTime = Number(process.env.CLAIM_SETTLEMENT_HOURS || 6);
      await storage.updateClaim(claimId, {
        status: "approved",
        claimAmount: decision.amount.toString(),
        actualRainfall: totalRainfall,
        aiDecision: decision,
        settlementTime,
      });

      const payment = await storage.createPayment({
        claimId,
        amount: decision.amount.toString(),
        bankAccount: "****7890",
        ifscCode: "SBIN0001234",
        transactionId: `TXN${Date.now()}`,
        status: "initiated",
      });

      setTimeout(async () => {
        await paymentService.processPayment(payment.id);
        await storage.updateClaim(claimId, { 
          status: "settled",
          settledAt: new Date()
        });
        await notificationService.sendClaimSettledNotification(
          claim.farmerId,
          claim.claimNumber,
          decision.amount,
        );
      }, 2000);

      await notificationService.sendClaimApprovedNotification(
        claim.farmerId,
        claim.claimNumber,
        decision.amount,
      );

    } catch (error) {
      console.error("Process claim error:", error);
      await storage.updateClaim(claimId, {
        status: "rejected",
        reasonCode: "processing_error",
      });
    }
  }

  const httpServer = createServer(app);
  return httpServer;
}
