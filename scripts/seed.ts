/**
 * Seed the CropGuard 2.0 synthetic world.
 * Usage: DATABASE_URL=... npm run seed
 */
import "dotenv/config";
import { seedSyntheticWorld } from "../server/synthetic/persist";

async function main() {
  const result = await seedSyntheticWorld();
  console.log("CropGuard 2.0 synthetic world seeded.");
  console.log("Farmer ids:", result.farmerIds);
  console.log("Open these URLs after starting the app:");
  for (const url of result.urls) {
    console.log(`  http://localhost:${process.env.PORT || 5055}${url}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
