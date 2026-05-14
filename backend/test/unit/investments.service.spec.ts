import { Test, TestingModule }  from '@nestjs/testing';
import { ForbiddenException, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InvestmentsService, InvestmentStatus } from '../../src/modules/investments/investments.service';
import { AgentService }          from '../../src/modules/agent/agent.service';
import { DatabaseService }    from '../../src/database/database.service';
import { LedgerService }      from '../../src/modules/ledger/ledger.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';

const mockDB = () => ({
  query:           jest.fn(),
  queryOne:        jest.fn(),
  queryMany:       jest.fn(),
  withTransaction: jest.fn(),
});
const mockLedger        = () => ({ recordDeposit: jest.fn(), lockFunds: jest.fn(), settleInvestment: jest.fn(), refundLockedFunds: jest.fn(), getAllBalances: jest.fn(), getBalance: jest.fn(), initiateWithdrawal: jest.fn(), reverseInvestment: jest.fn() });
const mockNotifications = () => ({ send: jest.fn() });
const mockAgent        = () => ({ recordCommission: jest.fn().mockResolvedValue({ commission_id: 'c1', amount: 1000 }) });

const MOCK_SME = {
  id: 'sme-1', legal_name: 'AgriTech Pvt Ltd', status: 'active',
  min_investment: 50000, max_investment: null, target_raise: 4500000,
  raised_so_far: 1000000, max_investors: 200, instrument: 'equity', valuation_pre: 32000000,
};

