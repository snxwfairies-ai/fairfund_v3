# 🏛️ FairFund — MSME Investment Exchange Platform
### Production-Grade · Docker-First · SEBI-Aligned · 60 Tests

Full-stack fintech platform: MSMEs raise funds, investors invest, agents refer, CA/CS verify.

---

## Quick Start

```bash
make setup      # create .env from template
make secrets    # generate strong random secrets → paste into .env
make dev        # development with hot reload
make prod       # production on :80/:443
```

**Demo accounts** (password: `fairfund123`):

| Role | Email |
|---|---|
| Investor | prashant@fairfund.in |
| SME Admin | riya@agritech.in |
| Agent | agent@fairfund.in |
| CA/CS | ca@fairfund.in |
| Admin | admin@fairfund.in |

---

## Stack

| Layer | Technology |
|---|---|
| API | NestJS (Node.js) · 16 modules · WebSocket |
| Database | PostgreSQL 16 · 23 tables · double-entry ledger |
| Cache | Redis 7 · rate limiting · token blacklist |
| Frontend | Next.js 14 · TypeScript · Tailwind CSS |
| Proxy | Nginx · TLS · gzip · rate zones |
| Infra | Docker Compose · internal networks · non-root containers |

---

## Architecture

```
Internet → Nginx :80/:443
             │ /api → NestJS :5000
             │ /     → Next.js :3000
             │
       ┌─────┴──────┐
    NestJS        Next.js
       │
  ┌────┴────┐
Postgres  Redis
(private) (private)
```

---

## 💰 Ledger (Bank-Grade)

Every rupee tracked through double-entry accounting. No stored balances — only entries.

**9-Step Investment Flow:**
```
STEP 0  Pre-checks: KYC verified, Section 42 cap, overfunding guard
STEP 1  Create INITIATED investment record
STEP 2  Razorpay order created (no ledger yet)
STEP 3  Webhook received → HMAC-SHA256 verified
STEP 4  LEDGER: Escrow → Investor AVAILABLE
STEP 5  LEDGER: AVAILABLE → LOCKED
STEP 6  Confirmation notification
STEP 7  LEDGER: LOCKED → MSME WALLET (net of 2% fee)
STEP 8  LEDGER: MSME → PLATFORM_FEES
STEP 9  Shares allotted, agent commission earned
```

**Failure scenarios handled:**
- MSME rejected → LOCKED → AVAILABLE (idempotent refund)
- Withdrawal failure → PENDING → AVAILABLE (rollback)
- MSME default → full/partial recovery or DEFAULTED
- Duplicate webhook → idempotency check, ignored
- Server crash mid-flow → retry engine with backoff

---

## Modules

```
auth           JWT + refresh tokens (15min/7d), bcrypt rounds=12
onboarding     State machine: REGISTER→PROFILE→KYC→VERIFICATION→APPROVAL→ACTIVE
users          Profile, KYC submission, document upload
smes           Listings CRUD, submit for review, compliance checklist
investments    9-step flow, payment webhook, eSign, escrow, allotment
ledger         Double-entry engine, all 3 failure scenarios
payments       Razorpay signature verify, webhook routing, payout
agent          Referral codes, commission tracking, tier upgrades
ca             Verification queue, document review, approve/reject
admin          KYC queue, SME approval, investment settlement, audit
dashboard      Single /dashboard endpoint → role-based response
transaction    Retry engine (30s→5m→30m), reconciliation
notifications  In-app + Redis pub/sub for WebSocket delivery
email          Nodemailer + HTML templates (KYC, investment, commission)
portfolio      Holdings, gain/loss, wallet balances
analytics      Platform stats, sector distribution
```

---

## Frontend Pages

```
/login                  Auth (login + register + referral code)
/dashboard/marketplace  Live deals, SME cards, deal modal (4 tabs)
/dashboard/portfolio    Holdings, returns, KYC/eSign/escrow status
/dashboard/sme-dashboard Fundraise progress, compliance, investor table
/dashboard/sme-create   4-step listing wizard
/dashboard/analytics    Recharts bar/pie, sector breakdown, top SMEs
/dashboard/compliance   Legal framework, 8 compliance modules, roadmap
/dashboard/profile      KYC submit, profile edit, onboarding tracker
/dashboard/agent        Funnel chart, referral list, commissions
/dashboard/ca           Priority queue, review modal, sign-off
/dashboard/admin        KYC queue, SME review, investments, audit log
```

---

## Security

- JWT access (15min) + refresh (7d, rotated + revokable)
- Token theft detection: mismatch revokes all sessions
- Rate limiting: 10 auth/15min, 120 API/min (Redis-backed)
- Razorpay HMAC-SHA256 signature verification
- RolesGuard globally applied — every route protected by role
- Input validation: class-validator whitelist on every DTO
- Immutable audit_log table — append only, never modified
- DB + Redis on internal Docker network (never internet-exposed)
- Non-root container user (uid 1001), read-only filesystem

---

## Tests

```bash
npm run test:unit        # 42 unit tests
npm run test:integration # 18 integration tests  
npm run test:all         # 60 total
```

Coverage: ledger engine, investment flow, payment signature, failure scenarios, idempotency.

---

## Operations

```bash
make dev              # Dev with hot reload
make prod             # Production
make down             # Stop all
make logs             # Follow logs
make db-shell         # psql into database
make ssl-self-signed  # Generate self-signed cert (dev)
make clean            # Remove containers + volumes
make secrets          # Print generated secrets
```

---

## Environment Variables

See `.env.example` for all 22 required variables including:
- `POSTGRES_PASSWORD`, `REDIS_PASSWORD`
- `JWT_SECRET`, `JWT_REFRESH_SECRET` (openssl rand -hex 64)
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` (optional)

---

## Deployment

```bash
# aaPanel / VPS
make setup && make secrets   # fill .env
make ssl-self-signed          # or real cert in nginx/certs/
make prod                     # starts all 5 containers

# SSL (Let's Encrypt)
certbot certonly --standalone -d yourdomain.com
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem nginx/certs/
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem   nginx/certs/
```

---

## Schema Summary

- 23 tables · 44 indexes · 4 views · 7 triggers · 12 enums
- Double-entry ledger enforced at DB level (trigger rejects imbalance)
- Section 42 cap trigger: rejects investor #201+
- Immutable transactions: trigger blocks modification after finalization
- Auto referral code generation on agent profile insert
