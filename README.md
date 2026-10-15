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
| **Tests** | Vitest unit + regression goldens (`npm test` / `npm run test:regression`) |
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

```bash
npm install
cp .env.example .env   # or export DATABASE_URL
npm run db:push
npm run seed
npm run dev
```

Open http://localhost:5000

Useful URLs after seed:

- `/dashboard/farmer/:id` — farmer console  
- `/dashboard/insurer` — underwriter desk  
- `/api/dev/scenarios` — persona list  
- `/mockups/cropguard-2-workflow.html` — product walkthrough (open as a file or via static hosting)

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | API + Vite on port 5000 |
| `npm run db:push` | Push Drizzle schema to Postgres |
| `npm run seed` | Load CropGuard 2.0 synthetic personas |
| `npm test` | Unit + regression suite |
| `npm run test:regression` | Golden scenarios under `server/test` |
| `npm run test:smoke` | Optional live HTTP smoke (skips if server down) |

## Environment

```env
DATABASE_URL=postgresql://...
SESSION_SECRET=...
NODE_ENV=development
PORT=5000

# CropGuard 2.0 (optional — mocks used when unset)
WHATSAPP_APP_SECRET=
WHATSAPP_VERIFY_TOKEN=cropguard-dev
PAYMENT_PROVIDER=mock
WORKER_ENABLED=true
CLAIM_SETTLEMENT_HOURS=6
SEED_TOKEN=
```

## Synthetic personas (clock: 1 Oct 2026)

| Persona | Phone | Shows |
| --- | --- | --- |
| Ramesh Patil | +919800000001 | Premium policy, settled + approved claims, Marathi path |
| Suresh Singh | +919800000002 | Farm profile / advisory persona |
| Anita Deshmukh | +919800000003 | 21 dry-day parametric payout (+ twin at 20 days) |
| Ibrahim Khan | +919800000004 | Short survey number, rejected claim, failed payment |
| Meera | +919800000005 | Session in `awaiting_registration` |
| Pooja Shah | +919800000099 | Insurer (`user_type=insurer`) |

Dev OTP for Ramesh: `111111` (development only).

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

## Tech stack

React 18, Wouter, TanStack Query, Tailwind, shadcn/ui · Node/Express, Drizzle ORM, Neon Postgres · Vitest

## License

Proprietary — all rights reserved.
