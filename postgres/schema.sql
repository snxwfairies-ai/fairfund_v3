-- ═══════════════════════════════════════════════════════════════════════════
--  FaireFund — Ledger-Grade PostgreSQL Schema
--  Designed for: SEBI/RBI alignment, audit trails, double-entry accounting
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- full-text search on names
CREATE EXTENSION IF NOT EXISTS "btree_gin"; -- multi-column GIN indexes

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. ENUMS  (type-safe, self-documenting)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE user_role        AS ENUM ('investor','sme_admin','compliance_officer','admin','super_admin');
CREATE TYPE kyc_status       AS ENUM ('not_started','pending','in_review','verified','rejected','expired');
CREATE TYPE sme_status       AS ENUM ('draft','under_review','approved','active','paused','closed','funded','rejected');
CREATE TYPE investment_status AS ENUM ('pending','esign_pending','esign_done','escrow_pending','escrow_funded','allotted','active','exited','cancelled','refunded');
CREATE TYPE txn_type         AS ENUM ('investment','refund','dividend','exit_proceeds','platform_fee','escrow_hold','escrow_release');
CREATE TYPE account_type     AS ENUM ('investor_wallet','sme_escrow','platform_fee','system');
CREATE TYPE entry_type       AS ENUM ('debit','credit');
CREATE TYPE doc_type         AS ENUM ('pan','aadhaar','gst','financials','pas4','pas3','valuation_report','subscription_agreement','cap_table','board_resolution','other');
CREATE TYPE notif_type       AS ENUM ('info','success','warning','error','action_required');
CREATE TYPE compliance_status AS ENUM ('pending','in_progress','done','waived','failed');
CREATE TYPE risk_level       AS ENUM ('low','medium','high','very_high');

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. CORE IDENTITY
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE users (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT         NOT NULL,
    email           TEXT         UNIQUE NOT NULL,
    phone           TEXT         UNIQUE,
    password_hash   TEXT         NOT NULL,
    role            user_role    NOT NULL DEFAULT 'investor',
    kyc_status      kyc_status   NOT NULL DEFAULT 'not_started',

    -- Profile
    pan             TEXT,
    aadhaar_masked  TEXT,       -- store only last 4 digits
    date_of_birth   DATE,
    address_line1   TEXT,
    address_city    TEXT,
    address_state   TEXT,
    address_pin     TEXT,

    -- Account control
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    email_verified  BOOLEAN      NOT NULL DEFAULT FALSE,
    two_fa_enabled  BOOLEAN      NOT NULL DEFAULT FALSE,
    two_fa_secret   TEXT,        -- TOTP secret (encrypted at app level)

    -- Investor limits
    annual_income_band TEXT,    -- e.g. '10L-25L'
    max_invest_limit   NUMERIC(15,2),  -- per-deal cap
    is_accredited      BOOLEAN   NOT NULL DEFAULT FALSE,

    -- Audit
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,  -- soft delete

    CONSTRAINT chk_pan  CHECK (pan  ~ '^[A-Z]{5}[0-9]{4}[A-Z]$' OR pan IS NULL),
    CONSTRAINT chk_pin  CHECK (address_pin ~ '^[0-9]{6}$' OR address_pin IS NULL)
);
CREATE UNIQUE INDEX idx_users_pan   ON users(pan)   WHERE pan IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_kyc     ON users(kyc_status);
CREATE INDEX idx_users_role    ON users(role);
CREATE INDEX idx_users_search  ON users USING gin(name gin_trgm_ops);

