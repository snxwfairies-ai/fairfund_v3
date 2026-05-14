-- ═══════════════════════════════════════════════════════════════════════════
--  FaireFund — Schema Additions (v2)
--  Additive only — no existing tables modified destructively
--  Run AFTER schema.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Extend user_role enum with new roles ──────────────────────────────
DO $$ BEGIN
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'agent';
  ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'ca_cs';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 2. Onboarding state machine ─────────────────────────────────────────
-- REGISTER → PROFILE → KYC → VERIFICATION → APPROVAL → ACTIVE
CREATE TYPE onboarding_step AS ENUM (
  'register',       -- account created
  'profile',        -- basic profile filled
  'kyc',            -- KYC docs submitted
  'verification',   -- under CA/CS or admin review
  'approval',       -- approved, awaiting activation
  'active'          -- fully onboarded
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_step onboarding_step NOT NULL DEFAULT 'register';
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS agent_id    UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_users_onboarding ON users(onboarding_step) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_referral   ON users(referral_code)   WHERE referral_code IS NOT NULL;

-- ─── 3. Role-specific profile tables ─────────────────────────────────────

-- Investor profile
CREATE TABLE IF NOT EXISTS investor_profiles (
    user_id                UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    risk_appetite          TEXT    CHECK (risk_appetite IN ('conservative','moderate','aggressive')),
    investment_horizon     TEXT,            -- '1-2 years', '3-5 years', etc.
    annual_income_band     TEXT,
    net_worth_band         TEXT,
    is_accredited          BOOLEAN NOT NULL DEFAULT FALSE,
    accredited_verified_at TIMESTAMPTZ,
    bank_account_number    TEXT,            -- encrypted in app layer
    bank_ifsc              TEXT,
    bank_account_name      TEXT,
    bank_verified          BOOLEAN NOT NULL DEFAULT FALSE,
    bank_verified_at       TIMESTAMPTZ,
    max_single_investment  NUMERIC(15,2),
    total_invested         NUMERIC(15,2) NOT NULL DEFAULT 0,
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Agent profile
CREATE TABLE IF NOT EXISTS agent_profiles (
    user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    referral_code       TEXT NOT NULL UNIQUE,
    commission_rate_pct NUMERIC(5,2) NOT NULL DEFAULT 1.00,  -- % of investment amount
    commission_tier     TEXT DEFAULT 'standard',              -- standard, silver, gold, platinum
    total_referrals     INTEGER NOT NULL DEFAULT 0,
    active_referrals    INTEGER NOT NULL DEFAULT 0,
    total_aum_referred  NUMERIC(15,2) NOT NULL DEFAULT 0,     -- total assets under management
    total_commission_earned NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_commission_paid   NUMERIC(15,2) NOT NULL DEFAULT 0,
    bank_account_number TEXT,
    bank_ifsc           TEXT,
    bank_verified       BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- MSME profile (enriches existing smes table)
CREATE TABLE IF NOT EXISTS msme_profiles (
    user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    sme_id               UUID REFERENCES smes(id),
    director_name        TEXT,
    director_pan         TEXT,
    director_din         TEXT,
    company_type         TEXT,     -- 'pvt_ltd', 'llp', 'partnership', 'proprietorship'
    incorporation_date   DATE,
    gst_registered       BOOLEAN NOT NULL DEFAULT FALSE,
    gst_annual_return_url TEXT,
    itr_last_2yr_url     TEXT,
    bank_statement_url   TEXT,
    ca_cs_assigned_to    UUID REFERENCES users(id),
    ca_cs_review_notes   TEXT,
    ca_cs_reviewed_at    TIMESTAMPTZ,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CA/CS profile
CREATE TABLE IF NOT EXISTS ca_cs_profiles (
    user_id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    professional_type    TEXT NOT NULL CHECK (professional_type IN ('ca','cs','cma')),
    membership_number    TEXT NOT NULL UNIQUE,
    membership_body      TEXT NOT NULL,  -- 'ICAI', 'ICSI', 'ICMAI'
    membership_valid_till DATE,
    certificate_url      TEXT,
    is_empanelled        BOOLEAN NOT NULL DEFAULT FALSE,
    empanelled_at        TIMESTAMPTZ,
    verifications_done   INTEGER NOT NULL DEFAULT 0,
    verifications_pending INTEGER NOT NULL DEFAULT 0,
    current_load         INTEGER NOT NULL DEFAULT 0,  -- active assignments
    max_load             INTEGER NOT NULL DEFAULT 10, -- max concurrent
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 4. Agent referral & commission tracking ──────────────────────────────
CREATE TABLE IF NOT EXISTS referrals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        UUID NOT NULL REFERENCES users(id),
    referred_user_id UUID NOT NULL REFERENCES users(id),
    referral_code   TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','kyc_done','invested','converted','inactive')),
    first_investment_id   UUID REFERENCES investments(id),
    first_investment_date TIMESTAMPTZ,
    total_invested        NUMERIC(15,2) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (agent_id, referred_user_id)
);
CREATE INDEX IF NOT EXISTS idx_referrals_agent  ON referrals(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_referrals_user   ON referrals(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code   ON referrals(referral_code);

-- Commission ledger (separate from money ledger — tracks earned/paid agent commissions)
CREATE TABLE IF NOT EXISTS commissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id        UUID NOT NULL REFERENCES users(id),
    referral_id     UUID NOT NULL REFERENCES referrals(id),
    investment_id   UUID NOT NULL REFERENCES investments(id),
    gross_amount    NUMERIC(15,2) NOT NULL,   -- investment amount
    rate_pct        NUMERIC(5,2)  NOT NULL,   -- commission % at time of earning
    commission_amount NUMERIC(15,2) NOT NULL, -- gross_amount * rate_pct / 100
    status          TEXT NOT NULL DEFAULT 'earned'
                      CHECK (status IN ('earned','approved','paid','clawed_back')),
    paid_at         TIMESTAMPTZ,
    payout_ref      TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_commissions_agent  ON commissions(agent_id, status);
CREATE INDEX IF NOT EXISTS idx_commissions_inv    ON commissions(investment_id);

-- ─── 5. CA/CS verification queue ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS verification_queue (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sme_id          UUID REFERENCES smes(id),
    msme_user_id    UUID REFERENCES users(id),
    assigned_to     UUID REFERENCES users(id),  -- ca_cs user
    status          TEXT NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued','in_review','approved','rejected','info_required')),
    priority        SMALLINT NOT NULL DEFAULT 3, -- 1=urgent, 5=low
    review_type     TEXT NOT NULL DEFAULT 'msme_onboarding'
                      CHECK (review_type IN ('msme_onboarding','periodic_review','compliance_check')),
    documents_checklist JSONB,     -- {pas4: true, financials: false, ...}
    review_notes    TEXT,
    rejection_reason TEXT,
    info_required   TEXT,          -- what docs/info are missing
    assigned_at     TIMESTAMPTZ,
    due_date        DATE,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vq_assigned ON verification_queue(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_vq_sme      ON verification_queue(sme_id);
CREATE INDEX IF NOT EXISTS idx_vq_status   ON verification_queue(status, priority);

-- ─── 6. Onboarding audit trail ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_events (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    from_step   onboarding_step NOT NULL,
    to_step     onboarding_step NOT NULL,
    triggered_by UUID REFERENCES users(id),  -- null = self, or admin/ca_cs who approved
    notes       TEXT,
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_onboarding_user ON onboarding_events(user_id, created_at DESC);

-- ─── 7. Transaction retry/reconciliation table ────────────────────────────
CREATE TABLE IF NOT EXISTS transaction_retries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    investment_id   UUID NOT NULL REFERENCES investments(id),
    payment_ref     TEXT,
    retry_type      TEXT NOT NULL,   -- 'webhook_replay', 'ledger_repair', 'refund_retry'
    attempt_number  SMALLINT NOT NULL DEFAULT 1,
    status          TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','success','failed','abandoned')),
    error_message   TEXT,
    next_retry_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_retries_pending ON transaction_retries(status, next_retry_at)
  WHERE status IN ('pending','failed');

-- ─── 8. Useful views for new roles ────────────────────────────────────────

-- Agent performance summary
CREATE OR REPLACE VIEW v_agent_performance AS
SELECT
    u.id AS agent_id,
    u.name AS agent_name,
    u.email,
    ap.referral_code,
    ap.commission_tier,
    ap.commission_rate_pct,
    COUNT(r.id)                                         AS total_referrals,
    COUNT(CASE WHEN r.status = 'converted' THEN 1 END) AS converted,
    COUNT(CASE WHEN r.status = 'invested'  THEN 1 END) AS invested_not_converted,
    COALESCE(SUM(r.total_invested), 0)                  AS total_aum,
    COALESCE(ap.total_commission_earned, 0)             AS commission_earned,
    COALESCE(ap.total_commission_paid, 0)               AS commission_paid,
    ap.total_commission_earned - ap.total_commission_paid AS commission_outstanding
FROM users u
JOIN agent_profiles ap ON ap.user_id = u.id
LEFT JOIN referrals r  ON r.agent_id = u.id
WHERE u.role = 'agent' AND u.deleted_at IS NULL
GROUP BY u.id, u.name, u.email, ap.referral_code, ap.commission_tier,
         ap.commission_rate_pct, ap.total_commission_earned, ap.total_commission_paid;

-- CA/CS workload view
CREATE OR REPLACE VIEW v_ca_workload AS
SELECT
    u.id AS ca_id,
    u.name AS ca_name,
    cp.professional_type,
    cp.membership_number,
    cp.membership_body,
    cp.current_load,
    cp.max_load,
    cp.verifications_done,
    COUNT(vq.id)                                              AS pending_count,
    COUNT(CASE WHEN vq.status = 'in_review' THEN 1 END)      AS in_review_count,
    COUNT(CASE WHEN vq.due_date < CURRENT_DATE AND vq.status NOT IN ('approved','rejected') THEN 1 END) AS overdue_count
FROM users u
JOIN ca_cs_profiles cp      ON cp.user_id = u.id
LEFT JOIN verification_queue vq ON vq.assigned_to = u.id AND vq.status NOT IN ('approved','rejected')
WHERE u.role = 'ca_cs' AND u.deleted_at IS NULL
GROUP BY u.id, u.name, cp.professional_type, cp.membership_number, cp.membership_body,
         cp.current_load, cp.max_load, cp.verifications_done;

-- ─── 9. Auto-generate agent referral code on profile creation ─────────────
CREATE OR REPLACE FUNCTION fn_agent_referral_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Generate readable referral code: FF-XXXX-XXXX
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := 'FF-' ||
      UPPER(SUBSTRING(MD5(NEW.user_id::TEXT) FROM 1 FOR 4)) || '-' ||
      UPPER(SUBSTRING(MD5(NEW.user_id::TEXT) FROM 5 FOR 4));
  END IF;
  -- Also set on users table
  UPDATE users SET referral_code = NEW.referral_code WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_agent_referral_code') THEN
    CREATE TRIGGER trg_agent_referral_code
      BEFORE INSERT ON agent_profiles
      FOR EACH ROW EXECUTE FUNCTION fn_agent_referral_code();
  END IF;
END $$;

-- ─── 10. Seed new role demo accounts ─────────────────────────────────────
INSERT INTO users (id,name,email,password_hash,role,kyc_status,phone,onboarding_step) VALUES
  ('d1000000-0000-0000-0000-000000000001','Rajesh Sharma','agent@fairefund.in',
   '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBP.N.pE4WJiYi','agent','verified','9711223344','active'),
  ('d1000000-0000-0000-0000-000000000002','CA Meera Iyer','ca@fairefund.in',
   '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBP.N.pE4WJiYi','ca_cs','verified','9766554433','active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO agent_profiles (user_id,referral_code,commission_rate_pct,commission_tier) VALUES
  ('d1000000-0000-0000-0000-000000000001','FF-DEMO-AGNT',1.5,'silver')
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO ca_cs_profiles (user_id,professional_type,membership_number,membership_body,is_empanelled) VALUES
  ('d1000000-0000-0000-0000-000000000002','ca','CA-123456','ICAI',TRUE)
ON CONFLICT (user_id) DO NOTHING;

-- Assign AgriTech to CA for review
INSERT INTO verification_queue (id,sme_id,msme_user_id,assigned_to,status,priority,review_type,due_date)
SELECT gen_random_uuid(),'b1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000002',
  'in_review',1,'msme_onboarding',CURRENT_DATE + 7
WHERE NOT EXISTS (SELECT 1 FROM verification_queue LIMIT 1);

COMMIT;
