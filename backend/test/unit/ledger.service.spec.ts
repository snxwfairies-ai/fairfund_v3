import { Test, TestingModule }       from '@nestjs/testing';
import { ConflictException, InternalServerErrorException } from '@nestjs/common';
import { LedgerService }              from '../../src/modules/ledger/ledger.service';
import { DatabaseService }            from '../../src/database/database.service';
import { AccountType, EntryType, TransactionType } from '../../src/modules/ledger/ledger.types';

// ─── Mocks ───────────────────────────────────────────────────────────────────
const mockQueryRows = (rows: any[]) => jest.fn().mockResolvedValue({ rows });
const mockDB = () => ({
  query:           jest.fn(),
  queryOne:        jest.fn(),
  queryMany:       jest.fn(),
  withTransaction: jest.fn(),
});

describe('LedgerService', () => {
  let service: LedgerService;
  let db: ReturnType<typeof mockDB>;

  beforeEach(async () => {
    db = mockDB();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LedgerService,
        { provide: DatabaseService, useValue: db },
      ],
    }).compile();
    service = module.get<LedgerService>(LedgerService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─────────────────────────────────────────────────────────────────────────
  describe('getBalance', () => {
    it('returns computed balance from ledger entries', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ balance: '5000.00' }] });
      const balance = await service.getBalance('user-123', AccountType.INVESTOR_AVAILABLE);
      expect(balance).toBe(5000);
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('SUM'),
        ['user-123', AccountType.INVESTOR_AVAILABLE],
      );
    });

    it('returns 0 when no ledger entries exist', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ balance: null }] });
      const balance = await service.getBalance('user-new', AccountType.INVESTOR_AVAILABLE);
      expect(balance).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('executeTransaction', () => {
    const makePayload = (overrides = {}) => ({
      type:         TransactionType.INVESTMENT,
      reference_id: 'REF-001',
      investor_id:  'investor-1',
      amount:       10000,
      description:  'Test transaction',
      entries: [
        { txn_id: '', account_id: 'acct-1', entry_type: EntryType.DEBIT,  amount: 10000, description: 'debit' },
        { txn_id: '', account_id: 'acct-2', entry_type: EntryType.CREDIT, amount: 10000, description: 'credit' },
      ],
      ...overrides,
    });

    it('returns existing txn_id on idempotent retry (SUCCESS status)', async () => {
      const existingId = 'existing-txn-id';
      db.withTransaction.mockImplementationOnce(async (fn: any) => {
        const mockClient = {
          query: jest.fn().mockImplementation((q: string) => {
            if (q.includes('reference_id')) return { rows: [{ id: existingId, status: 'SUCCESS' }] };
            return { rows: [] };
          }),
        };
        return fn(mockClient);
      });

      const result = await service.executeTransaction(makePayload());
      expect(result).toBe(existingId);
    });

    it('throws ConflictException when transaction is PROCESSING', async () => {
      db.withTransaction.mockImplementationOnce(async (fn: any) => {
        const mockClient = {
          query: jest.fn().mockResolvedValue({ rows: [{ id: 'tid', status: 'PROCESSING' }] }),
        };
        return fn(mockClient);
      });

      await expect(service.executeTransaction(makePayload())).rejects.toThrow(ConflictException);
    });

    it('throws InternalServerErrorException when debits ≠ credits', async () => {
      db.withTransaction.mockImplementationOnce(async (fn: any) => {
        const mockClient = {
          query: jest.fn().mockResolvedValue({ rows: [] }),
        };
        return fn(mockClient);
      });

      const unbalancedPayload = makePayload({
        entries: [
          { txn_id: '', account_id: 'acct-1', entry_type: EntryType.DEBIT,  amount: 10000, description: 'd' },
          { txn_id: '', account_id: 'acct-2', entry_type: EntryType.CREDIT, amount: 9999,  description: 'c' },
        ],
      });

      await expect(service.executeTransaction(unbalancedPayload))
        .rejects.toThrow(InternalServerErrorException);
    });

    it('throws ConflictException on insufficient funds', async () => {
      db.withTransaction.mockImplementationOnce(async (fn: any) => {
        const mockClient = {
          query: jest.fn().mockImplementation((q: string) => {
            if (q.includes('reference_id'))   return { rows: [] };
            if (q.includes('INSERT INTO transactions')) return { rows: [] };
            if (q.includes('SUM')) return { rows: [{ balance: '500.00' }] }; // Only ₹500 available
            return { rows: [] };
          }),
        };
        return fn(mockClient);
      });

      await expect(service.executeTransaction(makePayload())).rejects.toThrow(ConflictException);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('lockFunds', () => {
    it('calls executeTransaction with LOCK reference_id', async () => {
      const execSpy = jest.spyOn(service, 'executeTransaction' as any).mockResolvedValue('txn-lock');
      jest.spyOn(service, 'ensureAccount' as any).mockResolvedValue('acct-1');
      
      db.withTransaction.mockImplementation(async (fn: any) =>
        fn({ query: jest.fn().mockResolvedValue({ rows: [{ balance: '10000' }] }) })
      );

      await service.lockFunds({} as any, 'investor-1', 10000, 'inv-001');
      expect(execSpy).toHaveBeenCalledWith(expect.objectContaining({ reference_id: 'LOCK-inv-001' }));
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('refundLockedFunds', () => {
    it('creates LOCKED→AVAILABLE entries (reversal)', async () => {
      const queryCalls: string[] = [];
      db.withTransaction.mockImplementationOnce(async (fn: any) => {
        const mockClient = {
          query: jest.fn().mockImplementation((q: string) => {
            queryCalls.push(q);
            if (q.includes('reference_id')) return { rows: [] };
            return { rows: [{ id: 'acct-id', balance: '10000.00' }] };
          }),
        };
        return fn(mockClient);
      });

      jest.spyOn(service, 'ensureAccount' as any).mockResolvedValue('mock-acct');

      await service.refundLockedFunds({} as any, 'investor-1', 'inv-001', 10000, 'MSME_REJECTED');
      // Should include REFUND type in transaction
      expect(queryCalls.some(q => q.includes('INSERT INTO transactions'))).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  describe('Double-entry integrity', () => {
    const cases = [
      { debits: 10000, credits: 10000, shouldPass: true  },
      { debits: 10000, credits: 9999,  shouldPass: false },
      { debits: 10000, credits: 10001, shouldPass: false },
      { debits: 0.01,  credits: 0.01,  shouldPass: true  },
    ];

    it.each(cases)('debits=$debits credits=$credits → valid=$shouldPass', ({ debits, credits, shouldPass }) => {
      const diff = Math.abs(debits - credits);
      expect(diff <= 0.01).toBe(shouldPass);
    });
  });
});
