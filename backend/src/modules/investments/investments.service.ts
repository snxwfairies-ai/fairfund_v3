import {
  Injectable, Logger, ForbiddenException, BadRequestException,
  ConflictException, NotFoundException,
} from '@nestjs/common';
import { v4 as uuidv4 }    from 'uuid';
import { DatabaseService }  from '../../database/database.service';
import { LedgerService }    from '../ledger/ledger.service';
import { AccountType, PLATFORM_FEE_PCT } from '../ledger/ledger.types';
import { NotificationsService } from '../notifications/notifications.service';
import { AgentService }          from '../agent/agent.service';

export enum InvestmentStatus {
  INITIATED       = 'INITIATED',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  FUNDS_LOCKED    = 'FUNDS_LOCKED',
  ALLOTTED        = 'ALLOTTED',
  REFUNDED        = 'REFUNDED',
  REVERSED        = 'REVERSED',
  DEFAULTED       = 'DEFAULTED',
}

@Injectable()
export class InvestmentsService {
  private readonly logger = new Logger(InvestmentsService.name);

  constructor(
    private readonly db:            DatabaseService,
    private readonly ledger:        LedgerService,
    private readonly notifications: NotificationsService,
    private readonly agent: AgentService,
  ) {}

  // ── STEP 0-1: Pre-checks + Initiate ──────────────────────────────────────
  async initiate(investorId: string, kycStatus: string, smeId: string, amount: number) {
    if (kycStatus !== 'verified')
      throw new ForbiddenException('KYC must be verified before investing');

    return this.db.withTransaction(async (client) => {
      const sme = (await client.query(
        `SELECT * FROM smes WHERE id=$1 AND status='active' FOR UPDATE`, [smeId]
      )).rows[0];
      if (!sme) throw new NotFoundException('SME listing not found or not active');
      if (amount < parseFloat(sme.min_investment))
        throw new BadRequestException(`Minimum investment: ₹${parseFloat(sme.min_investment).toLocaleString('en-IN')}`);

      const investorCount = parseInt((await client.query(
        `SELECT COUNT(*) AS c FROM investments WHERE sme_id=$1 AND status NOT IN ('REFUNDED','DEFAULTED','REVERSED')`,
        [smeId]
      )).rows[0].c);
      if (investorCount >= (sme.max_investors ?? 200))
        throw new ConflictException('Investor cap reached (Companies Act §42 — max 200)');

      const remaining = parseFloat(sme.target_raise) - parseFloat(sme.raised_so_far);
      if (amount > remaining + 0.01)
        throw new BadRequestException(`Only ₹${remaining.toLocaleString('en-IN')} remaining in this round`);

      const duplicate = (await client.query(
        `SELECT id FROM investments WHERE investor_id=$1 AND sme_id=$2 AND status NOT IN ('REFUNDED','REVERSED','DEFAULTED')`,
        [investorId, smeId]
      )).rows[0];
      if (duplicate) throw new ConflictException('You already have an active investment in this SME');

      const invId = uuidv4();
      await client.query(
        `INSERT INTO investments (id,investor_id,sme_id,amount,instrument,valuation_at_invest,status)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [invId, investorId, smeId, amount, sme.instrument, sme.valuation_pre, InvestmentStatus.INITIATED]
      );
      await client.query(
        `INSERT INTO audit_log (user_id,action,entity_type,entity_id,new_value) VALUES ($1,$2,$3,$4,$5)`,
        [investorId, 'INVESTMENT_INITIATED', 'investment', invId, JSON.stringify({ amount, sme_id: smeId })]
      );
      return { investment_id: invId, amount, sme_name: sme.legal_name };
    });
  }

  // ── STEP 2: Create payment order ────────────────────────────────────────
  async createPaymentOrder(investorId: string, investmentId: string) {
    const inv = await this.db.queryOne<any>(
      `SELECT * FROM investments WHERE id=$1 AND investor_id=$2 AND status=$3`,
      [investmentId, investorId, InvestmentStatus.INITIATED]
    );
    if (!inv) throw new NotFoundException('Investment not found or already processed');

    const orderId = `order_${uuidv4().replace(/-/g,'').slice(0,16)}`;
    await this.db.query(
      `UPDATE investments SET status=$1, payment_gateway_order_id=$2, updated_at=NOW() WHERE id=$3`,
      [InvestmentStatus.PAYMENT_PENDING, orderId, investmentId]
    );
    return { order_id: orderId, amount_paise: Math.round(parseFloat(inv.amount)*100), currency: 'INR', investment_id: investmentId };
  }

  // ── STEP 3-5: Payment webhook — idempotent ──────────────────────────────
  async handlePaymentWebhook(paymentId: string, orderId: string, status: 'success'|'failed') {
    const alreadyProcessed = await this.db.queryOne(`SELECT id FROM transactions WHERE reference_id=$1`, [`DEP-${paymentId}`]);
    if (alreadyProcessed) { this.logger.warn(`Duplicate webhook skipped: ${paymentId}`); return { ok: true, duplicate: true }; }

    const inv = await this.db.queryOne<any>(
      `SELECT i.*, s.legal_name FROM investments i JOIN smes s ON i.sme_id=s.id WHERE i.payment_gateway_order_id=$1`, [orderId]
    );
    if (!inv) throw new NotFoundException(`No investment for order: ${orderId}`);

    if (status === 'failed') {
      await this.db.query(`UPDATE investments SET status='PAYMENT_FAILED', updated_at=NOW() WHERE id=$1`, [inv.id]);
      await this.notifications.send(inv.investor_id,'error','Payment Failed',`Payment of ₹${parseFloat(inv.amount).toLocaleString('en-IN')} failed.`);
      return { ok: false };
    }

    return this.db.withTransaction(async (client) => {
      const amount = parseFloat(inv.amount);
      await this.ledger.recordDeposit(client, inv.investor_id, amount, paymentId);
      await this.ledger.lockFunds(client, inv.investor_id, amount, inv.id);
      await client.query(
        `UPDATE investments SET status=$1, payment_gateway_payment_id=$2, kyc_verified=TRUE, updated_at=NOW() WHERE id=$3`,
        [InvestmentStatus.FUNDS_LOCKED, paymentId, inv.id]
      );
      await this.notifications.send(inv.investor_id,'success','Payment Confirmed',
        `₹${amount.toLocaleString('en-IN')} reserved for ${inv.legal_name}. Awaiting allotment.`);
      this.logger.log(`Payment confirmed: ${inv.id} ₹${amount}`);
      return { ok: true, investment_id: inv.id };
    });
  }

  // ── STEP 7-8: Admin settles allotment ───────────────────────────────────
  async settleAllotment(investmentId: string, adminId: string) {
    const inv = await this.db.queryOne<any>(
      `SELECT i.*, s.legal_name, s.valuation_pre FROM investments i JOIN smes s ON i.sme_id=s.id WHERE i.id=$1 AND i.status=$2`,
      [investmentId, InvestmentStatus.FUNDS_LOCKED]
    );
    if (!inv) throw new NotFoundException('Investment not in FUNDS_LOCKED state');
    const gross     = parseFloat(inv.amount);
    const fee       = parseFloat((gross * PLATFORM_FEE_PCT).toFixed(2));
    const netToMsme = gross - fee;

    return this.db.withTransaction(async (client) => {
      await this.ledger.settleInvestment(client, inv.investor_id, inv.sme_id, investmentId, gross, PLATFORM_FEE_PCT);
      const sharePrice  = parseFloat(inv.valuation_pre) / 100_000 || 100;
      const shares      = Math.floor(gross / sharePrice);
      const ownershipPct = (shares * sharePrice) / parseFloat(inv.valuation_pre);
      await client.query(
        `UPDATE investments SET status=$1, shares_allotted=$2, share_price=$3, ownership_pct=$4,
         escrow_funded=TRUE, allotment_date=NOW(), updated_at=NOW() WHERE id=$5`,
        [InvestmentStatus.ALLOTTED, shares, sharePrice, ownershipPct, investmentId]
      );
      await client.query(
        `UPDATE smes SET raised_so_far=raised_so_far+$1, investor_count=investor_count+1, updated_at=NOW() WHERE id=$2`,
        [gross, inv.sme_id]
      );
      await client.query(
        `INSERT INTO audit_log (user_id,action,entity_type,entity_id,new_value) VALUES ($1,$2,$3,$4,$5)`,
        [adminId,'ALLOTMENT_SETTLED','investment',investmentId, JSON.stringify({netToMsme,fee,shares})]
      );
      // ── Commission hook: record agent commission on settlement ────────────
      await this.agent.recordCommission(inv.investor_id, investmentId, gross)
        .catch(e => this.logger.warn(`Commission record failed: ${e.message}`));

      await this.notifications.send(inv.investor_id,'success','Allotment Confirmed 🎉',
        `${shares} shares in ${inv.legal_name} allotted. Net to MSME: ₹${netToMsme.toLocaleString('en-IN')}.`);
      return { investment_id: investmentId, shares, net_to_msme: netToMsme, fee };
    });
  }

  // ── Scenario 1: REFUND ──────────────────────────────────────────────────
  async refund(investmentId: string, reason: string, adminId: string) {
    const inv = await this.db.queryOne<any>(
      `SELECT * FROM investments WHERE id=$1 AND status='FUNDS_LOCKED'`, [investmentId]
    );
    if (!inv) throw new NotFoundException('Investment cannot be refunded in current state');
    return this.db.withTransaction(async (client) => {
      const amount = parseFloat(inv.amount);
      const alreadyRefunded = (await client.query(`SELECT id FROM transactions WHERE reference_id=$1`, [`REFUND-${investmentId}`])).rows[0];
      if (alreadyRefunded) return { ok: true, duplicate: true };
      await this.ledger.refundLockedFunds(client, inv.investor_id, investmentId, amount, reason);
      await client.query(`UPDATE investments SET status='REFUNDED', updated_at=NOW() WHERE id=$1`, [investmentId]);
      await client.query(
        `INSERT INTO audit_log (user_id,action,entity_type,entity_id,new_value) VALUES ($1,$2,$3,$4,$5)`,
        [adminId,'INVESTMENT_REFUNDED','investment',investmentId,JSON.stringify({amount,reason})]
      );
      await this.notifications.send(inv.investor_id,'info','Investment Refunded',
        `₹${amount.toLocaleString('en-IN')} returned to your available balance. Reason: ${reason}`);
      return { ok: true, refunded: amount };
    });
  }

  // ── Scenario 3: REVERSAL ────────────────────────────────────────────────
  async reverse(investmentId: string, recoveredAmount: number, reason: string, adminId: string) {
    const inv = await this.db.queryOne<any>(
      `SELECT * FROM investments WHERE id=$1 AND status='ALLOTTED'`, [investmentId]
    );
    if (!inv) throw new NotFoundException('Only ALLOTTED investments can be reversed');
    const original = parseFloat(inv.amount);
    return this.db.withTransaction(async (client) => {
      await this.ledger.reverseInvestment(inv.investor_id, inv.sme_id, investmentId, recoveredAmount, original, reason);
      const newStatus = recoveredAmount > 0 ? InvestmentStatus.REVERSED : InvestmentStatus.DEFAULTED;
      await client.query(`UPDATE investments SET status=$1, updated_at=NOW() WHERE id=$2`, [newStatus, investmentId]);
      await client.query(
        `INSERT INTO audit_log (user_id,action,entity_type,entity_id,new_value) VALUES ($1,$2,$3,$4,$5)`,
        [adminId,'INVESTMENT_REVERSED','investment',investmentId,JSON.stringify({original,recovered:recoveredAmount,reason})]
      );
      const loss = original - recoveredAmount;
      await this.notifications.send(inv.investor_id, loss > 0 ? 'error' : 'warning', 'Investment Reversed',
        `Recovered: ₹${recoveredAmount.toLocaleString('en-IN')} of ₹${original.toLocaleString('en-IN')}. Loss: ₹${loss.toLocaleString('en-IN')}.`);
      return { ok: true, recovered: recoveredAmount, loss, status: newStatus };
    });
  }

  // ── Scenario 2: Withdrawal ──────────────────────────────────────────────
  async initiateWithdrawal(investorId: string, amount: number) {
    const available = await this.ledger.getBalance(investorId, AccountType.INVESTOR_AVAILABLE);
    if (available < amount)
      throw new BadRequestException(`Insufficient balance: ₹${available.toFixed(2)} available, ₹${amount} requested`);
    const withdrawalId = uuidv4();
    await this.db.query(
      `INSERT INTO withdrawals (id,investor_id,amount,status) VALUES ($1,$2,$3,'PENDING')`,
      [withdrawalId, investorId, amount]
    );
    await this.ledger.initiateWithdrawal(investorId, amount, withdrawalId);
    return { withdrawal_id: withdrawalId, amount, status: 'PENDING' };
  }

  // Backward-compat: simple eSign/escrow status update
  async updateStatus(invId: string, investorId: string, action: 'esign' | 'escrow') {
    const inv = await this.db.queryOne<any>(
      'SELECT i.*, s.legal_name FROM investments i JOIN smes s ON i.sme_id=s.id WHERE i.id=\ AND i.investor_id=',
      [invId, investorId],
    );
    if (!inv) throw new NotFoundException('Investment not found');
    const update = action === 'esign'
      ? "esign_completed=TRUE, status='esign_done'"
      : "escrow_funded=TRUE, status='escrow_funded'";
    await this.db.query('UPDATE investments SET ' + update + ', updated_at=NOW() WHERE id=', [invId]);
    return { success: true };
  }
}
