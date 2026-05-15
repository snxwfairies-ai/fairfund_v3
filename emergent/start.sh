#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
#  FaireFund — Emergent Startup Script
#  Runs on first boot and after redeploys.
#  Path: /app/start.sh
# ═══════════════════════════════════════════════════════════
set -e

echo "🚀 FaireFund starting on Emergent..."
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── 1. Wait for PostgreSQL ──────────────────────────────────────────────────
echo "⏳ Waiting for PostgreSQL..."
until pg_isready -h 127.0.0.1 -p 5432 -U "${POSTGRES_USER:-ffuser}" 2>/dev/null; do
  sleep 1
done
echo "✅ PostgreSQL ready"

# ── 2. Create database if needed ────────────────────────────────────────────
PGPASSWORD="${POSTGRES_PASSWORD}" psql \
  -h 127.0.0.1 -U "${POSTGRES_USER:-ffuser}" \
  -tc "SELECT 1 FROM pg_database WHERE datname='${POSTGRES_DB:-fairefund}'" \
  | grep -q 1 || PGPASSWORD="${POSTGRES_PASSWORD}" createdb \
  -h 127.0.0.1 -U "${POSTGRES_USER:-ffuser}" "${POSTGRES_DB:-fairefund}"

# ── 3. Run schema migrations ─────────────────────────────────────────────────
echo "📐 Running schema..."
PGPASSWORD="${POSTGRES_PASSWORD}" psql \
  -h 127.0.0.1 -U "${POSTGRES_USER:-ffuser}" -d "${POSTGRES_DB:-fairefund}" \
  -f "$APP_DIR/postgres/schema.sql" --on-error-stop 2>&1 | grep -E "NOTICE|ERROR|error" || true

PGPASSWORD="${POSTGRES_PASSWORD}" psql \
  -h 127.0.0.1 -U "${POSTGRES_USER:-ffuser}" -d "${POSTGRES_DB:-fairefund}" \
  -f "$APP_DIR/postgres/schema_v2.sql" --on-error-stop 2>&1 | grep -E "NOTICE|ERROR|error" || true

echo "✅ Schema loaded"

# ── 4. Build backend if dist/ is absent ─────────────────────────────────────
if [ ! -f "$APP_DIR/backend/dist/main.js" ]; then
  echo "🔨 Building NestJS backend..."
  cd "$APP_DIR/backend"
  npm install --legacy-peer-deps
  npm run build
  echo "✅ Backend built"
fi

# ── 5. Build frontend if .next/ is absent ───────────────────────────────────
if [ ! -d "$APP_DIR/frontend/.next" ]; then
  echo "🔨 Building Next.js frontend..."
  cd "$APP_DIR/frontend"
  npm install --legacy-peer-deps
  npm run build
  echo "✅ Frontend built"
fi

# ── 6. Start processes ───────────────────────────────────────────────────────
echo "▶  Starting backend on :8001..."
cd "$APP_DIR/backend"
node dist/main.js &
BACKEND_PID=$!

echo "▶  Starting frontend on :3000..."
cd "$APP_DIR/frontend"
node .next/standalone/server.js &
FRONTEND_PID=$!

echo ""
echo "✅ FaireFund is live!"
echo "   Frontend → http://localhost:3000"
echo "   API      → http://localhost:8001/api/v1"
echo "   Health   → http://localhost:8001/api/v1/health"

# Keep alive
wait $BACKEND_PID $FRONTEND_PID
