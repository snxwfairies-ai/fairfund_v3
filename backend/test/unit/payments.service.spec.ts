jest.mock('razorpay', () => {
  return jest.fn().mockImplementation(() => ({
    orders: { create: jest.fn() },
    payouts: { create: jest.fn() },
  }));
});

import { Test, TestingModule }  from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService }          from '@nestjs/config';
import { createHmac }             from 'crypto';
import { PaymentsService }        from '../../src/modules/payments/payments.service';
import { DatabaseService }        from '../../src/database/database.service';
import { LedgerService }          from '../../src/modules/ledger/ledger.service';
import { InvestmentsService }     from '../../src/modules/investments/investments.service';

describe('PaymentsService', () => {
  let service: PaymentsService;
  const KEY_SECRET = 'test-razorpay-secret';
  const WEBHOOK_SECRET = 'test-webhook-secret';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, def: string) => {
              const map: Record<string,string> = {
                RAZORPAY_KEY_ID:        'rzp_test_id',
                RAZORPAY_KEY_SECRET:     KEY_SECRET,
                RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
              };
              return map[key] ?? def;
            },
          },
        },
        { provide: DatabaseService,     useValue: { query: jest.fn(), queryOne: jest.fn() } },
        { provide: LedgerService,       useValue: { settleWithdrawal: jest.fn(), rollbackWithdrawal: jest.fn() } },
        { provide: InvestmentsService,  useValue: { createPaymentOrder: jest.fn(), handlePaymentWebhook: jest.fn() } },
      ],
    }).compile();
    service = module.get<PaymentsService>(PaymentsService);
  });

  // ── Signature Verification ────────────────────────────────────────────────
  describe('verifyPaymentSignature', () => {
    it('returns true for valid HMAC-SHA256 signature', () => {
      const orderId   = 'order_12345';
      const paymentId = 'pay_67890';
      const sig = createHmac('sha256', KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      expect(service.verifyPaymentSignature(orderId, paymentId, sig)).toBe(true);
    });

    it('returns false for tampered signature', () => {
      expect(service.verifyPaymentSignature('order_1', 'pay_1', 'bad_sig')).toBe(false);
    });

    it('returns false for empty inputs', () => {
      expect(service.verifyPaymentSignature('', '', '')).toBe(false);
    });

    it('returns false when only order_id changes', () => {
      const validSig = createHmac('sha256', KEY_SECRET).update('order_1|pay_1').digest('hex');
      // Attacker tries different order_id
      expect(service.verifyPaymentSignature('order_2', 'pay_1', validSig)).toBe(false);
    });
  });

  // ── Webhook Signature ─────────────────────────────────────────────────────
  describe('verifyWebhookSignature', () => {
    it('validates correct webhook signature', () => {
      const body = JSON.stringify({ event: 'payment.captured' });
      const sig  = createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
      expect(service.verifyWebhookSignature(body, sig)).toBe(true);
    });

    it('rejects modified webhook body', () => {
      const body    = JSON.stringify({ event: 'payment.captured', amount: 1000 });
      const sig     = createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
      const modBody = JSON.stringify({ event: 'payment.captured', amount: 999999 }); // tampered!
      expect(service.verifyWebhookSignature(modBody, sig)).toBe(false);
    });
  });

  // ── confirmPayment ─────────────────────────────────────────────────────────
  describe('confirmPayment', () => {
    it('throws UnauthorizedException for invalid signature', async () => {
      await expect(
        service.confirmPayment('user-1', 'order_1', 'pay_1', 'invalid-signature')
      ).rejects.toThrow(UnauthorizedException);
    });

    it('proceeds to investment webhook handler with valid signature', async () => {
      const orderId   = 'order_abc';
      const paymentId = 'pay_xyz';
      const validSig  = createHmac('sha256', KEY_SECRET)
        .update(`${orderId}|${paymentId}`).digest('hex');

      const mockInvestments = service['investments'] as any;
      mockInvestments.handlePaymentWebhook.mockResolvedValue({ ok: true, investment_id: 'inv-1' });

      const result = await service.confirmPayment('user-1', orderId, paymentId, validSig);
      expect(result.ok).toBe(true);
      expect(mockInvestments.handlePaymentWebhook).toHaveBeenCalledWith(paymentId, orderId, 'success');
    });
  });

  // ── Webhook event routing ─────────────────────────────────────────────────
  describe('handleWebhook', () => {
    it('routes payment.captured to investments service', async () => {
      const mockInvestments = service['investments'] as any;
      mockInvestments.handlePaymentWebhook.mockResolvedValue({ ok: true });

      const event = {
        event:   'payment.captured',
        payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1', notes: {} } } },
      };
      await service.handleWebhook('{}', 'sig', event);
      expect(mockInvestments.handlePaymentWebhook).toHaveBeenCalledWith('pay_1', 'order_1', 'success');
    });

    it('routes payment.failed correctly', async () => {
      const mockInvestments = service['investments'] as any;
      mockInvestments.handlePaymentWebhook.mockResolvedValue({ ok: false });

      const event = {
        event:   'payment.failed',
        payload: { payment: { entity: { id: 'pay_fail', order_id: 'order_fail' } } },
      };
      await service.handleWebhook('{}', 'sig', event);
      expect(mockInvestments.handlePaymentWebhook).toHaveBeenCalledWith('pay_fail', 'order_fail', 'failed');
    });

    it('handles unknown events gracefully', async () => {
      const event = { event: 'unknown.event', payload: {} };
      const result = await service.handleWebhook('{}', 'sig', event);
      expect(result).toEqual({ ok: true, handled: false });
    });
  });
});
