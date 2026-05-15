# FaireFund — Deployment on Emergent

## Original Problem Statement
User shipped a complete FaireFund codebase (built externally) and wanted it deployed on Emergent's preview environment without rebuilding. Stack: NestJS + Next.js + PostgreSQL + Redis.

## Deployed Versions
- **v1 (2026-05-14)**: Initial deployment — 16 backend modules
- **v2 (2026-05-15)**: User uploaded `fairefund_emergent.zip` with 5 new modules (AI, KYC, OTP, Storage, Wallets), Emergent-specific deployment helpers, and `next.config.js` with rewrites + standalone output.

## Current Live Stack (v2)
- **Backend (NestJS 10)**: 21 modules listening on `0.0.0.0:8001` with global prefix `/api/v1`
  - New routes: `/api/v1/ai`, `/api/v1/storage`, `/api/v1/otp`, `/api/v1/kyc`
- **Frontend (Next.js 14)**: production build served on `:3000`
- **PostgreSQL 15**: schema.sql + schema_v2.sql loaded with seed data (6 demo users, 6 SMEs, 3 investments)
- **Redis 7**: rate limiting, token blacklist, pub/sub

## Verified Working
- `GET /api/v1/health` → 200 (db connected)
- `POST /api/v1/auth/login` → JWT issued for all 6 demo users
- Frontend → /dashboard/marketplace renders 6 SME cards with full investor context
- All 21 backend route resolvers logged on boot

## MOCKED / Optional Integrations (env keys blank — modules in sandbox/no-op mode)
- **Razorpay** (`RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET`): placeholder — payment signature verify will fail until real test keys provided
- **OpenAI** (`OPENAI_API_KEY`): blank — AI scoring module falls back to rule-based
- **Signzy/Karza** (`SIGNZY_TOKEN`, `KARZA_API_KEY`): blank — KYC module in sandbox
- **MSG91** (`MSG91_AUTH_KEY`): blank — OTP module email-only mode
- **AWS S3** (`AWS_S3_BUCKET` + creds): blank — Storage module metadata-only
- **SMTP**: blank — email module no-op

## Configuration Adjustments Made
1. `frontend/src/lib/api.ts` → BASE path uses `/api/v1` matching backend global prefix
2. `frontend/.env` → `NEXT_PUBLIC_API_URL=http://127.0.0.1:8001` for SSR
3. `backend/.env` → generated strong JWT secrets, postgres + redis URLs, CORS origins
4. `/etc/supervisor/conf.d/supervisord.conf` → manages backend (node dist/src/main.js), frontend (yarn start), postgres, redis
5. Seed user password hashes rewritten with bcrypt(`fairefund123`, 12)
6. Re-installed PostgreSQL + Redis after pod reset

## Backlog / Next Actions
- **P0** Razorpay test keys (real ones from dashboard.razorpay.com/app/keys)
- **P1** SMTP credentials OR switch to SendGrid/Resend via integration_playbook_expert_v2
- **P1** Optional: OpenAI key for AI scoring, MSG91 for SMS OTP, AWS S3 for document storage
- **P1** Deep-test new modules: `/api/v1/ai`, `/api/v1/kyc`, `/api/v1/otp`, `/api/v1/storage`
- **P2** Run the 60 unit/integration tests in `/app/backend/test/`
- **P2** When ready, hit Deploy button to promote preview → production
