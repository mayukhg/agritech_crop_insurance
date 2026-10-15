# CropGuard 2.0 — Ambient Crop Insurance Gateway

CropGuard helps Indian farmers buy drought cover and settle claims without opening a browser. CropGuard 2.0 adds a WhatsApp and voice gateway on top of the existing Express + React + Postgres app: farmers message or speak in regional languages, send field photos with a location pin, and receive parametric payouts when rainfall rules are met.

The web UI remains as a farmer/insurer console and as a debug surface for the same claim orchestrator.

## What 2.0 adds

| Area | Behaviour |
| --- | --- |
| **Channels** | WhatsApp Cloud API webhook (`/api/whatsapp/webhook`) with signature verification, media-ready inbound parsing, and demo replay (`/api/whatsapp/demo-inbound`) |
| **Agent** | Shared orchestrator for web chat and WhatsApp — intent routing, mock ASR/TTS/vision/SLM providers, confidence fallback below 0.70 |
| **Claims** | Pure `decideClaim` (coverage × shortfall / threshold); dry-day parametric worker for 21 days under 5 mm |
| **Identity** | E.164 phone normalization; WhatsApp `wa_id` matches `users.mobileNumber`; survey number + district for land link (Aadhaar not collected on the channel) |
| **Evidence** | Photo + WhatsApp location pin; 500 m geofence vs `land_holdings.coordinates`; photos never auto-pay |
| **Data** | New tables: channel profiles, ambient messages, sessions, farm profiles, damage assessments, parametric triggers |
| **Synthetic world** | Deterministic seed (`npm run seed`) with Ramesh, Suresh, Anita, Ibrahim, Meera, Pooja |
| **Tests** | Vitest unit + regression goldens; Playwright headless E2E across app flows with an HTML validation report |
| **Demo** | Click-through HTML mockup and MP4 walkthrough under `mockups/` |

## Architecture (Q1 cut)

```
WhatsApp / Web chat
        │
        ▼
 Express webhook + /api/chat
        │
        ▼
 Agent orchestrator (intent → SLM | vision | decideClaim)
        │
        ├── weather_data (prefer SYNTHETIC / real rows)
        ├── blockchain mock (survey number length)
        └── paymentService.disburse (PAYMENT_PROVIDER=mock|live)
        │
        ▼
 Parametric worker (dry_day policies, unique window)
```

External rails (Meta, real ASR/TTS, UPI partner, IMD) sit behind provider interfaces. Without API keys the app runs on mocks so demos and tests stay offline-capable.

## Quick start

### 1. Install

```bash
npm install
npx playwright install chromium   # once, for headless E2E
```

### 2. Postgres (Docker)

Local Postgres listens on **5434** so it does not collide with other stacks on 5432:

```bash
npm run db:up
# equivalent: docker compose up -d postgres
```

Copy env and point at the container:

```bash
cp .env.example .env
```

Default local URL in `.env.example`:

```env
DATABASE_URL=postgresql://cropguard:cropguard@127.0.0.1:5434/cropguard
PORT=5055
```

> **Port note:** the app defaults to **5055**. macOS AirPlay Receiver often binds **5000**, which returns HTTP 403 and breaks local/E2E runs.

### 3. Schema, seed, run

```bash
npm run db:push
npm run seed
npm run dev
```

Open http://localhost:5055

Useful URLs after seed:

- `/dashboard/farmer/1` — Ramesh (farmer console)
- `/dashboard/insurer` — underwriter desk
- `/payment/2` — payment tracking for a seeded claim
- `/api/dev/scenarios` — persona list
- `/mockups/cropguard-2-workflow.html` — product walkthrough (served by the app)

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run db:up` | Start Docker Postgres (`cropguard-pg` on host port 5434) |
| `npm run db:push` | Push Drizzle schema to Postgres |
| `npm run seed` | Load CropGuard 2.0 synthetic personas |
| `npm run dev` | API + Vite (default port **5055**) |
| `npm test` | Unit + regression suite (Vitest) |
| `npm run test:regression` | Golden scenarios under `server/test` |
| `npm run test:e2e` | Headless Playwright suite (starts `npm run dev`, needs `DATABASE_URL`) |
| `npm run test:e2e:report` | Same as E2E; reminds you to open the HTML report |
| `npm run test:smoke` | Optional live HTTP smoke (skips if server down) |

## End-to-end validation

Playwright covers registration, policy purchase, claim chat, farmer/insurer dashboards, payment tracking, WhatsApp webhook APIs, the product mockup chapters, and the parametric worker.

```bash
npm run db:up
npm run db:push
npm run seed
npm run test:e2e
```

Artifacts:

| File | Contents |
| --- | --- |
| `reports/validation-report.html` | Human-readable flow validation report |
| `reports/validation-report.json` | Machine-readable summary |
| `reports/playwright-results.json` | Raw Playwright JSON |
| `playwright-report/` | Playwright HTML trace UI |

Override base URL if needed: `E2E_PORT=5055` or `E2E_BASE_URL=http://127.0.0.1:5055`.

