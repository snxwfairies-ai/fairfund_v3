# FairFund — Deployment on Emergent

## Deployed Versions
- **v1 (2026-05-14)**: Initial deployment — 16 backend modules
- **v2 (2026-05-15)**: Added 5 modules (AI, KYC, OTP, Storage, Wallets) + Emergent helpers
- **v3 (2026-05-16)**: Added **Landing Page** (`(landing)` route group with `/`, `/for-investors`, `/for-msmes`, `/about`) + new `waitlist` backend module + waitlist table + admin waitlist page

## Current Live Stack (v3)
- **Backend (NestJS 10)**: 22 modules on `0.0.0.0:8001` (`/api/v1` prefix). New `/api/v1/waitlist` route (POST works publicly).
- **Frontend (Next.js 14)**: standalone production build on `:3000`. Public marketing routes: `/`, `/for-investors`, `/for-msmes`, `/about`. Authenticated: `/login`, `/dashboard/*`, `/dashboard/admin/waitlist`.
- **PostgreSQL 15**: schema.sql + schema_v2.sql loaded. New `waitlist` table + `v_waitlist_stats` view.
- **Redis 7**: rate limiting, token blacklist, pub/sub.

## Verified Working
- `GET /api/v1/health` → 200
- `POST /api/v1/auth/login` → JWT for all 6 demo users
- `POST /api/v1/waitlist` → returns position number
- `GET /` (landing), `/for-investors`, `/for-msmes`, `/login` all 200

## MOCKED / Pending Keys
- **Razorpay** (P0): payments won't settle without real test keys
- **OpenAI** (`OPENAI_API_KEY`): AI scoring falls back to rule-based
- **Signzy/Karza**: KYC sandbox mode
- **MSG91**: SMS OTP disabled (email-only)
- **AWS S3**: storage metadata-only
- **SMTP**: email no-op

## Test Credentials
All demo users — password `fairfund123`:
| Role | Email |
|---|---|
| Investor | prashant@fairfund.in |
| SME Admin | riya@agritech.in |
| Agent | agent@fairfund.in |
| CA/CS | ca@fairfund.in |
| Admin | admin@fairfund.in |
| Compliance | compliance@fairfund.in |

## Infrastructure
- Postgres: `postgresql://ffuser:fairfund_pg_pass@127.0.0.1:5432/fairfund`
- Redis: `redis://:fairfund_redis_pass@127.0.0.1:6379`
- Supervisor: `/etc/supervisor/conf.d/supervisord.conf` (overridden — manages backend/frontend/postgres/redis)

## Backlog / Next Actions
- **P0** Razorpay test keys → finalize payment flow
- **P1** Production SMTP → activate transactional emails
- **P1** Deep-test the new admin waitlist page (`/dashboard/admin/waitlist`)
- **P1** Optional integrations: OpenAI, MSG91, AWS S3, Signzy/Karza
- **P2** Run 60 unit/integration tests in `/app/backend/test/`
- **P2** Click Deploy when ready to promote preview → production