describe('InvestmentsService', () => {
  let service: InvestmentsService;
  let db: ReturnType<typeof mockDB>;
  let ledger: ReturnType<typeof mockLedger>;
  let notifs: ReturnType<typeof mockNotifications>;
  let agent: ReturnType<typeof mockAgent>;

  beforeEach(async () => {
    db = mockDB(); ledger = mockLedger(); notifs = mockNotifications(); agent = mockAgent();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvestmentsService,
        { provide: DatabaseService,     useValue: db },
        { provide: LedgerService,       useValue: ledger },
        { provide: NotificationsService, useValue: notifs },
        { provide: AgentService,        useValue: agent },
      ],
    }).compile();
    service = module.get<InvestmentsService>(InvestmentsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── STEP 0: KYC Gate ────────────────────────────────────────────────────
  describe('STEP 0 — KYC pre-check', () => {
    it('throws ForbiddenException if KYC not verified', async () => {
      await expect(service.initiate('investor-1', 'pending', 'sme-1', 100000))
        .rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException for in_review KYC', async () => {
      await expect(service.initiate('investor-1', 'in_review', 'sme-1', 100000))
        .rejects.toThrow(ForbiddenException);
    });
  });

  // ─── STEP 1: Initiate ────────────────────────────────────────────────────
  describe('STEP 1 — Initiate investment', () => {
    beforeEach(() => {
      db.withTransaction.mockImplementation(async (fn: any) => {
        const client = {
          query: jest.fn().mockImplementation((q: string) => {
            if (q.includes('FOR UPDATE'))    return { rows: [MOCK_SME] };
            if (q.includes('COUNT(*)'))      return { rows: [{ c: '5' }] };
            if (q.includes('NOT IN') && q.includes('investor_id')) return { rows: [] }; // no duplicate
            return { rows: [] };
          }),
        };
        return fn(client);
      });
    });

    it('creates investment record with INITIATED status', async () => {
      const result = await service.initiate('investor-1', 'verified', 'sme-1', 100000);
      expect(result).toHaveProperty('investment_id');
      expect(result.amount).toBe(100000);
    });

    it('throws BadRequestException for amount below minimum', async () => {
      db.withTransaction.mockImplementation(async (fn: any) => {
        const client = { query: jest.fn().mockResolvedValue({ rows: [MOCK_SME] }) };
        return fn(client);
      });
      await expect(service.initiate('investor-1', 'verified', 'sme-1', 1000))
        .rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException if investor cap reached (200)', async () => {
      db.withTransaction.mockImplementation(async (fn: any) => {
        const client = {
          query: jest.fn().mockImplementation((q: string) => {
            if (q.includes('FOR UPDATE')) return { rows: [MOCK_SME] };
            if (q.includes('COUNT(*)'))   return { rows: [{ c: '200' }] }; // cap hit
            return { rows: [] };
          }),
        };
        return fn(client);
      });
      await expect(service.initiate('investor-1', 'verified', 'sme-1', 100000))
        .rejects.toThrow(ConflictException);
    });

    it('throws ConflictException for duplicate investment in same SME', async () => {
      db.withTransaction.mockImplementation(async (fn: any) => {
        const client = {
          query: jest.fn().mockImplementation((q: string) => {
            if (q.includes('FOR UPDATE'))   return { rows: [MOCK_SME] };
            if (q.includes('COUNT(*)'))     return { rows: [{ c: '5' }] };
            if (q.includes('NOT IN'))       return { rows: [{ id: 'existing-inv' }] }; // duplicate!
            return { rows: [] };
          }),
        };
        return fn(client);
      });
      await expect(service.initiate('investor-1', 'verified', 'sme-1', 100000))
        .rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException if overfunding would occur', async () => {
      const nearlyFull = { ...MOCK_SME, raised_so_far: 4400000, target_raise: 4500000 };
      db.withTransaction.mockImplementation(async (fn: any) => {
        const client = {
          query: jest.fn().mockImplementation((q: string) => {
            if (q.includes('FOR UPDATE')) return { rows: [nearlyFull] };
            if (q.includes('COUNT(*)'))   return { rows: [{ c: '10' }] };
            return { rows: [] };
          }),
        };
        return fn(client);
      });
      // Trying to invest ₹200K when only ₹100K remaining
      await expect(service.initiate('investor-1', 'verified', 'sme-1', 200000))
        .rejects.toThrow(BadRequestException);
    });
  });

  // ─── STEP 3-5: Payment Webhook ────────────────────────────────────────────
  describe('STEPS 3-5 — Payment webhook (idempotent)', () => {
    it('returns { ok: true, duplicate: true } on duplicate webhook', async () => {
      db.queryOne.mockResolvedValue({ id: 'existing-txn' }); // Already processed
      const result = await service.handlePaymentWebhook('pay_123', 'order_456', 'success');
      expect(result).toEqual({ ok: true, duplicate: true });
    });

    it('processes payment: calls recordDeposit and lockFunds', async () => {
      db.queryOne.mockResolvedValueOnce(null); // Not duplicate
      db.queryOne.mockResolvedValueOnce({      // Investment found
        id: 'inv-1', investor_id: 'inv-user-1', amount: '100000', legal_name: 'ACME',
      });
      db.withTransaction.mockImplementation(async (fn: any) => {
        const client = { query: jest.fn().mockResolvedValue({ rows: [] }) };
        return fn(client);
      });
      ledger.recordDeposit.mockResolvedValue({ txnId: 'txn-1', availableAcctId: 'acct-1' });
      ledger.lockFunds.mockResolvedValue('txn-2');

      const result = await service.handlePaymentWebhook('pay_123', 'order_456', 'success');
      expect(result.ok).toBe(true);
      expect(ledger.recordDeposit).toHaveBeenCalledWith(expect.anything(), 'inv-user-1', 100000, 'pay_123');
      expect(ledger.lockFunds).toHaveBeenCalledWith(expect.anything(), 'inv-user-1', 100000, 'inv-1');
      expect(notifs.send).toHaveBeenCalled();
    });

    it('marks PAYMENT_FAILED and notifies on failed payment', async () => {
      db.queryOne.mockResolvedValueOnce(null);
      db.queryOne.mockResolvedValueOnce({ id: 'inv-1', investor_id: 'user-1', amount: '100000' });
      db.query.mockResolvedValue({ rows: [] });

      const result = await service.handlePaymentWebhook('pay_fail', 'order_456', 'failed');
      expect(result.ok).toBe(false);
      expect(notifs.send).toHaveBeenCalledWith(
        'user-1', 'error', 'Payment Failed', expect.any(String)
      );
    });
  });

  // ─── Scenario 1: Refund ──────────────────────────────────────────────────
  describe('SCENARIO 1 — Refund (idempotent)', () => {
    it('refunds FUNDS_LOCKED investment successfully', async () => {
      db.queryOne.mockResolvedValue({ id: 'inv-1', investor_id: 'user-1', amount: '10000', status: 'FUNDS_LOCKED' });
      db.withTransaction.mockImplementation(async (fn: any) => {
        const client = {
          query: jest.fn().mockImplementation((q: string) => {
            if (q.includes('reference_id')) return { rows: [] }; // not already refunded
            return { rows: [] };
          }),
        };
        return fn(client);
      });
      ledger.refundLockedFunds.mockResolvedValue('txn-refund');

      const result = await service.refund('inv-1', 'MSME_REJECTED', 'admin-1');
      expect(result.ok).toBe(true);
      expect(result.refunded).toBe(10000);
      expect(ledger.refundLockedFunds).toHaveBeenCalled();
    });

    it('prevents double refund (idempotency)', async () => {
      db.queryOne.mockResolvedValue({ id: 'inv-1', investor_id: 'user-1', amount: '10000', status: 'FUNDS_LOCKED' });
      db.withTransaction.mockImplementation(async (fn: any) => {
        const client = {
          query: jest.fn().mockResolvedValue({ rows: [{ id: 'existing-refund-txn' }] }),
        };
        return fn(client);
      });

      const result = await service.refund('inv-1', 'MSME_REJECTED', 'admin-1');
      expect(result).toEqual({ ok: true, duplicate: true });
      expect(ledger.refundLockedFunds).not.toHaveBeenCalled();
    });

    it('throws NotFoundException if investment not in FUNDS_LOCKED state', async () => {
      db.queryOne.mockResolvedValue(null);
      await expect(service.refund('bad-inv', 'reason', 'admin')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Scenario 2: Withdrawal ──────────────────────────────────────────────
  describe('SCENARIO 2 — Withdrawal validation', () => {
    it('throws BadRequestException if balance insufficient', async () => {
      ledger.getBalance.mockResolvedValue(3000); // Only ₹3K available
      await expect(service.initiateWithdrawal('user-1', 5000))
        .rejects.toThrow(BadRequestException);
    });

    it('creates withdrawal record if balance sufficient', async () => {
      ledger.getBalance.mockResolvedValue(10000);
      db.query.mockResolvedValue({ rows: [] });
      ledger.lockFunds = jest.fn(); // not used here

      const result = await service.initiateWithdrawal('user-1', 5000);
      expect(result).toHaveProperty('withdrawal_id');
      expect(result.amount).toBe(5000);
      expect(result.status).toBe('PENDING');
    });
  });

  // ─── Scenario 3: Reversal ────────────────────────────────────────────────
  describe('SCENARIO 3 — MSME Default / Reversal', () => {
    const ALLOTTED_INV = { id: 'inv-1', investor_id: 'user-1', sme_id: 'sme-1', amount: '10000', status: 'ALLOTTED' };

    it('marks REVERSED with full recovery', async () => {
      db.queryOne.mockResolvedValue(ALLOTTED_INV);
      db.withTransaction.mockImplementation(async (fn: any) => fn({ query: jest.fn().mockResolvedValue({ rows: [] }) }));
      (ledger as any).reverseInvestment.mockResolvedValue('txn-rev');

      const result = await service.reverse('inv-1', 10000, 'fraud detected', 'admin-1');
      expect(result.status).toBe(InvestmentStatus.REVERSED);
      expect(result.loss).toBe(0);
    });

    it('records partial recovery with loss', async () => {
      db.queryOne.mockResolvedValue(ALLOTTED_INV);
      db.withTransaction.mockImplementation(async (fn: any) => fn({ query: jest.fn().mockResolvedValue({ rows: [] }) }));
      (ledger as any).reverseInvestment.mockResolvedValue('txn-rev');

      const result = await service.reverse('inv-1', 6000, 'partial recovery', 'admin-1');
      expect(result.recovered).toBe(6000);
      expect(result.loss).toBe(4000);
    });

    it('marks DEFAULTED when zero recovery', async () => {
      db.queryOne.mockResolvedValue(ALLOTTED_INV);
      db.withTransaction.mockImplementation(async (fn: any) => fn({ query: jest.fn().mockResolvedValue({ rows: [] }) }));
      (ledger as any).reverseInvestment.mockResolvedValue('txn-rev');

      const result = await service.reverse('inv-1', 0, 'no recovery', 'admin-1');
      expect(result.status).toBe(InvestmentStatus.DEFAULTED);
    });

    it('throws NotFoundException if investment not ALLOTTED', async () => {
      db.queryOne.mockResolvedValue(null);
      await expect(service.reverse('bad-inv', 1000, 'reason', 'admin')).rejects.toThrow(NotFoundException);
    });
  });
});