## Environment

```env
DATABASE_URL=postgresql://cropguard:cropguard@127.0.0.1:5434/cropguard
SESSION_SECRET=change-me
NODE_ENV=development
PORT=5055

# CropGuard 2.0 (optional — mocks used when unset)
WHATSAPP_APP_SECRET=
WHATSAPP_VERIFY_TOKEN=cropguard-dev
PAYMENT_PROVIDER=mock
WORKER_ENABLED=true
CLAIM_SETTLEMENT_HOURS=6
SEED_TOKEN=
```

Any Postgres-compatible `DATABASE_URL` works (local Docker, Neon, etc.). The server uses the standard `pg` driver via Drizzle.

## Synthetic personas (clock: 1 Oct 2026)

| Persona | Phone | Shows |
| --- | --- | --- |
| Ramesh Patil | +919800000001 | Premium policy, settled + approved claims, Marathi path |
| Suresh Singh | +919800000002 | Farm profile / advisory persona |
| Anita Deshmukh | +919800000003 | 21 dry-day parametric payout (+ twin at 20 days) |
| Ibrahim Khan | +919800000004 | Short survey number, rejected claim, failed payment |
| Meera | +919800000005 | Session in `awaiting_registration` |
| Pooja Shah | +919800000099 | Insurer (`user_type=insurer`) |

Dev OTP for Ramesh: `111111` (development only). Registration for new numbers returns a demo OTP in the API response when `NODE_ENV=development`.

## API surface (2.0)

- `GET/POST /api/whatsapp/webhook` — Meta verify + inbound
- `POST /api/whatsapp/demo-inbound` — fixture replay with replies
- `POST /api/policies/purchase` — land + policy in one step
- `POST /api/workers/parametric-scan` — dry-day scan
- `POST /api/seed/synthetic` — HTTP seed (token-gated in production)
- `GET /api/dev/scenarios` — persona gallery metadata

Existing farmer, claim, chat, and dashboard routes remain.

## Product demos

- **Interactive mockup:** [mockups/cropguard-2-workflow.html](mockups/cropguard-2-workflow.html)
- **Screen recording:** [mockups/cropguard-2-walkthrough.mp4](mockups/cropguard-2-walkthrough.mp4)

## Mixpanel analytics

CropGuard emits product analytics to [Mixpanel](https://mixpanel.com) (project `4070033`). Farmer journeys are tracked server-side from WhatsApp/voice and payout workers; insurer console actions use the browser SDK.

**Public dashboard:** [CropGuard Mixpanel board](https://mixpanel.com/project/4070033/view/4566488/app/boards#id=11588448)

| Surface | SDK | Module |
| --- | --- | --- |
| Insurer console (browser) | `mixpanel-browser` | `client/src/lib/mixpanel-browser.ts` |
| Farmer WhatsApp / voice / payouts (server) | `mixpanel` | `server/lib/mixpanel-server.ts` |

Farmer `distinct_id` values are SHA-256 hashes of E.164 phones — never raw numbers, names, Aadhaar, bank details, or lat/lng.

```bash
npm run generate-data -- --dry-run   # preview synthetic events
npm run generate-data               # import 90 days via Mixpanel Import API
```

See `.env.local.example` for token / service-account variables.

## Tech stack

React 18, Wouter, TanStack Query, Tailwind, shadcn/ui · Node/Express, Drizzle ORM, Postgres (`pg`) · Mixpanel · Vitest · Playwright · Docker Compose

## License

Proprietary — all rights reserved.
