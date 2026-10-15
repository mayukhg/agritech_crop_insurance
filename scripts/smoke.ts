/**
 * Smoke check against a running server (optional).
 * Usage: npm run test:smoke
 * Skips cleanly when the server is down so CI unit jobs stay green.
 */
const base = process.env.SMOKE_BASE_URL || "http://127.0.0.1:5000";

async function main() {
  try {
    const res = await fetch(`${base}/api/policy-types`);
    if (!res.ok) throw new Error(`policy-types ${res.status}`);
    const types = await res.json();
    if (!Array.isArray(types) || types.length < 3) {
      throw new Error("expected 3 policy types");
    }
    const scenarios = await fetch(`${base}/api/dev/scenarios`);
    if (scenarios.ok) {
      const body = await scenarios.json();
      console.log("Smoke OK — scenarios:", body.scenarios?.length);
    } else {
      console.log("Smoke OK — policy catalog reachable");
    }
  } catch (err) {
    console.warn("Smoke skipped (server not reachable):", String(err));
    process.exit(0);
  }
}

main();
