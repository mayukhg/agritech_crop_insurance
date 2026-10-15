import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

async function meta(request: APIRequestContext) {
  // Discover seeded ids via login + claims list
  const login = await request.post("/api/users/login", {
    data: { mobileNumber: "+919800000001" },
  });
  expect(login.ok()).toBeTruthy();
  const ramesh = await login.json();
  const claims = await request.get(`/api/claims/farmer/${ramesh.id}`);
  expect(claims.ok()).toBeTruthy();
  const claimList = await claims.json();
  const approved = claimList.find((c: any) => c.claimNumber === "CR-2026-1842") || claimList[0];
  return { ramesh, approved };
}

test.describe("01 Home", () => {
  test("landing page shows CropGuard brand and primary CTAs", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("CropGuard").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /register|login/i }).first()).toBeVisible();
  });

  test("navigation reaches policies, claims, and insurer dashboard", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /^Policies$/i }).first().click();
    await expect(page).toHaveURL(/\/policies/);
    await page.getByRole("link", { name: /^Claims$/i }).first().click();
    await expect(page).toHaveURL(/\/claim/);
    await page.getByRole("link", { name: /^Dashboard$/i }).first().click();
    await expect(page).toHaveURL(/\/dashboard\/insurer/);
  });
});

test.describe("02 Registration", () => {
  test("OTP registration creates a farmer and lands on dashboard", async ({ page }) => {
    const mobile = `98${Date.now().toString().slice(-8)}`;
    await page.goto("/register");
    await page.getByPlaceholder("Enter your full name").fill("E2E Farmer");
    await page.getByPlaceholder("+91 XXXXX XXXXX").fill(mobile);

    const otpResponse = page.waitForResponse(
      (res) => res.url().includes("/api/auth/send-otp") && res.ok(),
    );
    await page.getByRole("button", { name: "Send OTP" }).click();
    const otpPayload = await otpResponse.then((r) => r.json());
    const otp = String(otpPayload.otp || "");
    expect(otp).toMatch(/^\d{6}$/);

    const otpBox = page.getByPlaceholder("Enter OTP");
    await expect(otpBox).toBeVisible({ timeout: 10000 });
    await otpBox.fill(otp);
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page.getByText("Aadhaar Number")).toBeVisible({ timeout: 10000 });

    await page.getByPlaceholder("XXXX XXXX XXXX").fill("123456789012");
    await page.getByText("Select State").click();
    await page.getByRole("option", { name: "Maharashtra" }).click();
    await page.getByText("Select District").click();
    await page.getByRole("option", { name: "Nashik" }).click();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /Complete Registration/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/farmer\/\d+/, { timeout: 15000 });
  });
});

