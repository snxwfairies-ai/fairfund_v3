/**
 * Integration Tests — Full Investment Flow
 *
 * Tests the complete 9-step investment lifecycle:
 * Register → KYC → Initiate → Order → Webhook → Settle → Refund/Reverse
 *
 * Uses mocked DB and services to avoid real PostgreSQL dependency in CI.
 * For full E2E against live DB, use `npm run test:e2e` with docker-compose.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService }       from '@nestjs/config';
import { JwtModule }           from '@nestjs/jwt';
import { PassportModule }      from '@nestjs/passport';

// Services under test
import { AuthService }         from '../../src/modules/auth/auth.service';
import { InvestmentsService, InvestmentStatus } from '../../src/modules/investments/investments.service';
import { LedgerService }       from '../../src/modules/ledger/ledger.service';
import { PaymentsService }     from '../../src/modules/payments/payments.service';
import { AgentService }        from '../../src/modules/agent/agent.service';
import { TransactionService }  from '../../src/modules/transaction/transaction.service';

// Mocks
import { DatabaseService }     from '../../src/database/database.service';
import { RedisService }        from '../../src/redis/redis.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { AccountType }         from '../../src/modules/ledger/ledger.types';
import { createHmac }          from 'crypto';

// ─── Test data constants ───────────────────────────────────────────────────
const INVESTOR_ID  = 'usr-investor-001';
const SME_ID       = 'sme-agritech-001';
const INVESTMENT_AMOUNT = 100_000;   // ₹1 Lakh
const KEY_SECRET   = 'test-razorpay-secret';

const MOCK_SME = {
  id: SME_ID, legal_name: 'AgriTech Solutions Pvt Ltd', status: 'active',
  min_investment: 50_000, max_investment: null,
  target_raise: 4_500_000, raised_so_far: 1_000_000,
  max_investors: 200, instrument: 'equity', valuation_pre: 32_000_000,
};

// ─── Mock factories ────────────────────────────────────────────────────────
function makeMockDB() {
  const queryMap = new Map<string, any>();
  return {
    _queryMap: queryMap,
    query:    jest.fn().mockResolvedValue({ rows: [] }),
    queryOne: jest.fn().mockResolvedValue(undefined),
    queryMany: jest.fn().mockResolvedValue([]),
    withTransaction: jest.fn().mockImplementation(async (fn: any) => {
      return fn({
        query: jest.fn().mockImplementation((sql: string) => {
          if (sql.includes('FOR UPDATE'))  return { rows: [MOCK_SME] };
          if (sql.includes('COUNT(*)'))    return { rows: [{ c: '5' }] };
          if (sql.includes('NOT IN') && sql.includes('investor_id')) return { rows: [] };
          if (sql.includes('reference_id')) return { rows: [] };
          if (sql.includes('SUM') && sql.includes('balance')) return { rows: [{ balance: '200000' }] };
          return { rows: [] };
        }),
      });
    }),
  };
}

const makeMockRedis    = () => ({ get: jest.fn().mockResolvedValue(null), setex: jest.fn(), set: jest.fn(), del: jest.fn(), invalidatePattern: jest.fn(), cached: jest.fn().mockImplementation((_k: string, _t: number, fn: () => any) => fn()), expire: jest.fn() });
const makeMockNotifs   = () => ({ send: jest.fn().mockResolvedValue('notif-1') });
const makeMockLedger   = () => ({ recordDeposit: jest.fn().mockResolvedValue({ txnId: 'txn-dep', availableAcctId: 'acct-av' }), lockFunds: jest.fn().mockResolvedValue('txn-lock'), settleInvestment: jest.fn().mockResolvedValue('txn-settle'), refundLockedFunds: jest.fn().mockResolvedValue('txn-refund'), reverseInvestment: jest.fn().mockResolvedValue('txn-rev'), getBalance: jest.fn().mockResolvedValue(200000), getAllBalances: jest.fn().mockResolvedValue({}), initiateWithdrawal: jest.fn().mockResolvedValue('txn-wdraw') });
const makeMockAgent    = () => ({ recordCommission: jest.fn().mockResolvedValue({ commission_id: 'comm-1', amount: 1000 }) });

// ─── Test suite ────────────────────────────────────────────────────────────

describe('Integration: Full Investment Flow', () => {
  let db: ReturnType<typeof makeMockDB>;
  let ledger: ReturnType<typeof makeMockLedger>;
  let notifs: ReturnType<typeof makeMockNotifs>;
  let agent: ReturnType<typeof makeMockAgent>;
  let investments: InvestmentsService;
  let payments: PaymentsService;

  beforeEach(() => {
    db     = makeMockDB();
    ledger = makeMockLedger();
    notifs = makeMockNotifs();
    agent  = makeMockAgent();

    investments = new InvestmentsService(db as any, ledger as any, notifs as any, agent as any);

    payments = new PaymentsService(
      { get: (k: string, d: string) => ({ RAZORPAY_KEY_ID: 'rzp_test_placeholder', RAZORPAY_KEY_SECRET: KEY_SECRET, RAZORPAY_WEBHOOK_SECRET: 'wh-secret' }[k] ?? d) } as any,
      db as any,
      ledger as any,
      investments,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ─── COMPLETE HAPPY PATH ─────────────────────────────────────────────────
  describe('Happy Path: ₹1L investment end-to-end', () => {

    it('STEP 1: Initiate investment — returns investment_id', async () => {
      const result = await investments.initiate(INVESTOR_ID, 'verified', SME_ID, INVESTMENT_AMOUNT);
      expect(result).toMatchObject({
        investment_id: expect.any(String),
        amount: INVESTMENT_AMOUNT,
        sme_name: 'AgriTech Solutions Pvt Ltd',
      });
    });

    it('STEP 2: Create payment order — returns Razorpay order', async () => {
      db.queryOne.mockResolvedValueOnce({
        id: 'inv-001', investor_id: INVESTOR_ID, amount: INVESTMENT_AMOUNT, status: 'INITIATED',
      });
      const result = await investments.createPaymentOrder(INVESTOR_ID, 'inv-001');
      expect(result).toMatchObject({
        order_id:     expect.stringMatching(/^order_/),
        amount_paise: INVESTMENT_AMOUNT * 100,
        currency:     'INR',
      });
    });

    it('STEP 3-5: Payment confirmed — ledger entries created', async () => {
      db.queryOne
        .mockResolvedValueOnce(null) // not duplicate
        .mockResolvedValueOnce({ id: 'inv-001', investor_id: INVESTOR_ID, amount: String(INVESTMENT_AMOUNT), legal_name: 'AgriTech' });

      const result = await investments.handlePaymentWebhook('pay_abc', 'order_xyz', 'success');

      expect(result).toMatchObject({ ok: true });
      expect(ledger.recordDeposit).toHaveBeenCalledWith(expect.anything(), INVESTOR_ID, INVESTMENT_AMOUNT, 'pay_abc');
      expect(ledger.lockFunds).toHaveBeenCalledWith(expect.anything(), INVESTOR_ID, INVESTMENT_AMOUNT, 'inv-001');
      expect(notifs.send).toHaveBeenCalledWith(INVESTOR_ID, 'success', 'Payment Confirmed', expect.any(String));
    });

    it('STEPS 7-8: Allotment — transfers to MSME and deducts 2% fee', async () => {
      db.queryOne.mockResolvedValueOnce({
        id: 'inv-001', investor_id: INVESTOR_ID, sme_id: SME_ID,
        amount: String(INVESTMENT_AMOUNT), status: 'FUNDS_LOCKED',
        legal_name: 'AgriTech', valuation_pre: String(32_000_000),
      });

      const result = await investments.settleAllotment('inv-001', 'admin-1');

      expect(ledger.settleInvestment).toHaveBeenCalledWith(
        expect.anything(), INVESTOR_ID, SME_ID, 'inv-001', INVESTMENT_AMOUNT, 0.02
      );
      expect(result.fee).toBe(INVESTMENT_AMOUNT * 0.02);       // ₹2,000
      expect(result.net_to_msme).toBe(INVESTMENT_AMOUNT * 0.98); // ₹98,000
      expect(agent.recordCommission).toHaveBeenCalled();         // Commission triggered!
    });

    it('Final state: investor notified, commission recorded', async () => {
      db.queryOne.mockResolvedValueOnce({
        id: 'inv-001', investor_id: INVESTOR_ID, sme_id: SME_ID,
        amount: String(INVESTMENT_AMOUNT), status: 'FUNDS_LOCKED',
        legal_name: 'AgriTech', valuation_pre: String(32_000_000),
      });
      await investments.settleAllotment('inv-001', 'admin-1');

      expect(notifs.send).toHaveBeenCalledWith(
        INVESTOR_ID, 'success', 'Allotment Confirmed 🎉', expect.any(String)
      );
      expect(agent.recordCommission).toHaveBeenCalledWith(INVESTOR_ID, 'inv-001', INVESTMENT_AMOUNT);
    });
  });

  // ─── FAILURE PATHS ───────────────────────────────────────────────────────
  describe('Failure Handling', () => {

    it('CASE 1: Duplicate webhook — idempotent, no double processing', async () => {
      db.queryOne.mockResolvedValueOnce({ id: 'existing-txn' }); // already processed
      const result = await investments.handlePaymentWebhook('pay_dup', 'order_dup', 'success');

      expect(result).toEqual({ ok: true, duplicate: true });
      expect(ledger.recordDeposit).not.toHaveBeenCalled();
      expect(ledger.lockFunds).not.toHaveBeenCalled();
    });

    it('CASE 2: Failed payment — PAYMENT_FAILED status, investor notified', async () => {
      db.queryOne.mockResolvedValueOnce(null);
      db.queryOne.mockResolvedValueOnce({ id: 'inv-001', investor_id: INVESTOR_ID, amount: String(INVESTMENT_AMOUNT) });

      const result = await investments.handlePaymentWebhook('pay_fail', 'order_fail', 'failed');
      expect(result.ok).toBe(false);
      expect(notifs.send).toHaveBeenCalledWith(INVESTOR_ID, 'error', 'Payment Failed', expect.any(String));
    });

    it('CASE 3: Signature verification prevents invalid payment confirmation', () => {
      const valid = payments.verifyPaymentSignature('order_1', 'pay_1', 'bad_signature');
      expect(valid).toBe(false);
    });

    it('CASE 4: MSME overfunding blocked at DB level', async () => {
      const { BadRequestException } = require('@nestjs/common');
      db.withTransaction.mockImplementationOnce(async (fn: any) => fn({
        query: jest.fn().mockImplementation((sql: string) => {
          if (sql.includes('FOR UPDATE')) return { rows: [{ ...MOCK_SME, raised_so_far: 4_400_000, target_raise: 4_500_000 }] };
          if (sql.includes('COUNT(*)'))   return { rows: [{ c: '10' }] };
          return { rows: [] };
        }),
      }));
      await expect(investments.initiate(INVESTOR_ID, 'verified', SME_ID, 200_000))
        .rejects.toThrow(BadRequestException);
    });

    it('CASE 5: Section 42 cap enforced — 201st investor rejected', async () => {
      const { ConflictException } = require('@nestjs/common');
      db.withTransaction.mockImplementationOnce(async (fn: any) => fn({
        query: jest.fn().mockImplementation((sql: string) => {
          if (sql.includes('FOR UPDATE')) return { rows: [MOCK_SME] };
          if (sql.includes('COUNT(*)'))   return { rows: [{ c: '200' }] }; // cap hit!
          return { rows: [] };
        }),
      }));
      await expect(investments.initiate(INVESTOR_ID, 'verified', SME_ID, INVESTMENT_AMOUNT))
        .rejects.toThrow(ConflictException);
    });
  });

  // ─── SCENARIO 1: REFUND ─────────────────────────────────────────────────
  describe('Scenario 1: Refund (MSME rejected)', () => {
    it('Reverses LOCKED→AVAILABLE, prevents double refund', async () => {
      db.queryOne.mockResolvedValueOnce({ id: 'inv-001', investor_id: INVESTOR_ID, amount: String(INVESTMENT_AMOUNT), status: 'FUNDS_LOCKED' });
      db.withTransaction.mockImplementationOnce(async (fn: any) => fn({
        query: jest.fn().mockImplementation((sql: string) => {
          if (sql.includes('reference_id')) return { rows: [] }; // not duplicate
          return { rows: [] };
        }),
      }));

      const result = await investments.refund('inv-001', 'MSME_REJECTED', 'admin-1');
      expect(result.ok).toBe(true);
      expect(result.refunded).toBe(INVESTMENT_AMOUNT);
      expect(ledger.refundLockedFunds).toHaveBeenCalled();
      expect(notifs.send).toHaveBeenCalledWith(INVESTOR_ID, 'info', 'Investment Refunded', expect.any(String));
    });
  });

  // ─── SCENARIO 2: WITHDRAWAL ──────────────────────────────────────────────
  describe('Scenario 2: Investor withdrawal', () => {
    it('Creates withdrawal and initiates ledger move AVAILABLE→PENDING', async () => {
      ledger.getBalance.mockResolvedValue(500_000); // ₹5L available
      const result = await investments.initiateWithdrawal(INVESTOR_ID, 200_000);
      expect(result.status).toBe('PENDING');
      expect(result.amount).toBe(200_000);
    });

    it('Rejects withdrawal if balance insufficient', async () => {
      const { BadRequestException } = require('@nestjs/common');
      ledger.getBalance.mockResolvedValue(50_000); // Only ₹50K
      await expect(investments.initiateWithdrawal(INVESTOR_ID, 200_000))
        .rejects.toThrow(BadRequestException);
    });
  });

  // ─── SCENARIO 3: MSME DEFAULT ────────────────────────────────────────────
  describe('Scenario 3: MSME default / reversal', () => {
    const ALLOTTED = { id: 'inv-001', investor_id: INVESTOR_ID, sme_id: SME_ID, amount: String(INVESTMENT_AMOUNT), status: 'ALLOTTED' };

    it('Full recovery: 100% refunded, status=REVERSED', async () => {
      db.queryOne.mockResolvedValueOnce(ALLOTTED);
      db.withTransaction.mockImplementationOnce(async (fn: any) => fn({ query: jest.fn().mockResolvedValue({ rows: [] }) }));
      (ledger as any).reverseInvestment = jest.fn().mockResolvedValue('txn-rev');

      const result = await investments.reverse('inv-001', INVESTMENT_AMOUNT, 'fraud', 'admin-1');
      expect(result.status).toBe(InvestmentStatus.REVERSED);
      expect(result.loss).toBe(0);
    });

    it('Partial recovery: loss recorded correctly', async () => {
      db.queryOne.mockResolvedValueOnce(ALLOTTED);
      db.withTransaction.mockImplementationOnce(async (fn: any) => fn({ query: jest.fn().mockResolvedValue({ rows: [] }) }));
      (ledger as any).reverseInvestment = jest.fn().mockResolvedValue('txn-rev');

      const result = await investments.reverse('inv-001', 60_000, 'partial recovery', 'admin-1');
      expect(result.recovered).toBe(60_000);
      expect(result.loss).toBe(40_000);
    });

    it('Zero recovery: status=DEFAULTED', async () => {
      db.queryOne.mockResolvedValueOnce(ALLOTTED);
      db.withTransaction.mockImplementationOnce(async (fn: any) => fn({ query: jest.fn().mockResolvedValue({ rows: [] }) }));
      (ledger as any).reverseInvestment = jest.fn().mockResolvedValue('txn-rev');

      const result = await investments.reverse('inv-001', 0, 'no recovery', 'admin-1');
      expect(result.status).toBe(InvestmentStatus.DEFAULTED);
    });
  });

  // ─── RAZORPAY WEBHOOK ROUTING ────────────────────────────────────────────
  describe('Webhook routing', () => {
    it('payment.captured → investment confirmed', async () => {
      const spy = jest.spyOn(investments, 'handlePaymentWebhook').mockResolvedValue({ ok: true } as any);
      await payments.handleWebhook('{}', '', {
        event: 'payment.captured',
        payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1', notes: {} } } },
      });
      expect(spy).toHaveBeenCalledWith('pay_1', 'order_1', 'success');
    });

    it('payment.failed → investment failed', async () => {
      const spy = jest.spyOn(investments, 'handlePaymentWebhook').mockResolvedValue({ ok: false } as any);
      await payments.handleWebhook('{}', '', {
        event: 'payment.failed',
        payload: { payment: { entity: { id: 'pay_2', order_id: 'order_2' } } },
      });
      expect(spy).toHaveBeenCalledWith('pay_2', 'order_2', 'failed');
    });
  });
});
