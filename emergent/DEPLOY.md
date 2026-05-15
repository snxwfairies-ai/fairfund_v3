# FaireFund — Emergent Deployment Guide

## Architecture on Emergent

```
Emergent Pod
│
├─ Next.js   → :3000  (browser traffic)
├─ NestJS    → :8001  (API, /api/v1/*)
├─ PostgreSQL → :5432  (internal)
└─ Redis     → :6379  (internal)

Browser → Emergent URL
  ├─ / → Next.js :3000
  └─ /api/v1/* → NestJS :8001 (via Next.js rewrite proxy)
```

---

## Step-by-Step Deploy

### 1. Upload project
Upload this entire folder to `/app/` on your Emergent pod.

### 2. Set environment variables

Copy `emergent/.env.emergent` → `/app/.env`:

```bash
cp /app/emergent/.env.emergent /app/.env
```

**Required** (must change):
```bash
POSTGRES_PASSWORD=<strong-password>
REDIS_PASSWORD=<strong-password>
JWT_SECRET=<openssl rand -hex 64>
JWT_REFRESH_SECRET=<openssl rand -hex 64 different from above>
ALLOWED_ORIGINS=https://your-url.preview.emergentagent.com
APP_URL=https://your-url.preview.emergentagent.com
```

**For payments** (get from dashboard.razorpay.com → Settings → API Keys):
```bash
RAZORPAY_KEY_ID=rzp_test_XXXX
RAZORPAY_KEY_SECRET=XXXX
RAZORPAY_WEBHOOK_SECRET=XXXX
```

### 3. Install + build

```bash
cd /app/backend  && npm install --legacy-peer-deps && npm run build
cd /app/frontend && npm install --legacy-peer-deps && npm run build
```

### 4. Load database schema

```bash
# Load schema (idempotent — safe to re-run)
PGPASSWORD=$POSTGRES_PASSWORD psql \
  -h 127.0.0.1 -U ffuser -d fairefund \
  -f /app/postgres/schema.sql

PGPASSWORD=$POSTGRES_PASSWORD psql \
  -h 127.0.0.1 -U ffuser -d fairefund \
  -f /app/postgres/schema_v2.sql
```

### 5. Start processes

**Recommended: use supervisor**

Copy the supervisor config:
```bash
cp /app/emergent/supervisord.conf /etc/supervisor/conf.d/fairefund.conf
supervisorctl reread && supervisorctl update
```

**Or: start manually**

```bash
# Terminal 1 — Backend
cd /app/backend
NODE_ENV=production PORT=8001 node dist/main.js

# Terminal 2 — Frontend
cd /app/frontend
PORT=3000 HOSTNAME=0.0.0.0 node .next/standalone/server.js
```

### 6. Verify

```bash
curl http://localhost:8001/api/v1/health
# → {"status":"ok","db":"connected","platform":"FaireFund"}

curl -s http://localhost:3000 | head -1
# → <!DOCTYPE html>
```

---

## Demo Accounts (password: `fairefund123`)

| Role | Email |
|---|---|
| Investor | prashant@fairefund.in |
| SME Admin | riya@agritech.in |
| Agent | agent@fairefund.in |
| CA/CS | ca@fairefund.in |
| Admin | admin@fairefund.in |

---

## Razorpay Webhook Setup

After getting your Emergent preview URL, add the webhook in Razorpay dashboard:

```
URL:    https://your-url.preview.emergentagent.com/api/v1/payments/webhook/razorpay
Events: payment.captured, payment.failed, payout.processed, payout.reversed
```

---

## Troubleshooting

**Backend won't start:**
```bash
cd /app/backend && node dist/main.js 2>&1 | head -20
```

**Schema already exists errors:**
```bash
# These are safe — schema uses IF NOT EXISTS
# Re-run is idempotent
```

**Frontend can't reach API:**
```bash
# Check that PORT=8001 is set and backend is running
curl http://localhost:8001/api/v1/health
```

**Redis connection failed:**
```bash
# Check REDIS_PASSWORD matches what Redis was started with
redis-cli -a $REDIS_PASSWORD ping  # should return PONG
```

---

## Adding Real Razorpay Keys

1. Go to https://dashboard.razorpay.com/app/keys
2. Copy test keys into `/app/.env`:
   ```
   RAZORPAY_KEY_ID=rzp_test_XXXX
   RAZORPAY_KEY_SECRET=XXXX
   RAZORPAY_WEBHOOK_SECRET=XXXX
   ```
3. Restart backend: `supervisorctl restart backend`
4. Test the investment flow from the marketplace

---

## File Locations on Emergent Pod

```
/app/
├── backend/          NestJS source + compiled dist/
├── frontend/         Next.js source + .next/ build
├── postgres/         schema.sql + schema_v2.sql
├── emergent/         start.sh, supervisord.conf, .env template
├── .env              Your secrets (create from .env.emergent)
└── README.md         Full project documentation
```