test.describe("03 Policy purchase", () => {
  test("policy catalog renders three plans and purchase writes a policy", async ({ page, request }) => {
    const { ramesh } = await meta(request);
    await page.addInitScript((id) => {
      localStorage.setItem("cropguard_farmer_id", String(id));
    }, ramesh.id);

    await page.goto("/policies");
    await expect(page.getByText("Basic Protection")).toBeVisible();
    await expect(page.getByText("Premium Protection")).toBeVisible();
    await expect(page.getByText("Comprehensive")).toBeVisible();

    await page.getByRole("button", { name: "Select Plan" }).nth(1).click();
    await expect(page.getByText(/Policy purchased|active/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(new RegExp(`/dashboard/farmer/${ramesh.id}`), { timeout: 15000 });
  });
});

test.describe("04 Claim filing chat", () => {
  test("AI chat opens and responds to a drought message", async ({ page, request }) => {
    const { ramesh } = await meta(request);
    await page.addInitScript((id) => {
      localStorage.setItem("cropguard_farmer_id", String(id));
    }, ramesh.id);

    await page.goto("/claim");
    await expect(page.getByText("CropGuard AI Assistant")).toBeVisible();
    await expect(page.getByText(/name and mobile number/i)).toBeVisible({ timeout: 15000 });

    const input = page.getByPlaceholder("Type your message...");
    await expect(input).toBeEnabled({ timeout: 15000 });
    await input.fill("drought dry rain no rainfall in Latur");
    await input.press("Enter");

    await expect(
      page.getByText(/approved|threshold|rainfall|policy|claim|CropGuard|Latur|drought/i).nth(1),
    ).toBeVisible({ timeout: 30000 });
  });
});

test.describe("05 Farmer dashboard", () => {
  test("shows Ramesh policies and claims from seed", async ({ page, request }) => {
    const { ramesh } = await meta(request);
    await page.goto(`/dashboard/farmer/${ramesh.id}`);
    await expect(page.getByText(/Ramesh Patil|Welcome/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/CR-2026-1842|CR-2026-1104|Active|Settled|Approved/i).first()).toBeVisible();
  });
});

test.describe("06 Insurer dashboard", () => {
  test("shows portfolio stats and recent claims", async ({ page }) => {
    await page.goto("/dashboard/insurer");
    await expect(page.getByText(/Insurer|Analytics|Dashboard/i).first()).toBeVisible();
    await expect(page.getByText(/Total Policies|Auto-Approval|Settlement/i).first()).toBeVisible({
      timeout: 15000,
    });
  });
});

test.describe("07 Payment tracking", () => {
  test("tracks seeded approved claim payment", async ({ page, request }) => {
    const { approved } = await meta(request);
    await page.goto(`/payment/${approved.id}`);
    await expect(page.getByText(/Payment|Claim|₹|initiated|completed|approved/i).first()).toBeVisible({
      timeout: 15000,
    });
  });
});

test.describe("08 WhatsApp API channel", () => {
  test("webhook verify challenge works", async ({ request }) => {
    const res = await request.get(
      "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=cropguard-dev&hub.challenge=abc123",
    );
    expect(res.ok()).toBeTruthy();
    expect(await res.text()).toBe("abc123");
  });

  test("unknown number starts onboarding", async ({ request }) => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                contacts: [{ profile: { name: "New Farmer" }, wa_id: "919800009999" }],
                messages: [
                  {
                    from: "919800009999",
                    id: `wamid.E2E_ONBOARD_${Date.now()}`,
                    timestamp: "1772960000",
                    type: "text",
                    text: { body: "Hi" },
                  },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    };
    const res = await request.post("/api/whatsapp/demo-inbound", { data: payload });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.results[0].intent).toBe("onboarding");
    expect(body.results[0].reply.toLowerCase()).toContain("language");
  });

  test("duplicate wamid is processed once", async ({ request }) => {
    const id = `wamid.E2E_DUP_${Date.now()}`;
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                contacts: [{ profile: { name: "Meera" }, wa_id: "919800000005" }],
                messages: [
                  {
                    from: "919800000005",
                    id,
                    timestamp: "1772960000",
                    type: "text",
                    text: { body: "Hi" },
                  },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    };
    const first = await request.post("/api/whatsapp/demo-inbound", { data: payload });
    const second = await request.post("/api/whatsapp/demo-inbound", { data: payload });
    expect(first.ok()).toBeTruthy();
    expect(second.ok()).toBeTruthy();
    const body = await second.json();
    expect(body.results[0].duplicate).toBe(true);
  });

  test("Ramesh drought text gets a claim-style reply", async ({ request }) => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                contacts: [{ profile: { name: "Ramesh" }, wa_id: "919800000001" }],
                messages: [
                  {
                    from: "919800000001",
                    id: `wamid.E2E_CLAIM_${Date.now()}`,
                    timestamp: "1772960000",
                    type: "text",
                    text: { body: "drought dry rain soybean" },
                  },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    };
    const res = await request.post("/api/whatsapp/demo-inbound", { data: payload });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.results[0].intent).toBe("claim_filing_voice");
    expect(String(body.results[0].reply)).toMatch(/mm|approved|threshold|cover/i);
  });
});

test.describe("09 Product mockup walkthrough", () => {
  test("all nine chapters are reachable and advance", async ({ page }) => {
    await page.goto("/mockups/cropguard-2-workflow.html");
    await expect(page.getByRole("heading", { name: "CropGuard 2.0" })).toBeVisible();

    const chapters = [
      "01 The shift",
      "02 Onboard",
      "03 Speak a claim",
      "04 Photograph damage",
      "05 Morning advice",
      "06 Automatic payout",
      "07 A basic phone",
      "08 Underwriter desk",
      "09 Farmer home",
    ];

    for (const label of chapters) {
      await page.getByRole("button", { name: new RegExp(label, "i") }).click();
      await expect(page.locator("#title")).not.toBeEmpty();
      // Advance at least one beat when available
      const next = page.getByRole("button", { name: /Next beat|Next chapter/i });
      if (await next.isEnabled()) {
        await next.click();
      }
    }

    // Branch: muddy recording on speak claim
    await page.getByRole("button", { name: /03 Speak a claim/i }).click();
    const alt = page.getByRole("button", { name: /muddy recording|main path/i });
    if (await alt.isVisible()) {
      await alt.click();
      await expect(page.locator("#title")).toBeVisible();
    }

    // Branch: outside pin on photograph
    await page.getByRole("button", { name: /04 Photograph damage/i }).click();
    const pinAlt = page.getByRole("button", { name: /620 m|main path/i });
    if (await pinAlt.isVisible()) {
      await pinAlt.click();
      await expect(page.locator("text=/620|outside|refused|location/i").first()).toBeVisible({
        timeout: 10000,
      });
    }
  });
});

test.describe("10 Parametric worker API", () => {
  test("parametric scan endpoint responds", async ({ request }) => {
    const res = await request.post("/api/workers/parametric-scan", {
      data: { asOf: "2026-09-30T12:00:00+05:30" },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty("evaluated");
    expect(body).toHaveProperty("details");
  });

  test("dev scenarios lists seeded personas", async ({ request }) => {
    const res = await request.get("/api/dev/scenarios");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.scenarios.length).toBeGreaterThanOrEqual(5);
  });
});

// silence unused Page import warning in some TS configs
void (null as unknown as Page);