-- ─── Refresh tokens (JWT rotation) ────────────────────────────────────────
CREATE TABLE refresh_tokens (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL UNIQUE,
    device_info TEXT,
    ip_address  INET,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_rt_user    ON refresh_tokens(user_id);
CREATE INDEX idx_rt_expires ON refresh_tokens(expires_at) WHERE revoked_at IS NULL;

-- ─── KYC audit trail ──────────────────────────────────────────────────────
CREATE TABLE kyc_verifications (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider        TEXT        NOT NULL,  -- 'signzy','karza','manual'
    verification_type TEXT      NOT NULL,  -- 'pan','aadhaar','face_match','aml'
    status          TEXT        NOT NULL,
    provider_ref_id TEXT,
    raw_response    JSONB,                 -- encrypted response from provider
    verified_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_kyc_user ON kyc_verifications(user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. SME / OFFERING
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE smes (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by           UUID        REFERENCES users(id),

    -- Identity
    legal_name           TEXT        NOT NULL,
    cin                  TEXT        UNIQUE,
    gstin                TEXT,
    pan                  TEXT,
    registered_address   TEXT,
    sector               TEXT        NOT NULL,
    sub_sector           TEXT,
    location_city        TEXT,
    location_state       TEXT,
    website              TEXT,
    founded_year         SMALLINT,
    team_size            INTEGER,

    -- Deal terms
    status               sme_status  NOT NULL DEFAULT 'draft',
    stage                TEXT,       -- 'Seed','Seed+','Pre-Series A','Series A',...
    instrument           TEXT        NOT NULL DEFAULT 'equity',  -- equity/debt/convertible
    target_raise         NUMERIC(15,2) NOT NULL,
    min_investment       NUMERIC(15,2) NOT NULL,
    max_investment       NUMERIC(15,2),
    valuation_pre        NUMERIC(15,2),
    valuation_post       NUMERIC(15,2),
    expected_return_min  NUMERIC(5,2),
    expected_return_max  NUMERIC(5,2),
    tenure_months        SMALLINT,
    max_investors        SMALLINT    DEFAULT 200, -- Section 42 cap

    -- Actuals (maintained by triggers)
    raised_so_far        NUMERIC(15,2) NOT NULL DEFAULT 0,
    investor_count       INTEGER     NOT NULL DEFAULT 0,

    -- Scoring
    fairefund_score      SMALLINT    CHECK (fairefund_score BETWEEN 0 AND 100),
    risk_level           risk_level,
    ai_score             NUMERIC(5,2),
    ai_score_updated_at  TIMESTAMPTZ,

    -- Dates
    listing_date         DATE,
    closing_date         DATE,
    funded_date          DATE,

    -- Financials (latest)
    revenue_last_fy      NUMERIC(15,2),
    ebitda_last_fy       NUMERIC(15,2),
    revenue_growth_pct   NUMERIC(6,2),
    debt_equity_ratio    NUMERIC(6,2),

    -- Display
    short_description    TEXT,
    long_description     TEXT,
    tag                  TEXT,
    tag_color            TEXT,
    logo_url             TEXT,
    banner_url           TEXT,

    -- Audit
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at           TIMESTAMPTZ
);

CREATE INDEX idx_smes_status    ON smes(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_smes_sector    ON smes(sector);
CREATE INDEX idx_smes_score     ON smes(fairefund_score DESC) WHERE status='active';
CREATE INDEX idx_smes_search    ON smes USING gin(legal_name gin_trgm_ops);
CREATE INDEX idx_smes_closing   ON smes(closing_date) WHERE status='active';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. LEDGER  (double-entry, immutable, the financial source of truth)
-- ═══════════════════════════════════════════════════════════════════════════

-- Every account holds a balance. Balance = SUM(credits) - SUM(debits)
CREATE TABLE accounts (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID         REFERENCES users(id),
    sme_id       UUID         REFERENCES smes(id),
    account_type account_type NOT NULL,
    currency     CHAR(3)      NOT NULL DEFAULT 'INR',
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, account_type),
    UNIQUE (sme_id, account_type)
);

-- Every financial event creates a Transaction + 2 Entries (double-entry)
CREATE TABLE transactions (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_no    TEXT        UNIQUE NOT NULL,  -- e.g. 'TXN-2024-000001'
    txn_type        txn_type    NOT NULL,

    -- Parties
    investor_id     UUID        REFERENCES users(id),
    sme_id          UUID        REFERENCES smes(id),
    investment_id   UUID,       -- FK set after investments table created

    -- Amount
    amount          NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    currency        CHAR(3)       NOT NULL DEFAULT 'INR',
    platform_fee    NUMERIC(15,2) NOT NULL DEFAULT 0,

    -- External payment
    payment_gateway TEXT,
    payment_ref     TEXT,
    escrow_ref      TEXT,

    -- Status & metadata
    status          TEXT        NOT NULL DEFAULT 'pending',
    description     TEXT,
    metadata        JSONB,

    -- Immutability guard
    finalized_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT no_update CHECK (finalized_at IS NULL OR txn_type = txn_type) -- triggers enforce immutability
);
CREATE INDEX idx_txn_investor  ON transactions(investor_id);
CREATE INDEX idx_txn_sme       ON transactions(sme_id);
CREATE INDEX idx_txn_type      ON transactions(txn_type, status);
CREATE INDEX idx_txn_ref       ON transactions(reference_no);
CREATE INDEX idx_txn_date      ON transactions(created_at DESC);

-- Sequence for human-readable reference numbers
CREATE SEQUENCE txn_seq START 1;

-- Ledger entries (double-entry: every txn has exactly 2 entries)
CREATE TABLE ledger_entries (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    txn_id         UUID        NOT NULL REFERENCES transactions(id),
    account_id     UUID        NOT NULL REFERENCES accounts(id),
    entry_type     entry_type  NOT NULL,
    amount         NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    balance_after  NUMERIC(15,2) NOT NULL,  -- running balance snapshot
    description    TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_le_txn     ON ledger_entries(txn_id);
CREATE INDEX idx_le_account ON ledger_entries(account_id, created_at DESC);

-- VIEW: account balances (always computed from ledger, never stored)
CREATE VIEW account_balances AS
SELECT
    a.id AS account_id,
    a.user_id,
    a.sme_id,
    a.account_type,
    a.currency,
    COALESCE(SUM(CASE WHEN le.entry_type='credit' THEN le.amount ELSE -le.amount END), 0) AS balance
FROM accounts a
LEFT JOIN ledger_entries le ON le.account_id = a.id
GROUP BY a.id, a.user_id, a.sme_id, a.account_type, a.currency;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. INVESTMENTS  (workflow: pending → esign → escrow → active)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE investments (
    id                UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    investor_id       UUID              NOT NULL REFERENCES users(id),
    sme_id            UUID              NOT NULL REFERENCES smes(id),

    -- Deal terms at time of investment (immutable snapshot)
    amount            NUMERIC(15,2)     NOT NULL CHECK (amount > 0),
    instrument        TEXT              NOT NULL DEFAULT 'equity',
    share_price       NUMERIC(15,4),
    shares_allotted   INTEGER,
    ownership_pct     NUMERIC(8,6),     -- e.g. 0.025000 = 2.5%
    valuation_at_invest NUMERIC(15,2),

    -- Status machine
    status            investment_status NOT NULL DEFAULT 'pending',
    kyc_verified      BOOLEAN           NOT NULL DEFAULT FALSE,
    esign_completed   BOOLEAN           NOT NULL DEFAULT FALSE,
    escrow_funded     BOOLEAN           NOT NULL DEFAULT FALSE,

    -- Important dates
    allotment_date    DATE,
    esign_date        TIMESTAMPTZ,
    escrow_date       TIMESTAMPTZ,
    exit_date         TIMESTAMPTZ,

    -- Returns
    current_value     NUMERIC(15,2),
    realized_return   NUMERIC(15,2),
    xirr              NUMERIC(6,4),     -- actual XIRR

    -- Document references
    subscription_doc_url TEXT,
    allotment_cert_url   TEXT,

    -- Ledger link
    txn_id            UUID REFERENCES transactions(id),

    -- Audit
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (investor_id, sme_id)
);
CREATE INDEX idx_inv_investor  ON investments(investor_id);
CREATE INDEX idx_inv_sme       ON investments(sme_id);
CREATE INDEX idx_inv_status    ON investments(status);

-- Back-fill FK on transactions
ALTER TABLE transactions ADD CONSTRAINT fk_txn_investment
    FOREIGN KEY (investment_id) REFERENCES investments(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. COMPLIANCE & DOCUMENTS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE compliance_tasks (
    id           UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    sme_id       UUID              NOT NULL REFERENCES smes(id) ON DELETE CASCADE,
    task_name    TEXT              NOT NULL,
    description  TEXT,
    due_date     DATE,
    status       compliance_status NOT NULL DEFAULT 'pending',
    assigned_to  UUID              REFERENCES users(id),
    completed_at TIMESTAMPTZ,
    notes        TEXT,
    is_mandatory BOOLEAN           NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_comp_sme    ON compliance_tasks(sme_id);
CREATE INDEX idx_comp_status ON compliance_tasks(status);

CREATE TABLE documents (
    id              UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
    sme_id          UUID      REFERENCES smes(id) ON DELETE CASCADE,
    investment_id   UUID      REFERENCES investments(id) ON DELETE SET NULL,
    uploaded_by     UUID      REFERENCES users(id),
    doc_type        doc_type  NOT NULL,
    name            TEXT      NOT NULL,
    s3_bucket       TEXT,
    s3_key          TEXT,
    signed_url_exp  TIMESTAMPTZ,  -- pre-signed URL expiry
    file_size_bytes BIGINT,
    mime_type       TEXT,
    requires_kyc    BOOLEAN   NOT NULL DEFAULT FALSE,
    is_verified     BOOLEAN   NOT NULL DEFAULT FALSE,
    verified_by     UUID      REFERENCES users(id),
    verified_at     TIMESTAMPTZ,
    checksum_sha256 TEXT,          -- integrity verification
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_docs_sme  ON documents(sme_id);
CREATE INDEX idx_docs_type ON documents(doc_type);

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. NOTIFICATIONS & AUDIT LOG
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE notifications (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        notif_type  NOT NULL DEFAULT 'info',
    title       TEXT        NOT NULL,
    message     TEXT        NOT NULL,
    action_url  TEXT,
    read        BOOLEAN     NOT NULL DEFAULT FALSE,
    read_at     TIMESTAMPTZ,
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notif_user   ON notifications(user_id, read, created_at DESC);
CREATE INDEX idx_notif_unread ON notifications(user_id) WHERE read = FALSE;

-- IMMUTABLE audit log — append only, never update/delete
CREATE TABLE audit_log (
    id          BIGSERIAL   PRIMARY KEY,
    user_id     UUID        REFERENCES users(id),
    action      TEXT        NOT NULL,
    entity_type TEXT        NOT NULL,
    entity_id   UUID,
    old_value   JSONB,
    new_value   JSONB,
    ip_address  INET,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_user   ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_time   ON audit_log(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. AI SCORING
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE ai_scores (
    id              UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
    sme_id          UUID      NOT NULL REFERENCES smes(id),
    model_version   TEXT      NOT NULL,
    overall_score   NUMERIC(5,2) NOT NULL,
    financial_score NUMERIC(5,2),
    execution_score NUMERIC(5,2),
    market_score    NUMERIC(5,2),
    compliance_score NUMERIC(5,2),
    risk_factors    JSONB,
    score_breakdown JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ai_score_sme ON ai_scores(sme_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. TRIGGERS (business rules enforced at DB level)
-- ═══════════════════════════════════════════════════════════════════════════

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION fn_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DO $$ DECLARE t TEXT;
BEGIN FOR t IN SELECT unnest(ARRAY['users','smes','investments'])
  LOOP EXECUTE format(
    'CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION fn_updated_at()',
    t, t);
  END LOOP;
END $$;

-- Maintain SME raised_so_far + investor_count from investments
CREATE OR REPLACE FUNCTION fn_sync_sme_totals()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF (TG_OP = 'INSERT' AND NEW.status IN ('active','allotted')) OR
       (TG_OP = 'UPDATE' AND OLD.status NOT IN ('active','allotted') AND NEW.status IN ('active','allotted')) THEN
        UPDATE smes
        SET raised_so_far = (SELECT COALESCE(SUM(amount),0) FROM investments WHERE sme_id=NEW.sme_id AND status IN ('active','allotted')),
            investor_count = (SELECT COUNT(*) FROM investments WHERE sme_id=NEW.sme_id AND status IN ('active','allotted'))
        WHERE id = NEW.sme_id;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_inv_sync AFTER INSERT OR UPDATE ON investments
    FOR EACH ROW EXECUTE FUNCTION fn_sync_sme_totals();

-- Enforce Section 42: max 200 investors per SME
CREATE OR REPLACE FUNCTION fn_check_investor_cap()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE cap INT;
BEGIN
    SELECT COALESCE(max_investors, 200) INTO cap FROM smes WHERE id = NEW.sme_id;
    IF (SELECT COUNT(*) FROM investments WHERE sme_id=NEW.sme_id AND status NOT IN ('cancelled','refunded')) >= cap THEN
        RAISE EXCEPTION 'Investor cap (%) reached for this offering. Companies Act Section 42.', cap;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_investor_cap BEFORE INSERT ON investments
    FOR EACH ROW EXECUTE FUNCTION fn_check_investor_cap();

-- Auto-generate transaction reference numbers
CREATE OR REPLACE FUNCTION fn_txn_ref()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.reference_no IS NULL OR NEW.reference_no = '' THEN
        NEW.reference_no = 'FF-TXN-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('txn_seq')::TEXT, 8, '0');
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_txn_ref BEFORE INSERT ON transactions
    FOR EACH ROW EXECUTE FUNCTION fn_txn_ref();

-- Prevent modification of finalized transactions (immutability)
CREATE OR REPLACE FUNCTION fn_immutable_txn()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.finalized_at IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot modify finalized transaction %', OLD.id;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_txn_immutable BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION fn_immutable_txn();

-- Enforce double-entry balance (debits = credits per transaction)
CREATE OR REPLACE FUNCTION fn_check_double_entry()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    net NUMERIC;
    entry_count INT;
BEGIN
    SELECT
        SUM(CASE WHEN entry_type='credit' THEN amount ELSE -amount END),
        COUNT(*)
    INTO net, entry_count
    FROM ledger_entries WHERE txn_id = NEW.txn_id;

    IF entry_count = 2 AND ABS(net) > 0.01 THEN
        RAISE EXCEPTION 'Double-entry violation: debits ≠ credits for txn %', NEW.txn_id;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER trg_double_entry AFTER INSERT ON ledger_entries
    FOR EACH ROW EXECUTE FUNCTION fn_check_double_entry();

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. USEFUL VIEWS
-- ═══════════════════════════════════════════════════════════════════════════

-- Investor portfolio summary
CREATE VIEW v_portfolio AS
SELECT
    u.id AS investor_id, u.name AS investor_name,
    COUNT(i.id)                                    AS total_investments,
    COALESCE(SUM(i.amount), 0)                     AS total_invested,
    COALESCE(SUM(i.current_value), 0)              AS current_value,
    COALESCE(SUM(i.current_value - i.amount), 0)   AS unrealized_gain,
    CASE WHEN SUM(i.amount) > 0
         THEN ROUND((SUM(i.current_value - i.amount) / SUM(i.amount)) * 100, 2)
         ELSE 0 END                                AS gain_pct,
    COUNT(CASE WHEN i.status='active' THEN 1 END)  AS active_count
FROM users u
LEFT JOIN investments i ON i.investor_id = u.id AND i.status IN ('active','allotted')
WHERE u.role = 'investor'
GROUP BY u.id, u.name;

-- SME deal progress
CREATE VIEW v_sme_progress AS
SELECT
    s.*,
    ROUND((s.raised_so_far / NULLIF(s.target_raise, 0)) * 100) AS progress_pct,
    GREATEST(0, s.closing_date - CURRENT_DATE)                  AS days_remaining,
    (SELECT COUNT(*) FROM compliance_tasks WHERE sme_id=s.id AND status='done')   AS compliance_done,
    (SELECT COUNT(*) FROM compliance_tasks WHERE sme_id=s.id)                     AS compliance_total,
    (SELECT ai.overall_score FROM ai_scores ai WHERE ai.sme_id=s.id ORDER BY ai.created_at DESC LIMIT 1) AS latest_ai_score
FROM smes s
WHERE s.deleted_at IS NULL;

-- Platform analytics
CREATE VIEW v_platform_stats AS
SELECT
    (SELECT COUNT(*) FROM smes   WHERE status='active')                    AS active_listings,
    (SELECT COUNT(DISTINCT investor_id) FROM investments WHERE status IN ('active','allotted')) AS total_investors,
    (SELECT COALESCE(SUM(raised_so_far),0) FROM smes WHERE status IN ('active','funded','closed')) AS total_raised,
    (SELECT COALESCE(AVG((expected_return_min+expected_return_max)/2.0),0) FROM smes WHERE status='active') AS avg_return,
    (SELECT COUNT(*) FROM users  WHERE role='investor' AND kyc_status='verified') AS verified_investors,
    (SELECT COUNT(*) FROM users  WHERE created_at > NOW()-INTERVAL '30 days')     AS new_users_30d;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. SEED DATA
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO users (id,name,email,phone,password_hash,role,kyc_status,pan,is_accredited) VALUES
  ('a1000000-0000-0000-0000-000000000001','Prashant Kumar','prashant@fairefund.in','9876543210',
   '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBP.N.pE4WJiYi','investor','verified','ABCPK1234D',true),
  ('a1000000-0000-0000-0000-000000000002','Riya Mehta','riya@agritech.in','9845001234',
   '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBP.N.pE4WJiYi','sme_admin','verified','XYZRM5678F',false),
  ('a1000000-0000-0000-0000-000000000003','Admin User','admin@fairefund.in','9000000001',
   '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBP.N.pE4WJiYi','admin','verified','ADMNU9999Z',false),
  ('a1000000-0000-0000-0000-000000000004','Compliance Officer','compliance@fairefund.in','9000000002',
   '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBP.N.pE4WJiYi','compliance_officer','verified','COMPZ1234X',false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO smes (id,created_by,legal_name,cin,sector,location_city,location_state,short_description,long_description,founded_year,team_size,stage,instrument,target_raise,raised_so_far,valuation_pre,min_investment,expected_return_min,expected_return_max,tenure_months,revenue_last_fy,investor_count,fairefund_score,risk_level,tag,tag_color,status,closing_date) VALUES
  ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000002','AgriTech Solutions Pvt Ltd','U01000MH2021PTC12345','AgriTech','Pune','Maharashtra','B2B platform connecting 12,000+ farmers with FPOs and bulk buyers.','Growing 3x YoY. Platform handles ₹18Cr GMV across 12,000 farmers and 200+ FPOs in Maharashtra and Karnataka.',2021,18,'Series A','equity',4500000,3060000,32000000,50000,18,22,24,1800000,24,82,'medium','Hot Deal','#C9A84C','active','2025-03-31'),
  ('b1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000002','MedSupply Chain Ltd','U74900TG2020PLC34567','HealthTech','Hyderabad','Telangana','Last-mile medical logistics for Tier 2/3 cities.','400+ hospitals onboarded. 98% SLA. Cold-chain enabled for vaccines and biologics.',2020,34,'Seed+','equity',8000000,3440000,55000000,100000,20,25,36,3200000,17,76,'medium','New','#2D7A4F','active','2025-04-30'),
  ('b1000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000002','EduCraft Technologies','U80300KA2022PTC56789','EdTech','Bengaluru','Karnataka','Vernacular skill-training SaaS for MSMEs.','60,000+ learners across 200+ corporate clients. NPS of 72. Expanding to 5 new states.',2022,22,'Pre-Series A','equity',3000000,2730000,21000000,25000,15,18,18,950000,38,89,'low','Closing Soon','#C0392B','active','2025-02-28'),
  ('b1000000-0000-0000-0000-000000000004','a1000000-0000-0000-0000-000000000002','GreenPack Industries','U25200GJ2019PLC78901','CleanTech','Ahmedabad','Gujarat','Biodegradable packaging for 80+ FMCG clients.','Export-ready for EU/US. BIS certified. 3 patents filed. 40% gross margins.',2019,67,'Series A','equity',12000000,6600000,80000000,200000,22,28,48,5400000,12,78,'medium','ESG Rated','#059669','active','2025-05-31'),
  ('b1000000-0000-0000-0000-000000000005','a1000000-0000-0000-0000-000000000002','LogiRoute Pvt Ltd','U63090MH2023PTC90123','Logistics','Mumbai','Maharashtra','AI-powered hyperlocal delivery for D2C brands.','500+ merchants. 99.2% on-time. ML-based route optimization cuts cost by 23%.',2023,11,'Seed+','equity',6000000,1740000,40000000,75000,17,21,30,420000,9,71,'high','Verified','#0B1D3A','active','2025-06-30'),
  ('b1000000-0000-0000-0000-000000000006','a1000000-0000-0000-0000-000000000002','ColdStar Storage Ltd','U01110MH2018PLC12367','Food & Agri','Nashik','Maharashtra','Cold chain infrastructure for fruits & vegetables.','3 facilities, 8,000 MT capacity. APEDA certified. Serving 400+ farmers.',2018,142,'Series B','equity',25000000,18500000,140000000,500000,24,30,60,12100000,31,91,'low','Top Pick','#C9A84C','active','2025-07-31')
ON CONFLICT (id) DO NOTHING;

-- Seed accounts for investor
INSERT INTO accounts (user_id, account_type) VALUES
  ('a1000000-0000-0000-0000-000000000001','investor_wallet')
ON CONFLICT DO NOTHING;

-- Seed accounts for each SME's escrow
INSERT INTO accounts (sme_id, account_type)
SELECT id, 'sme_escrow' FROM smes ON CONFLICT DO NOTHING;

-- Seed investments with proper status
INSERT INTO investments (id,investor_id,sme_id,amount,instrument,shares_allotted,share_price,ownership_pct,valuation_at_invest,status,kyc_verified,esign_completed,escrow_funded,allotment_date,current_value)
VALUES
  ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001',200000,'equity',40,100,0.000625,32000000,'active',true,true,true,'2024-10-01',241000),
  ('c1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000003',100000,'equity',100,100,0.000476,21000000,'active',true,true,true,'2024-10-01',117000),
  ('c1000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000004',500000,'equity',25,100,0.000625,80000000,'active',true,true,true,'2024-10-01',568000)
ON CONFLICT (id) DO NOTHING;

-- Seed compliance tasks per SME
INSERT INTO compliance_tasks (sme_id, task_name, is_mandatory, status)
SELECT s.id, t.task, t.mandatory, t.status::compliance_status
FROM smes s CROSS JOIN (VALUES
  ('PAS-4 Information Memorandum Filed', true, 'done'),
  ('Registered Valuer Report Submitted', true, 'done'),
  ('Board Resolution for Private Placement', true, 'done'),
  ('KYC Completion — All Investors', true, 'pending'),
  ('PAS-3 Filing (Post Allotment Return)', true, 'pending'),
  ('ROC Form Filing — Allotment', true, 'pending'),
  ('Share Certificate Issuance', true, 'pending'),
  ('Statutory Register Update', false, 'pending')
) AS t(task, mandatory, status)
WHERE NOT EXISTS (SELECT 1 FROM compliance_tasks WHERE sme_id=s.id LIMIT 1);

-- Seed notifications
INSERT INTO notifications (user_id, type, title, message) VALUES
  ('a1000000-0000-0000-0000-000000000001','success','Investment Allotted','Your ₹2L investment in AgriTech Solutions has been allotted. Shares credited to your account.'),
  ('a1000000-0000-0000-0000-000000000001','warning','Deal Closing Soon','EduCraft Technologies closes in 18 days. You are 91% funded.'),
  ('a1000000-0000-0000-0000-000000000001','info','KYC Verified','Your PAN and Aadhaar KYC has been successfully verified.')
ON CONFLICT DO NOTHING;

COMMIT;

-- ── Withdrawals tracking ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS withdrawals (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    investor_id   UUID NOT NULL REFERENCES users(id),
    amount        NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    status        TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','PROCESSING','SETTLED','FAILED')),
    gateway_ref   TEXT,
    bank_account  TEXT,
    failure_reason TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    settled_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_investor ON withdrawals(investor_id, status);

-- ── Payment gateway columns on investments (may already exist) ────────────────
ALTER TABLE investments ADD COLUMN IF NOT EXISTS payment_gateway_order_id   TEXT;
ALTER TABLE investments ADD COLUMN IF NOT EXISTS payment_gateway_payment_id TEXT;
