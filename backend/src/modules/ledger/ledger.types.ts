// ═══════════════════════════════════════════════════════
//  LEDGER TYPES — The financial source of truth
//  Every money movement in FairFund passes through here
// ═══════════════════════════════════════════════════════

export enum AccountType {
  INVESTOR_AVAILABLE  = 'INVESTOR_AVAILABLE',   // Free funds, can invest or withdraw
  INVESTOR_LOCKED     = 'INVESTOR_LOCKED',       // Reserved for a pending investment
  INVESTOR_INVESTED   = 'INVESTOR_INVESTED',     // Allotted — money with MSME
  MSME_WALLET         = 'MSME_WALLET',           // MSME received funds
  PLATFORM_FEES       = 'PLATFORM_FEES',         // FaireFund revenue
  ESCROW_GATEWAY      = 'ESCROW_GATEWAY',        // Razorpay inbound
  WITHDRAWAL_PENDING  = 'WITHDRAWAL_PENDING',    // Queued for bank payout
  BANK_SETTLEMENT     = 'BANK_SETTLEMENT',       // Completed payout
}

export enum EntryType {
  DEBIT  = 'DEBIT',
  CREDIT = 'CREDIT',
}

export enum TransactionType {
  DEPOSIT          = 'DEPOSIT',          // Razorpay → platform
  INVESTMENT       = 'INVESTMENT',       // Lock funds for MSME
  INVESTMENT_SETTLE = 'INVESTMENT_SETTLE', // Release locked → MSME
  PLATFORM_FEE     = 'PLATFORM_FEE',    // MSME → platform
  REFUND           = 'REFUND',           // Locked → Available
  WITHDRAWAL_INIT  = 'WITHDRAWAL_INIT', // Available → Pending
  WITHDRAWAL_SETTLE = 'WITHDRAWAL_SETTLE', // Pending → Bank
  WITHDRAWAL_FAIL  = 'WITHDRAWAL_FAIL', // Pending → Available (rollback)
  REVERSAL         = 'REVERSAL',         // MSME → Investor (default case)
  PARTIAL_RECOVERY = 'PARTIAL_RECOVERY', // Partial reversal
}

export enum TransactionStatus {
  INITIATED  = 'INITIATED',
  PROCESSING = 'PROCESSING',
  SUCCESS    = 'SUCCESS',
  FAILED     = 'FAILED',
  REFUNDED   = 'REFUNDED',
  REVERSED   = 'REVERSED',
  DEFAULTED  = 'DEFAULTED',
}

// ─── State machine ─────────────────────────────────────
// INITIATED → PROCESSING → SUCCESS
//                       ↘ FAILED → (triggers rollback)
// SUCCESS → REFUNDED     (MSME rejected / expired)
// SUCCESS → REVERSED     (MSME default)
// SUCCESS → DEFAULTED    (unrecoverable)

export interface LedgerEntry {
  txn_id:      string;
  account_id:  string;
  entry_type:  EntryType;
  amount:      number;
  description: string;
}

export interface LedgerTransactionPayload {
  type:          TransactionType;
  reference_id:  string;          // idempotency key
  investor_id?:  string;
  sme_id?:       string;
  investment_id?: string;
  amount:        number;
  description:   string;
  metadata?:     Record<string, unknown>;
  entries:       LedgerEntry[];
}

export const PLATFORM_FEE_PCT = 0.02; // 2%
