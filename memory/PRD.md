# FaireFund — Deployment on Emergent

## Original Problem Statement
User shipped a complete FaireFund codebase (built externally) and wanted it deployed on Emergent's preview environment without rebuilding. Stack: NestJS + Next.js + PostgreSQL + Redis.

## What Was Deployed (2026-05-14)
- **Backend**: NestJS 10 (16 modules, WebSocket, JWT auth) listening on `0.0.0.0:8001` with global prefix `/api/v1`
- **Frontend**: Next.js 14 production build, served via `next start` on `:3000`
- **PostgreSQL 15**: schema.sql + schema_v2.sql loaded with seed data (4 demo users + 2 v2 users, 6 SMEs, 3 investments, compliance tasks)
- **Redis 7**: backing rate limiting + token blacklist + pub/sub
- Supervisor manages all four processes (backend, frontend, postgres, redis)

## Configuration Adjustments Made
1. `frontend/src/lib/api.ts` → BASE path changed from `/api` to `/api/v1` to match backend's global prefix when fronted by Emergent ingress.
2. `frontend/.env` → added `NEXT_PUBLIC_API_URL=http://127.0.0.1:8001` for SSR.
3. `backend/.env` → generated strong JWT secrets, postgres + redis URLs, CORS origins.
4. `supervisord.conf` → swapped uvicorn/yarn-start with `node dist/src/main.js` and added postgres + redis programs.
5. Seed user password hashes rewritten with bcrypt(`fairefund123`, 12).

## Verified Working
- `GET /api/v1/health` (200, db connected)
- `POST /api/v1/auth/login` (200, JWT issued) — tested with investor + admin
- Login UI → /dashboard/marketplace renders all 6 SME cards with stats

## Not Verified / Mocked
- **Razorpay**: keys are placeholder. Investment flow (`/api/v1/investments`) will fail at webhook signature step until real test keys provided. **MOCKED for now.**
- **SMTP**: unconfigured (no transactional email sends).
- All other 11 dashboard routes (portfolio, analytics, sme-create, agent, ca, admin, compliance, profile) — render but not deep-tested.

## Backlog / Next Actions
- P0: Plug in real Razorpay test keys + webhook secret
- P1: SMTP credentials (or swap to SendGrid/Resend via integration_playbook_expert_v2)
- P1: Deep-test all 11 dashboard routes
- P2: Run the 60 unit/integration tests bundled in `/app/backend/test/`
- P2: TLS/Nginx config skipped (Emergent ingress handles TLS)
