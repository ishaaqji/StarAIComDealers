# Star AI Platform V1

Multi-tenant SaaS platform for local electronics dealers. Each dealer gets an isolated AI-powered operating layer: product catalog, CRM, AI recommendations, knowledge base (RAG), and local AI deployment — with PostgreSQL Row-Level Security enforcing tenant isolation.

## Architecture (from blueprint)

- **Backend:** Node.js + Express + TypeScript
- **Database:** PostgreSQL 15+ with pgvector
- **Auth:** JWT + RLS context (`dealer_id` per tenant)
- **AI:** Ollama (local) / OpenAI adapter layer
- **Storage:** S3-compatible (MinIO / AWS S3)
- **Queue:** BullMQ (Redis)
- **Frontend:** Next.js 14 App Router
- **Local AI installer:** Electron or CLI (Windows/Linux)

## Repo layout (§18)

```
star-ai/
├── apps/
│   ├── backend/          # Node.js/TypeScript API (auth, dealers, catalog, knowledge, ai, customers, orders, rewards, local-ai)
│   ├── dashboard/        # Next.js 14 (App Router) dealer + customer portals
│   └── installer/        # Local AI installer (detect-hardware, select-model, install-runtime, activate)
├── packages/
│   ├── types/            # shared TS types
│   ├── schema/           # shared Zod schemas
│   └── utils/            # shared validate + error-handler helpers
├── migrations/           # numbered PostgreSQL migrations
├── docker-compose.yml    # dev (Postgres + Redis + MinIO + API + Dashboard)
├── docker-compose.prod.yml
└── .env.example
```

## Quick start

```bash
# 1. Copy env and edit secrets
cp .env.example .env
# edit .env (JWT_SECRET, DB credentials, etc.)

# 2. Install dependencies (workspaces)
npm install

# 3. Start infra (requires Docker Desktop running)
docker compose up -d postgres redis minio

# 4. Run migrations + seed
npm run db:migrate
npm run db:seed

# 5. Start backend + dashboard
npm run dev

# API:  http://localhost:3001
# App:  http://localhost:3000
```

## Step 0 — Foundation (per §20)

- [x] Git repository + monorepo layout
- [x] Docker Compose (Postgres + Redis + MinIO)
- [x] Initial migration: `dealers`, `dealer_users`, `dealer_branding`, `dealer_settings`
- [x] JWT auth (login / refresh / me / register) + RLS middleware
- [x] Seed tenant #1: Shweta Computers + dealer admin
- [ ] Dealer admin logs in and sees empty dashboard (manual verify)

## Tenant isolation

Every dealer-scoped table carries `dealer_id`. RLS policies enforce
`dealer_id = current_setting('app.dealer_id')`. The auth middleware sets this
context per request; platform admins (`BYPASSRLS`) can read across tenants.

Seed credentials (V1 dev):
- Dealer: `shweta-computers` (Shweta Computers)
- Admin: `admin@shwetacomputers.in` / `Admin@123` (change on first login)
