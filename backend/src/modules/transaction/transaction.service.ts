import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 }       from 'uuid';
import { DatabaseService }     from '../../database/database.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAYS_MS = [30_000, 300_000, 1_800_000]; // 30s, 5m, 30m

  constructor(
    private readonly db:            DatabaseService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Register a failed transaction for retry ────────────────────────────────
  async scheduleRetry(
    investmentId: string,
    paymentRef: string,
    retryType: 'webhook_replay' | 'ledger_repair' | 'refund_retry',
    errorMessage: string,
  ) {
    const existing = await this.db.queryOne<any>(
      `SELECT * FROM transaction_retries
       WHERE investment_id=$1 AND retry_type=$2 AND status NOT IN ('success','abandoned')`,
      [investmentId, retryType],
    );

    if (existing) {
      if (existing.attempt_number >= this.MAX_RETRIES) {
        await this.db.query(
          `UPDATE transaction_retries SET status='abandoned', resolved_at=NOW() WHERE id=$1`,
          [existing.id],
        );
        this.logger.error(`Retry abandoned after ${this.MAX_RETRIES} attempts: ${investmentId}`);

        // Notify admin of stuck transaction
        const admins = await this.db.queryMany<any>(
          `SELECT id FROM users WHERE role IN ('admin','super_admin') AND is_active=TRUE LIMIT 1`
        );
        for (const admin of admins) {
          await this.notifications.send(admin.id, 'error', '🚨 Stuck Transaction',
            `Investment ${investmentId} failed after ${this.MAX_RETRIES} retry attempts. Manual intervention required.`
          );
        }
        return { status: 'abandoned' };
      }

      const nextAttempt = existing.attempt_number + 1;
      const delay       = this.RETRY_DELAYS_MS[nextAttempt - 1] ?? 3_600_000;
      const nextRetryAt = new Date(Date.now() + delay);

      await this.db.query(
        `UPDATE transaction_retries
         SET attempt_number=$1, next_retry_at=$2, status='pending', error_message=$3
         WHERE id=$4`,
        [nextAttempt, nextRetryAt, errorMessage, existing.id],
      );
      this.logger.warn(`Retry #${nextAttempt} scheduled for ${investmentId} at ${nextRetryAt.toISOString()}`);
      return { status: 'scheduled', attempt: nextAttempt, next_retry_at: nextRetryAt };
    }

    // First failure — schedule initial retry
    const retryId = uuidv4();
    const nextRetryAt = new Date(Date.now() + this.RETRY_DELAYS_MS[0]);
    await this.db.query(
      `INSERT INTO transaction_retries
         (id,investment_id,payment_ref,retry_type,attempt_number,status,error_message,next_retry_at)
       VALUES ($1,$2,$3,$4,1,'pending',$5,$6)`,
      [retryId, investmentId, paymentRef, retryType, errorMessage, nextRetryAt],
    );
    this.logger.warn(`Retry scheduled: ${retryType} for ${investmentId}`);
    return { status: 'scheduled', attempt: 1, next_retry_at: nextRetryAt };
  }

  // ── Reconciliation: find and fix ledger inconsistencies ──────────────────
  async reconcile() {
    const report = {
      stuck_investments:    0,
      orphaned_ledger:      0,
      imbalanced_accounts:  0,
      recovered:            0,
      requires_manual:      [] as string[],
    };

    // 1. Find investments stuck in PAYMENT_PENDING > 24 hours
    const stuckPayments = await this.db.queryMany<any>(
      `SELECT i.id, i.amount, i.investor_id, i.payment_gateway_order_id
       FROM investments i
       WHERE i.status='PAYMENT_PENDING'
         AND i.created_at < NOW() - INTERVAL '24 hours'`
    );
    report.stuck_investments = stuckPayments.length;

    for (const inv of stuckPayments) {
      // In prod: query Razorpay API to check actual payment status
      // For now: schedule for manual review
      report.requires_manual.push(`Investment ${inv.id}: stuck in PAYMENT_PENDING`);
      await this.scheduleRetry(inv.id, inv.payment_gateway_order_id, 'webhook_replay',
        'Stuck in PAYMENT_PENDING > 24h');
    }

    // 2. Check for double-entry violations (debits ≠ credits per transaction)
    const imbalanced = await this.db.queryMany<any>(
      `SELECT txn_id,
         SUM(CASE WHEN entry_type='DEBIT'  THEN amount ELSE 0 END) AS total_debits,
         SUM(CASE WHEN entry_type='CREDIT' THEN amount ELSE 0 END) AS total_credits
       FROM ledger_entries
       GROUP BY txn_id
       HAVING ABS(SUM(CASE WHEN entry_type='DEBIT' THEN amount ELSE 0 END) -
                  SUM(CASE WHEN entry_type='CREDIT' THEN amount ELSE 0 END)) > 0.01`
    );
    report.imbalanced_accounts = imbalanced.length;
    imbalanced.forEach(i => report.requires_manual.push(
      `Ledger imbalance: txn=${i.txn_id} debits=${i.total_debits} credits=${i.total_credits}`
    ));

    // 3. Find FUNDS_LOCKED investments with no ledger entries
    const orphaned = await this.db.queryMany<any>(
      `SELECT i.id FROM investments i
       WHERE i.status='FUNDS_LOCKED'
         AND NOT EXISTS (
           SELECT 1 FROM transactions t WHERE t.investment_id=i.id AND t.status='SUCCESS'
         )`
    );
    report.orphaned_ledger = orphaned.length;
    orphaned.forEach(i => report.requires_manual.push(`Orphaned FUNDS_LOCKED: investment=${i.id}`));

    // Log reconciliation run
    await this.db.query(
      `INSERT INTO audit_log (action,entity_type,entity_id,new_value)
       VALUES ('RECONCILIATION_RUN','system','system',$1)`,
      [JSON.stringify(report)],
    );

    this.logger.log(`Reconciliation: ${JSON.stringify(report)}`);
    return report;
  }

  // ── Get pending retries (for admin / background job) ──────────────────────
  async getPendingRetries() {
    return this.db.queryMany(
      `SELECT tr.*, i.status AS investment_status, i.amount
       FROM transaction_retries tr JOIN investments i ON i.id=tr.investment_id
       WHERE tr.status IN ('pending','failed') AND tr.next_retry_at <= NOW()
       ORDER BY tr.next_retry_at ASC`
    );
  }

  // ── Mark retry as successful ──────────────────────────────────────────────
  async markRetryResolved(retryId: string) {
    await this.db.query(
      `UPDATE transaction_retries SET status='success', resolved_at=NOW() WHERE id=$1`,
      [retryId]
    );
  }
}
