import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService }       from '@nestjs/config';
import { createHmac }          from 'crypto';
import { v4 as uuidv4 }        from 'uuid';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Razorpay = require('razorpay');
import { DatabaseService }     from '../../database/database.service';
import { LedgerService }       from '../ledger/ledger.service';
import { InvestmentsService }  from '../investments/investments.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly razorpay: any;
  private readonly keyId:     string;
  private readonly keySecret: string;
  private readonly webhookSecret: string;
  private readonly isLive: boolean;

  constructor(
    private readonly config:      ConfigService,
    private readonly db:          DatabaseService,
    private readonly ledger:      LedgerService,
    private readonly investments: InvestmentsService,
  ) {
    this.keyId         = config.get('RAZORPAY_KEY_ID', 'rzp_test_placeholder');
    this.keySecret     = config.get('RAZORPAY_KEY_SECRET', 'placeholder_secret');
    this.webhookSecret = config.get('RAZORPAY_WEBHOOK_SECRET', 'webhook_secret');
    this.isLive        = this.keyId.startsWith('rzp_live_');

    this.razorpay = new Razorpay({
      key_id:     this.keyId,
      key_secret: this.keySecret,
    });
    this.logger.log(`Razorpay initialized [${this.isLive ? 'LIVE' : 'TEST'}]`);
  }

  // ── Create Razorpay order (calls real SDK) ─────────────────────────────────
  async createOrder(investorId: string, investmentId: string) {
    const { order_id, amount_paise, currency } =
      await this.investments.createPaymentOrder(investorId, investmentId);

    let razorpayOrderId = order_id;

    // Call real Razorpay API if credentials are set
    if (this.keyId !== 'rzp_test_placeholder') {
      try {
        const rzpOrder = await this.razorpay.orders.create({
          amount:   amount_paise,
          currency,
          receipt:  order_id,
          notes:    { investment_id: investmentId, investor_id: investorId },
        });
        razorpayOrderId = rzpOrder.id;
        // Update investment with real Razorpay order ID
        await this.db.query(
          'UPDATE investments SET payment_gateway_order_id=$1 WHERE id=$2',
          [razorpayOrderId, investmentId],
        );
        this.logger.log(`Razorpay order created: ${razorpayOrderId}`);
      } catch (err) {
        this.logger.error(`Razorpay order failed: ${err.message}`);
        throw new BadRequestException(`Payment order creation failed: ${err.message}`);
      }
    }

    // Fetch investor contact info for pre-fill
    const investor = await this.db.queryOne<any>(
      'SELECT name, email, phone FROM users WHERE id=$1', [investorId]
    );

    return {
      order_id:     razorpayOrderId,
      amount_paise,
      currency,
      key_id:       this.keyId,
      prefill: {
        name:    investor?.name  ?? '',
        email:   investor?.email ?? '',
        contact: investor?.phone ?? '',
      },
      notes: { investment_id: investmentId },
      theme: { color: '#C9A84C' },
    };
  }

  // ── Verify payment signature (HMAC-SHA256) ─────────────────────────────────
  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    if (!orderId || !paymentId || !signature) return false;
    const expected = createHmac('sha256', this.keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    return expected === signature;
  }

  verifyWebhookSignature(rawBody: string, sig: string): boolean {
    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    return expected === sig;
  }

  // ── Confirm payment (after Razorpay checkout completes) ───────────────────
  async confirmPayment(investorId: string, orderId: string, paymentId: string, signature: string) {
    if (this.keyId !== 'rzp_test_placeholder' || process.env.NODE_ENV === 'production') {
      if (!this.verifyPaymentSignature(orderId, paymentId, signature)) {
        this.logger.warn(`Signature invalid: pay=${paymentId} inv=${investorId}`);
        await this.db.query(
          `INSERT INTO audit_log (user_id,action,entity_type,entity_id,new_value)
           VALUES ($1,'INVALID_PAYMENT_SIGNATURE','payment',$2,$3)`,
          [investorId, paymentId, JSON.stringify({ order_id: orderId })],
        );
        throw new UnauthorizedException('Payment signature verification failed');
      }
    }
    return this.investments.handlePaymentWebhook(paymentId, orderId, 'success');
  }

  // ── Webhook handler ────────────────────────────────────────────────────────
  async handleWebhook(rawBody: string, signature: string, event: any) {
    if (process.env.NODE_ENV === 'production') {
      if (!this.verifyWebhookSignature(rawBody, signature)) {
        throw new UnauthorizedException('Webhook signature invalid');
      }
    }
    const { event: eventType, payload } = event;
    this.logger.log(`Webhook: ${eventType}`);

    switch (eventType) {
      case 'payment.captured': {
        const p = payload.payment.entity;
        return this.investments.handlePaymentWebhook(p.id, p.order_id, 'success');
      }
      case 'payment.failed': {
        const p = payload.payment.entity;
        return this.investments.handlePaymentWebhook(p.id, p.order_id, 'failed');
      }
      case 'payout.processed':
        return this.settleWithdrawalPayout(payload.payout.entity.id, payload.payout.entity.reference_id);
      case 'payout.reversed':
        return this.rollbackWithdrawalPayout(payload.payout.entity.id, payload.payout.entity.reference_id);
      default:
        return { ok: true, handled: false };
    }
  }

  // ── Initiate withdrawal payout via Razorpay Payouts API ───────────────────
  async initiateWithdrawalPayout(withdrawalId: string, amount: number, bankAccount: {
    account_number: string; ifsc: string; name: string;
  }) {
    let gatewayRef = `payout_${uuidv4().replace(/-/g,'').slice(0,16)}`;

    if (this.keyId !== 'rzp_test_placeholder') {
      try {
        // Real Razorpay Payouts API call
        const payout = await (this.razorpay as any).payouts.create({
          account_number: this.config.get('RAZORPAY_ACCOUNT_NUMBER'),
          fund_account: {
            account_type: 'bank_account',
            bank_account: { name: bankAccount.name, ifsc: bankAccount.ifsc, account_number: bankAccount.account_number },
            contact: { name: bankAccount.name, type: 'vendor' },
          },
          amount:   Math.round(amount * 100), // paise
          currency: 'INR',
          mode:     'IMPS',
          purpose:  'payout',
          queue_if_low_balance: true,
          reference_id: withdrawalId,
        });
        gatewayRef = payout.id;
      } catch (err) {
        this.logger.error(`Payout failed: ${err.message}`);
        throw new BadRequestException(`Payout failed: ${err.message}`);
      }
    }

    await this.db.query(
      `UPDATE withdrawals SET status='PROCESSING', gateway_ref=$1 WHERE id=$2`,
      [gatewayRef, withdrawalId],
    );
    this.logger.log(`Payout initiated: ${gatewayRef} for withdrawal ${withdrawalId}`);
    return { payout_id: gatewayRef, status: 'PROCESSING' };
  }

  private async settleWithdrawalPayout(payoutId: string, withdrawalId: string) {
    const w = await this.db.queryOne<any>(
      'SELECT * FROM withdrawals WHERE id=$1 OR gateway_ref=$2', [withdrawalId, payoutId]
    );
    if (!w) return { ok: false };
    await this.ledger.settleWithdrawal(w.investor_id, parseFloat(w.amount), w.id);
    await this.db.query(
      `UPDATE withdrawals SET status='SETTLED', settled_at=NOW() WHERE id=$1`, [w.id]
    );
    return { ok: true };
  }

  private async rollbackWithdrawalPayout(payoutId: string, withdrawalId: string) {
    const w = await this.db.queryOne<any>(
      'SELECT * FROM withdrawals WHERE id=$1 OR gateway_ref=$2', [withdrawalId, payoutId]
    );
    if (!w) return { ok: false };
    await this.ledger.rollbackWithdrawal(w.investor_id, parseFloat(w.amount), w.id);
    await this.db.query(
      `UPDATE withdrawals SET status='FAILED', failure_reason='Payout reversed by gateway' WHERE id=$1`,
      [w.id],
    );
    return { ok: true };
  }
}
