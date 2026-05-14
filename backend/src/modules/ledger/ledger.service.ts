import {
  Injectable, Logger, ConflictException, NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../../database/database.service';
import {
  AccountType, EntryType, TransactionType, TransactionStatus,
  LedgerTransactionPayload, LedgerEntry,
} from './ledger.types';

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(private readonly db: DatabaseService) {}

  // ═══════════════════════════════════════════════════════════════
  // ACCOUNT MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  /** Ensure an account exists, return its id */
  async ensureAccount(client: PoolClient, userId: string, type: AccountType): Promise<string> {
    const existing = await client.query(
      'SELECT id FROM accounts WHERE user_id=$1 AND account_type=$2',
      [userId, type],
    );
    if (existing.rows[0]) return existing.rows[0].id;

    const id = uuidv4();
    await client.query(
      'INSERT INTO accounts (id, user_id, account_type, currency) VALUES ($1,$2,$3,$4)',
      [id, userId, type, 'INR'],
    );
    return id;
  }

  /** Ensure MSME escrow account exists */
  async ensureSmeAccount(client: PoolClient, smeId: string, type: AccountType): Promise<string> {
    const existing = await client.query(
      'SELECT id FROM accounts WHERE sme_id=$1 AND account_type=$2',
      [smeId, type],
    );
    if (existing.rows[0]) return existing.rows[0].id;

    const id = uuidv4();
    await client.query(
      'INSERT INTO accounts (id, sme_id, account_type, currency) VALUES ($1,$2,$3,$4)',
      [id, smeId, type, 'INR'],
    );
    return id;
  }

  /** Get live balance by summing ledger entries (no stored balance) */
  async getBalance(userId: string, accountType: AccountType): Promise<number> {
    const { rows } = await this.db.query<{ balance: string }>(
      `SELECT COALESCE(
         SUM(CASE WHEN le.entry_type='CREDIT' THEN le.amount ELSE -le.amount END), 0
       ) AS balance
       FROM accounts a
       LEFT JOIN ledger_entries le ON le.account_id = a.id
       WHERE a.user_id=$1 AND a.account_type=$2`,
      [userId, accountType],
    );
    return parseFloat(rows[0]?.balance ?? '0');
  }

  /** Get all balances for a user */
  async getAllBalances(userId: string): Promise<Record<AccountType, number>> {
    const { rows } = await this.db.query(
      `SELECT a.account_type,
         COALESCE(SUM(CASE WHEN le.entry_type='CREDIT' THEN le.amount ELSE -le.amount END), 0) AS balance
       FROM accounts a
       LEFT JOIN ledger_entries le ON le.account_id = a.id
       WHERE a.user_id=$1
       GROUP BY a.account_type`,
      [userId],
    );
    const result: Partial<Record<AccountType, number>> = {};
    for (const row of rows) result[row.account_type as AccountType] = parseFloat(row.balance);
    return result as Record<AccountType, number>;
  }

  // ═══════════════════════════════════════════════════════════════
  // CORE LEDGER ENGINE — Atomic, Idempotent
  // ═══════════════════════════════════════════════════════════════

  /**
   * Execute a ledger transaction atomically.
   * Enforces:
   *   1. Idempotency (reference_id uniqueness)
   *   2. Double-entry balance (debits == credits)
   *   3. Sufficient funds check before any debit
   *   4. Full rollback on any failure
   */
  async executeTransaction(payload: LedgerTransactionPayload): Promise<string> {
    return this.db.withTransaction(async (client) => {
      // ── 1. Idempotency guard ──────────────────────────────────
      const existing = await client.query(
        'SELECT id, status FROM transactions WHERE reference_id=$1',
        [payload.reference_id],
      );
      if (existing.rows[0]) {
        const row = existing.rows[0];
        if (row.status === TransactionStatus.SUCCESS) {
          this.logger.warn(`Duplicate txn prevented: ${payload.reference_id}`);
          return row.id;
        }
        if (row.status === TransactionStatus.PROCESSING) {
          throw new ConflictException(`Transaction ${payload.reference_id} is already processing`);
        }
      }

      // ── 2. Create transaction record ──────────────────────────
      const txnId = uuidv4();
      await client.query(
        `INSERT INTO transactions
           (id, reference_id, txn_type, investor_id, sme_id, investment_id,
            amount, platform_fee, status, description, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          txnId, payload.reference_id, payload.type,
          payload.investor_id ?? null, payload.sme_id ?? null, payload.investment_id ?? null,
          payload.amount, payload.metadata?.platform_fee ?? 0,
          TransactionStatus.PROCESSING, payload.description,
          JSON.stringify(payload.metadata ?? {}),
        ],
      );

      // ── 3. Validate double-entry balance ──────────────────────
      const totalDebits  = payload.entries.filter(e => e.entry_type === EntryType.DEBIT ).reduce((s, e) => s + e.amount, 0);
      const totalCredits = payload.entries.filter(e => e.entry_type === EntryType.CREDIT).reduce((s, e) => s + e.amount, 0);
      if (Math.abs(totalDebits - totalCredits) > 0.01) {
        throw new InternalServerErrorException(
          `Double-entry violation: debits(${totalDebits}) ≠ credits(${totalCredits})`
        );
      }

      // ── 4. Check sufficient funds for each debit account ─────
      for (const entry of payload.entries.filter(e => e.entry_type === EntryType.DEBIT)) {
        const balRes = await client.query<{ balance: string }>(
          `SELECT COALESCE(SUM(CASE WHEN entry_type='CREDIT' THEN amount ELSE -amount END), 0) AS balance
           FROM ledger_entries WHERE account_id=$1`,
          [entry.account_id],
        );
        const balance = parseFloat(balRes.rows[0]?.balance ?? '0');
        if (balance < entry.amount) {
          throw new ConflictException(
            `Insufficient funds in account ${entry.account_id}: ` +
            `available=${balance.toFixed(2)}, required=${entry.amount.toFixed(2)}`
          );
        }
      }

      // ── 5. Write ledger entries ───────────────────────────────
      for (const entry of payload.entries) {
        // Compute running balance after this entry
        const prevBal = await client.query<{ balance: string }>(
          `SELECT COALESCE(SUM(CASE WHEN entry_type='CREDIT' THEN amount ELSE -amount END), 0) AS balance
           FROM ledger_entries WHERE account_id=$1`,
          [entry.account_id],
        );
        const prev          = parseFloat(prevBal.rows[0]?.balance ?? '0');
        const balance_after = entry.entry_type === EntryType.CREDIT
          ? prev + entry.amount
          : prev - entry.amount;

        await client.query(
          `INSERT INTO ledger_entries
             (id, txn_id, account_id, entry_type, amount, balance_after, description)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [uuidv4(), txnId, entry.account_id, entry.entry_type,
           entry.amount, balance_after, entry.description],
        );
      }

      // ── 6. Mark transaction SUCCESS ───────────────────────────
      await client.query(
        'UPDATE transactions SET status=$1, finalized_at=NOW() WHERE id=$2',
        [TransactionStatus.SUCCESS, txnId],
      );

      // ── 7. Audit log ──────────────────────────────────────────
      await client.query(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, new_value)
         VALUES ($1,$2,'transaction',$3,$4)`,
        [
          payload.investor_id ?? payload.sme_id,
          `LEDGER_${payload.type}`,
          txnId,
          JSON.stringify({ amount: payload.amount, type: payload.type }),
        ],
      );

      this.logger.log(`✅ Txn ${txnId} [${payload.type}] ₹${payload.amount} — ref: ${payload.reference_id}`);
      return txnId;
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // HIGH-LEVEL LEDGER OPERATIONS
  // ═══════════════════════════════════════════════════════════════

  /**
   * STEP 4: Record funds received from payment gateway
   * Escrow → Investor AVAILABLE
   */
  async recordDeposit(
    client: PoolClient,
    investorId: string,
    amount: number,
    paymentRef: string,
  ): Promise<{ txnId: string; availableAcctId: string }> {
    const escrowAcctId    = await this.ensureAccount(client, investorId, AccountType.ESCROW_GATEWAY);
    const availableAcctId = await this.ensureAccount(client, investorId, AccountType.INVESTOR_AVAILABLE);

    const txnId = await this.executeTransaction({
      type:        TransactionType.DEPOSIT,
      reference_id: `DEP-${paymentRef}`,
      investor_id:  investorId,
      amount,
      description: `Payment received via Razorpay: ${paymentRef}`,
      metadata:    { payment_ref: paymentRef },
      entries: [
        { txn_id: '', account_id: escrowAcctId,    entry_type: EntryType.DEBIT,  amount, description: 'Razorpay inbound debit' },
        { txn_id: '', account_id: availableAcctId, entry_type: EntryType.CREDIT, amount, description: 'Investor available credit' },
      ],
    });

    return { txnId, availableAcctId };
  }

  /**
   * STEP 5: Lock funds — AVAILABLE → LOCKED
   */
  async lockFunds(
    client: PoolClient,
    investorId: string,
    amount: number,
    investmentRef: string,
  ): Promise<string> {
    const availableAcctId = await this.ensureAccount(client, investorId, AccountType.INVESTOR_AVAILABLE);
    const lockedAcctId    = await this.ensureAccount(client, investorId, AccountType.INVESTOR_LOCKED);

    return this.executeTransaction({
      type:         TransactionType.INVESTMENT,
      reference_id: `LOCK-${investmentRef}`,
      investor_id:  investorId,
      amount,
      description:  `Funds locked for investment ${investmentRef}`,
      entries: [
        { txn_id: '', account_id: availableAcctId, entry_type: EntryType.DEBIT,  amount, description: 'Lock: available debit' },
        { txn_id: '', account_id: lockedAcctId,    entry_type: EntryType.CREDIT, amount, description: 'Lock: locked credit' },
      ],
    });
  }

  /**
   * STEP 7+8: Settle investment — LOCKED → MSME (minus fee → PLATFORM)
   */
  async settleInvestment(
    client: PoolClient,
    investorId: string,
    smeId: string,
    investmentId: string,
    grossAmount: number,
    feePct: number = 0.02,
  ): Promise<string> {
    const fee        = parseFloat((grossAmount * feePct).toFixed(2));
    const netAmount  = parseFloat((grossAmount - fee).toFixed(2));

    const lockedAcctId   = await this.ensureAccount(client, investorId, AccountType.INVESTOR_LOCKED);
    const investedAcctId = await this.ensureAccount(client, investorId, AccountType.INVESTOR_INVESTED);
    const msmeAcctId     = await this.ensureSmeAccount(client, smeId, AccountType.MSME_WALLET);
    const feeAcctId      = await this.ensureAccount(client, 'platform', AccountType.PLATFORM_FEES);

    return this.executeTransaction({
      type:         TransactionType.INVESTMENT_SETTLE,
      reference_id: `SETTLE-${investmentId}`,
      investor_id:  investorId,
      sme_id:       smeId,
      investment_id: investmentId,
      amount:       grossAmount,
      description:  `Investment settlement: ₹${grossAmount} (fee: ₹${fee})`,
      metadata:     { platform_fee: fee, net_to_msme: netAmount },
      entries: [
        // Debit locked (full amount)
        { txn_id: '', account_id: lockedAcctId,   entry_type: EntryType.DEBIT,  amount: grossAmount, description: 'Settlement: unlock' },
        // Credit investor INVESTED (full amount — tracks their stake)
        { txn_id: '', account_id: investedAcctId, entry_type: EntryType.CREDIT, amount: grossAmount, description: 'Settlement: invested credit' },
        // Credit MSME net amount
        { txn_id: '', account_id: msmeAcctId,     entry_type: EntryType.CREDIT, amount: netAmount,   description: 'MSME receipt' },
        // Debit MSME for fee, credit platform
        { txn_id: '', account_id: msmeAcctId,     entry_type: EntryType.DEBIT,  amount: fee,         description: 'Platform fee debit' },
        { txn_id: '', account_id: feeAcctId,      entry_type: EntryType.CREDIT, amount: fee,         description: 'Platform fee revenue' },
      ],
    });
  }

  /**
   * SCENARIO 1: REFUND — LOCKED → AVAILABLE (MSME rejected / expired)
   */
  async refundLockedFunds(
    client: PoolClient,
    investorId: string,
    investmentId: string,
    amount: number,
    reason: string,
  ): Promise<string> {
    const lockedAcctId    = await this.ensureAccount(client, investorId, AccountType.INVESTOR_LOCKED);
    const availableAcctId = await this.ensureAccount(client, investorId, AccountType.INVESTOR_AVAILABLE);

    return this.executeTransaction({
      type:         TransactionType.REFUND,
      reference_id: `REFUND-${investmentId}`,
      investor_id:  investorId,
      investment_id: investmentId,
      amount,
      description:  `Refund: ${reason}`,
      metadata:     { reason },
      entries: [
        { txn_id: '', account_id: lockedAcctId,    entry_type: EntryType.DEBIT,  amount, description: 'Refund: locked debit' },
        { txn_id: '', account_id: availableAcctId, entry_type: EntryType.CREDIT, amount, description: 'Refund: available credit' },
      ],
    });
  }

  /**
   * SCENARIO 2: WITHDRAWAL — AVAILABLE → PENDING
   */
  async initiateWithdrawal(
    investorId: string,
    amount: number,
    withdrawalId: string,
  ): Promise<string> {
    return this.db.withTransaction(async (client) => {
      const availableAcctId = await this.ensureAccount(client, investorId, AccountType.INVESTOR_AVAILABLE);
      const pendingAcctId   = await this.ensureAccount(client, investorId, AccountType.WITHDRAWAL_PENDING);

      return this.executeTransaction({
        type:         TransactionType.WITHDRAWAL_INIT,
        reference_id: `WDRAW-INIT-${withdrawalId}`,
        investor_id:  investorId,
        amount,
        description:  'Withdrawal initiated — pending bank payout',
        entries: [
          { txn_id: '', account_id: availableAcctId, entry_type: EntryType.DEBIT,  amount, description: 'Withdrawal: available debit' },
          { txn_id: '', account_id: pendingAcctId,   entry_type: EntryType.CREDIT, amount, description: 'Withdrawal: pending credit' },
        ],
      });
    });
  }

  /**
   * SCENARIO 2: WITHDRAWAL SUCCESS — PENDING → BANK
   */
  async settleWithdrawal(investorId: string, amount: number, withdrawalId: string): Promise<string> {
    return this.db.withTransaction(async (client) => {
      const pendingAcctId    = await this.ensureAccount(client, investorId, AccountType.WITHDRAWAL_PENDING);
      const bankSettleAcctId = await this.ensureAccount(client, investorId, AccountType.BANK_SETTLEMENT);

      return this.executeTransaction({
        type:         TransactionType.WITHDRAWAL_SETTLE,
        reference_id: `WDRAW-SETTLE-${withdrawalId}`,
        investor_id:  investorId,
        amount,
        description:  'Withdrawal settled to bank account',
        entries: [
          { txn_id: '', account_id: pendingAcctId,    entry_type: EntryType.DEBIT,  amount, description: 'Settle: pending debit' },
          { txn_id: '', account_id: bankSettleAcctId, entry_type: EntryType.CREDIT, amount, description: 'Settle: bank credit' },
        ],
      });
    });
  }

  /**
   * SCENARIO 2: WITHDRAWAL FAILURE — PENDING → AVAILABLE (rollback)
   */
  async rollbackWithdrawal(investorId: string, amount: number, withdrawalId: string): Promise<string> {
    return this.db.withTransaction(async (client) => {
      const pendingAcctId   = await this.ensureAccount(client, investorId, AccountType.WITHDRAWAL_PENDING);
      const availableAcctId = await this.ensureAccount(client, investorId, AccountType.INVESTOR_AVAILABLE);

      return this.executeTransaction({
        type:         TransactionType.WITHDRAWAL_FAIL,
        reference_id: `WDRAW-FAIL-${withdrawalId}`,
        investor_id:  investorId,
        amount,
        description:  'Withdrawal failed — funds returned to available',
        entries: [
          { txn_id: '', account_id: pendingAcctId,   entry_type: EntryType.DEBIT,  amount, description: 'Fail: pending debit' },
          { txn_id: '', account_id: availableAcctId, entry_type: EntryType.CREDIT, amount, description: 'Fail: available credit' },
        ],
      });
    });
  }

  /**
   * SCENARIO 3A: REVERSAL — MSME funds returned to investors
   */
  async reverseInvestment(
    investorId: string,
    smeId: string,
    investmentId: string,
    recoveredAmount: number,
    originalAmount: number,
    reason: string,
  ): Promise<string> {
    const type = recoveredAmount >= originalAmount
      ? TransactionType.REVERSAL
      : TransactionType.PARTIAL_RECOVERY;

    return this.db.withTransaction(async (client) => {
      const msmeAcctId      = await this.ensureSmeAccount(client, smeId, AccountType.MSME_WALLET);
      const investedAcctId  = await this.ensureAccount(client, investorId, AccountType.INVESTOR_INVESTED);
      const availableAcctId = await this.ensureAccount(client, investorId, AccountType.INVESTOR_AVAILABLE);

      return this.executeTransaction({
        type,
        reference_id: `REV-${investmentId}`,
        investor_id:  investorId,
        sme_id:       smeId,
        investment_id: investmentId,
        amount:       recoveredAmount,
        description:  `${type}: ${reason} — recovered ₹${recoveredAmount} of ₹${originalAmount}`,
        metadata:     { original_amount: originalAmount, recovered: recoveredAmount, reason },
        entries: [
          { txn_id: '', account_id: msmeAcctId,      entry_type: EntryType.DEBIT,  amount: recoveredAmount, description: 'Reversal: MSME debit' },
          { txn_id: '', account_id: investedAcctId,  entry_type: EntryType.DEBIT,  amount: recoveredAmount, description: 'Reversal: invested debit' },
          { txn_id: '', account_id: availableAcctId, entry_type: EntryType.CREDIT, amount: recoveredAmount, description: 'Reversal: available credit' },
        ],
      });
    });
  }

  /** Get ledger history for an account */
  async getLedgerHistory(userId: string, accountType?: AccountType, limit = 50) {
    let q = `
      SELECT le.*, a.account_type, t.txn_type, t.description AS txn_desc, t.status
      FROM ledger_entries le
      JOIN accounts a ON le.account_id = a.id
      JOIN transactions t ON le.txn_id = t.id
      WHERE a.user_id=$1
    `;
    const params: any[] = [userId];
    if (accountType) { q += ` AND a.account_type=$2`; params.push(accountType); }
    q += ` ORDER BY le.created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    return this.db.queryMany(q, params);
  }
}
