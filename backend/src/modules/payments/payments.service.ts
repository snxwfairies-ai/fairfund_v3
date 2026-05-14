import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService }     from '@nestjs/config';
import { createHmac }        from 'crypto';
import { v4 as uuidv4 }      from 'uuid';
import { DatabaseService }   from '../../database/database.service';
import { LedgerService }     from '../ledger/ledger.service';
import { InvestmentsService } from '../investments/investments.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  // In production: import Razorpay SDK
  // private readonly razorpay: Razorpay;
  private readonly keyId:     string;
  private readonly keySecret: string;
  private readonly webhookSecret: string;

  constructor(
    private readonly config:      ConfigService,
    private readonly db:          DatabaseService,
    private readonly ledger:      LedgerService,
    private readonly investments: InvestmentsService,
  ) {
    this.keyId          = this.config.get('RAZORPAY_KEY_ID', 'rzp_test_placeholder');
    this.keySecret      = this.config.get('RAZORPAY_KEY_SECRET', 'placeholder_secret');
    this.webhookSecret  = this.config.get('RAZORPAY_WEBHOOK_SECRET', 'webhook_secret');

    // In production:
    // this.razorpay = new Razorpay({ key_id: this.keyId, key_secret: this.keySecret });
  }

  // ── STEP 2: Create Razorpay order ─────────────────────────────────────────
  async createOrder(investorId: string, investmentId: string) {
    // Delegates to InvestmentsService which handles state validation
    const { order_id, amount_paise, currency } =
      await this.investments.createPaymentOrder(investorId, investmentId);

    // In production: call Razorpay API
    // const razorpayOrder = await this.razorpay.orders.create({ amount: amount_paise, currency, receipt: order_id });

    this.logger.log(`Payment order created: ${order_id} for investment ${investmentId}`);

    return {
      order_id,
      amount_paise,
      currency,
      key_id: this.keyId,  // Sent to frontend for Razorpay SDK
      prefill: {           // Auto-fill in Razorpay checkout
        name:  'Investor',
        email: '',
        contact: '',
      },
    };
  }

  // ── STEP 3: Verify payment signature (CRITICAL security check) ─────────────
  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    if (!orderId || !paymentId || !signature) return false;

    // Razorpay signature = HMAC-SHA256(order_id + "|" + payment_id, key_secret)
    const expectedSig = createHmac('sha256', this.keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    return expectedSig === signature;
  }

  // ── Verify Razorpay webhook signature ────────────────────────────────────
  verifyWebhookSignature(rawBody: string, receivedSignature: string): boolean {
    const expected = createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');
    return expected === receivedSignature;
  }

  // ── Handle payment confirmation (from frontend after checkout) ────────────
  async confirmPayment(
    investorId: string,
    orderId: string,
    paymentId: string,
    signature: string,
  ) {
    // Verify signature before touching any data
    if (!this.verifyPaymentSignature(orderId, paymentId, signature)) {
      this.logger.warn(`Invalid payment signature: ${paymentId} investor:${investorId}`);
      await this.db.query(
        `INSERT INTO audit_log (user_id,action,entity_type,entity_id,new_value)
         VALUES ($1,'INVALID_PAYMENT_SIGNATURE','payment',$2,$3)`,
        [investorId, paymentId, JSON.stringify({ order_id: orderId })],
      );
      throw new UnauthorizedException('Payment signature verification failed');
    }

    // STEP 3-5: Let investment service handle ledger entries
    return this.investments.handlePaymentWebhook(paymentId, orderId, 'success');
  }

  // ── Razorpay webhook endpoint (server-side verification) ──────────────────
  async handleWebhook(rawBody: string, signature: string, event: any) {
    // Skip sig verification in test mode
    if (process.env.NODE_ENV === 'production') {
      if (!this.verifyWebhookSignature(rawBody, signature)) {
        throw new UnauthorizedException('Webhook signature invalid');
      }
    }

    const { event: eventType, payload } = event;
    this.logger.log(`Webhook received: ${eventType}`);

    switch (eventType) {
      case 'payment.captured':
        const payment  = payload.payment.entity;
        const notes    = payment.notes ?? {};
        const orderId  = payment.order_id;
        const payId    = payment.id;
        return this.investments.handlePaymentWebhook(payId, orderId, 'success');

      case 'payment.failed':
        const failedPayment = payload.payment.entity;
        return this.investments.handlePaymentWebhook(
          failedPayment.id, failedPayment.order_id, 'failed'
        );

      case 'payout.processed':
        // Handle withdrawal settlement
        const payout = payload.payout.entity;
        return this.settleWithdrawalPayout(payout.id, payout.reference_id);

      case 'payout.reversed':
        const reversedPayout = payload.payout.entity;
        return this.rollbackWithdrawalPayout(reversedPayout.id, reversedPayout.reference_id);

      default:
        this.logger.debug(`Unhandled webhook event: ${eventType}`);
        return { ok: true, handled: false };
    }
  }

  // ── Withdrawal payout via Razorpay ────────────────────────────────────────
  async initiateWithdrawalPayout(withdrawalId: string, amount: number, bankAccount: any) {
    // In production: call Razorpay Payouts API
    // const payout = await this.razorpay.payouts.create({ account_number, amount, currency: 'INR', mode: 'IMPS', ... });

    const gatewayRef = `payout_${uuidv4().replace(/-/g,'').slice(0,16)}`;
    await this.db.query(
      `UPDATE withdrawals SET status='PROCESSING', gateway_ref=$1 WHERE id=$2`,
      [gatewayRef, withdrawalId],
    );

    this.logger.log(`Payout initiated: ${gatewayRef} for withdrawal ${withdrawalId}`);
    return { payout_id: gatewayRef, status: 'PROCESSING' };
  }

  private async settleWithdrawalPayout(payoutId: string, withdrawalId: string) {
    const withdrawal = await this.db.queryOne<any>(
      `SELECT * FROM withdrawals WHERE id=$1 OR gateway_ref=$2`, [withdrawalId, payoutId]
    );
    if (!withdrawal) return { ok: false };

    await this.ledger.settleWithdrawal(withdrawal.investor_id, parseFloat(withdrawal.amount), withdrawal.id);
    await this.db.query(
      `UPDATE withdrawals SET status='SETTLED', settled_at=NOW() WHERE id=$1`, [withdrawal.id]
    );
    this.logger.log(`Withdrawal settled: ${withdrawal.id}`);
    return { ok: true };
  }

  private async rollbackWithdrawalPayout(payoutId: string, withdrawalId: string) {
    const withdrawal = await this.db.queryOne<any>(
      `SELECT * FROM withdrawals WHERE id=$1 OR gateway_ref=$2`, [withdrawalId, payoutId]
    );
    if (!withdrawal) return { ok: false };

    await this.ledger.rollbackWithdrawal(withdrawal.investor_id, parseFloat(withdrawal.amount), withdrawal.id);
    await this.db.query(
      `UPDATE withdrawals SET status='FAILED', failure_reason='Payout reversed by gateway' WHERE id=$1`,
      [withdrawal.id]
    );
    this.logger.warn(`Withdrawal rolled back: ${withdrawal.id}`);
    return { ok: true };
  }
}
