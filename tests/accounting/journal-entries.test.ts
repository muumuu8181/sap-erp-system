import { DatabaseConnection } from '../../src/db/connection';
import { JournalEntriesService, JournalEntryData, JournalLineData } from '../../src/accounting/journal-entries';
import { ValidationError, NotFoundError, BusinessLogicError } from '../../src/utils/helpers';

describe('JournalEntriesService', () => {
  let db: any;
  let service: JournalEntriesService;

  beforeAll(async () => {
    db = DatabaseConnection.getInstance();
    await DatabaseConnection.initialize();
    service = new JournalEntriesService(db);
  });

  beforeEach(() => {
    db.prepare('DELETE FROM journal_entry_lines').run();
    db.prepare('DELETE FROM journal_entries').run();
  });

  afterEach(() => {
    db.prepare('DELETE FROM journal_entry_lines').run();
    db.prepare('DELETE FROM journal_entries').run();
  });

  afterAll(() => {
    DatabaseConnection.close();
  });

  describe('create', () => {
    const validLines: JournalLineData[] = [
      {
        account_code: '1000',
        account_name: 'Cash',
        debit_amount: 10000,
        credit_amount: 0,
        line_no: 1,
      },
      {
        account_code: '4000',
        account_name: 'Sales Revenue',
        debit_amount: 0,
        credit_amount: 10000,
        line_no: 2,
      },
    ];

    it('should create a new journal entry with balanced debits and credits', async () => {
      const data: JournalEntryData = {
        entry_date: new Date().toISOString(),
        status: 'DRAFT',
        lines: validLines,
        created_by: 'user001',
      };

      const id = await service.create(data);

      expect(id).toBeDefined();

      const entry = db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(id);
      expect(entry).toBeDefined();
      expect(entry.status).toBe('DRAFT');

      const lines = db.prepare('SELECT * FROM journal_entry_lines WHERE entry_id = ? ORDER BY line_no').all(id);
      expect(lines).toHaveLength(2);
    });

    it('should throw ValidationError when entry_date is missing', async () => {
      const data: JournalEntryData = {
        entry_date: '',
        status: 'DRAFT',
        lines: validLines,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for empty lines', async () => {
      const data: JournalEntryData = {
        entry_date: new Date().toISOString(),
        lines: [],
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for lines with less than 2 items', async () => {
      const data: JournalEntryData = {
        entry_date: new Date().toISOString(),
        lines: [
          {
            account_code: '1000',
            account_name: 'Cash',
            debit_amount: 10000,
            credit_amount: 0,
            line_no: 1,
          },
        ],
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for empty account_code', async () => {
      const lines: JournalLineData[] = [
        {
          account_code: '',
          account_name: 'Cash',
          debit_amount: 10000,
          credit_amount: 0,
          line_no: 1,
        },
        {
          account_code: '4000',
          account_name: 'Sales Revenue',
          debit_amount: 0,
          credit_amount: 10000,
          line_no: 2,
        },
      ];

      const data: JournalEntryData = {
        entry_date: new Date().toISOString(),
        lines,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for empty account_name', async () => {
      const lines: JournalLineData[] = [
        {
          account_code: '1000',
          account_name: '',
          debit_amount: 10000,
          credit_amount: 0,
          line_no: 1,
        },
        {
          account_code: '4000',
          account_name: 'Sales Revenue',
          debit_amount: 0,
          credit_amount: 10000,
          line_no: 2,
        },
      ];

      const data: JournalEntryData = {
        entry_date: new Date().toISOString(),
        lines,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for negative amount', async () => {
      const lines: JournalLineData[] = [
        {
          account_code: '1000',
          account_name: 'Cash',
          debit_amount: -100,
          credit_amount: 0,
          line_no: 1,
        },
        {
          account_code: '4000',
          account_name: 'Sales Revenue',
          debit_amount: 0,
          credit_amount: 10000,
          line_no: 2,
        },
      ];

      const data: JournalEntryData = {
        entry_date: new Date().toISOString(),
        lines,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when both debit and credit are positive', async () => {
      const lines: JournalLineData[] = [
        {
          account_code: '1000',
          account_name: 'Cash',
          debit_amount: 5000,
          credit_amount: 5000,
          line_no: 1,
        },
        {
          account_code: '4000',
          account_name: 'Sales Revenue',
          debit_amount: 0,
          credit_amount: 5000,
          line_no: 2,
        },
      ];

      const data: JournalEntryData = {
        entry_date: new Date().toISOString(),
        lines,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when both debit and credit are zero', async () => {
      const lines: JournalLineData[] = [
        {
          account_code: '1000',
          account_name: 'Cash',
          debit_amount: 0,
          credit_amount: 0,
          line_no: 1,
        },
        {
          account_code: '4000',
          account_name: 'Sales Revenue',
          debit_amount: 0,
          credit_amount: 0,
          line_no: 2,
        },
      ];

      const data: JournalEntryData = {
        entry_date: new Date().toISOString(),
        lines,
      };

      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should throw BusinessLogicError when debits do not equal credits', async () => {
      const lines: JournalLineData[] = [
        {
          account_code: '1000',
          account_name: 'Cash',
          debit_amount: 10000,
          credit_amount: 0,
          line_no: 1,
        },
        {
          account_code: '4000',
          account_name: 'Sales Revenue',
          debit_amount: 0,
          credit_amount: 8000,
          line_no: 2,
        },
      ];

      const data: JournalEntryData = {
        entry_date: new Date().toISOString(),
        lines,
      };

      await expect(service.create(data)).rejects.toThrow(BusinessLogicError);
    });

    it('should create entry with auto-generated entry number', async () => {
      const data: JournalEntryData = {
        entry_date: new Date().toISOString(),
        lines: validLines,
      };

      const id = await service.create(data);

      const entry = await service.findById(id);
      expect(entry?.entry_no).toBeDefined();
      expect(entry?.entry_no?.startsWith('JE')).toBe(true);
    });

    it('should create entry with custom entry number', async () => {
      const data: JournalEntryData = {
        entry_no: 'JE999999',
        entry_date: new Date().toISOString(),
        lines: validLines,
      };

      const id = await service.create(data);

      const entry = await service.findByEntryNo('JE999999');
      expect(entry).toBeDefined();
      expect(entry?.entry_no).toBe('JE999999');
    });

    it('should round amounts correctly', async () => {
      const lines: JournalLineData[] = [
        {
          account_code: '1000',
          account_name: 'Cash',
          debit_amount: 10000.555,
          credit_amount: 0,
          line_no: 1,
        },
        {
          account_code: '4000',
          account_name: 'Sales Revenue',
          debit_amount: 0,
          credit_amount: 10000.555,
          line_no: 2,
        },
      ];

      const data: JournalEntryData = {
        entry_date: new Date().toISOString(),
        lines,
      };

      const id = await service.create(data);

      const entryLines = db.prepare('SELECT * FROM journal_entry_lines WHERE entry_id = ?').all(id);
      expect(entryLines.length).toBe(2);
      expect(entryLines[0].debit_amount).toBe(10000.56);
      expect(entryLines[1].credit_amount).toBe(10000.56);
    });
  });

  describe('update', () => {
    let testEntryId: string;

    beforeEach(async () => {
      const validLines: JournalLineData[] = [
        {
          account_code: '1000',
          account_name: 'Cash',
          debit_amount: 10000,
          credit_amount: 0,
          line_no: 1,
        },
        {
          account_code: '4000',
          account_name: 'Sales Revenue',
          debit_amount: 0,
          credit_amount: 10000,
          line_no: 2,
        },
      ];

      const data: JournalEntryData = {
        entry_date: new Date().toISOString(),
        status: 'DRAFT',
        lines: validLines,
      };

      testEntryId = await service.create(data);
    });

    it('should update status', async () => {
      await service.update(testEntryId, { status: 'SUBMITTED' });

      const entry = await service.findById(testEntryId);
      expect(entry?.status).toBe('SUBMITTED');
    });

    it('should update notes', async () => {
      await service.update(testEntryId, { notes: 'Updated notes' });

      const entry = await service.findById(testEntryId);
      expect(entry?.notes).toBe('Updated notes');
    });

    it('should throw NotFoundError for non-existent entry', async () => {
      await expect(
        service.update('non-existent-id', { status: 'SUBMITTED' })
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessLogicError when updating posted entry', async () => {
      await service.update(testEntryId, { status: 'POSTED' });

      await expect(
        service.update(testEntryId, { status: 'DRAFT' })
      ).rejects.toThrow(BusinessLogicError);
    });

    it('should throw ValidationError for invalid status', async () => {
      await expect(
        service.update(testEntryId, { status: 'INVALID' as any })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('delete', () => {
    it('should delete entry successfully', async () => {
      const validLines: JournalLineData[] = [
        {
          account_code: '1000',
          account_name: 'Cash',
          debit_amount: 10000,
          credit_amount: 0,
          line_no: 1,
        },
        {
          account_code: '4000',
          account_name: 'Sales Revenue',
          debit_amount: 0,
          credit_amount: 10000,
          line_no: 2,
        },
      ];

      const data: JournalEntryData = {
        entry_date: new Date().toISOString(),
        status: 'DRAFT',
        lines: validLines,
      };

      const id = await service.create(data);
      await service.delete(id);

      const entry = await service.findById(id);
      expect(entry).toBeNull();
    });

    it('should throw NotFoundError for non-existent entry', async () => {
      await expect(service.delete('non-existent-id')).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessLogicError when deleting posted entry', async () => {
      const validLines: JournalLineData[] = [
        {
          account_code: '1000',
          account_name: 'Cash',
          debit_amount: 10000,
          credit_amount: 0,
          line_no: 1,
        },
        {
          account_code: '4000',
          account_name: 'Sales Revenue',
          debit_amount: 0,
          credit_amount: 10000,
          line_no: 2,
        },
      ];

      const data: JournalEntryData = {
        entry_date: new Date().toISOString(),
        status: 'POSTED',
        lines: validLines,
      };

      const id = await service.create(data);

      await expect(service.delete(id)).rejects.toThrow(BusinessLogicError);
    });
  });

  describe('findById', () => {
    it('should find entry by id', async () => {
      const validLines: JournalLineData[] = [
        {
          account_code: '1000',
          account_name: 'Cash',
          debit_amount: 10000,
          credit_amount: 0,
          line_no: 1,
        },
        {
          account_code: '4000',
          account_name: 'Sales Revenue',
          debit_amount: 0,
          credit_amount: 10000,
          line_no: 2,
        },
      ];

      const data: JournalEntryData = {
        entry_date: new Date().toISOString(),
        lines: validLines,
      };

      const id = await service.create(data);
      const entry = await service.findById(id);

      expect(entry).toBeDefined();
      expect(entry?.id).toBe(id);
    });

    it('should return null for non-existent entry', async () => {
      const entry = await service.findById('non-existent-id');
      expect(entry).toBeNull();
    });
  });

  describe('findByEntryNo', () => {
    it('should find entry by entry number', async () => {
      const validLines: JournalLineData[] = [
        {
          account_code: '1000',
          account_name: 'Cash',
          debit_amount: 10000,
          credit_amount: 0,
          line_no: 1,
        },
        {
          account_code: '4000',
          account_name: 'Sales Revenue',
          debit_amount: 0,
          credit_amount: 10000,
          line_no: 2,
        },
      ];

      const data: JournalEntryData = {
        entry_no: 'JE999998',
        entry_date: new Date().toISOString(),
        lines: validLines,
      };

      await service.create(data);
      const entry = await service.findByEntryNo('JE999998');

      expect(entry).toBeDefined();
      expect(entry?.entry_no).toBe('JE999998');
    });

    it('should return null for non-existent entry number', async () => {
      const entry = await service.findByEntryNo('NONEXISTENT');
      expect(entry).toBeNull();
    });
  });

  describe('findAll', () => {
    beforeEach(async () => {
      const validLines: JournalLineData[] = [
        {
          account_code: '1000',
          account_name: 'Cash',
          debit_amount: 10000,
          credit_amount: 0,
          line_no: 1,
        },
        {
          account_code: '4000',
          account_name: 'Sales Revenue',
          debit_amount: 0,
          credit_amount: 10000,
          line_no: 2,
        },
      ];

      const entries: JournalEntryData[] = [
        {
          entry_date: '2024-01-01T00:00:00.000Z',
          status: 'DRAFT',
          lines: validLines,
        },
        {
          entry_date: '2024-01-02T00:00:00.000Z',
          status: 'SUBMITTED',
          lines: validLines,
        },
        {
          entry_date: '2024-01-03T00:00:00.000Z',
          status: 'APPROVED',
          lines: validLines,
        },
      ];

      for (const entry of entries) {
        await service.create(entry);
      }
    });

    it('should find all entries', async () => {
      const entries = await service.findAll({});
      expect(entries.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter by status', async () => {
      const entries = await service.findAll({ status: 'DRAFT' });
      expect(entries.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter by date range', async () => {
      const entries = await service.findAll({
        start_date: '2024-01-01T00:00:00.000Z',
        end_date: '2024-01-02T00:00:00.000Z',
      });
      expect(entries.length).toBeGreaterThanOrEqual(2);
    });

    it('should support pagination', async () => {
      const entries = await service.findAll({ limit: 2, offset: 0 });
      expect(entries.length).toBeLessThanOrEqual(2);
    });
  });

  describe('count', () => {
    beforeEach(async () => {
      const validLines: JournalLineData[] = [
        {
          account_code: '1000',
          account_name: 'Cash',
          debit_amount: 10000,
          credit_amount: 0,
          line_no: 1,
        },
        {
          account_code: '4000',
          account_name: 'Sales Revenue',
          debit_amount: 0,
          credit_amount: 10000,
          line_no: 2,
        },
      ];

      for (let i = 0; i < 3; i++) {
        await service.create({
          entry_date: new Date().toISOString(),
          lines: validLines,
        });
      }
    });

    it('should count all entries', async () => {
      const count = await service.count({});
      expect(count).toBeGreaterThanOrEqual(3);
    });

    it('should count by status', async () => {
      const count = await service.count({ status: 'DRAFT' });
      expect(count).toBeGreaterThanOrEqual(3);
    });
  });

  describe('getTrialBalance', () => {
    beforeEach(async () => {
      const validLines: JournalLineData[] = [
        {
          account_code: '1000',
          account_name: 'Cash',
          debit_amount: 50000,
          credit_amount: 0,
          line_no: 1,
        },
        {
          account_code: '2000',
          account_name: 'Accounts Receivable',
          debit_amount: 20000,
          credit_amount: 0,
          line_no: 2,
        },
        {
          account_code: '4000',
          account_name: 'Sales Revenue',
          debit_amount: 0,
          credit_amount: 70000,
          line_no: 3,
        },
      ];

      await service.create({
        entry_date: '2024-01-01T00:00:00.000Z',
        status: 'POSTED',
        lines: validLines,
      });
    });

    it('should generate trial balance', async () => {
      const trialBalance = await service.getTrialBalance(
        '2024-01-01T00:00:00.000Z',
        '2024-12-31T23:59:59.999Z'
      );

      expect(trialBalance).toBeDefined();
      expect(Array.isArray(trialBalance)).toBe(true);
      expect(trialBalance.length).toBeGreaterThan(0);

      // Check totals
      const totalDebit = trialBalance.reduce((sum, item) => sum + item.total_debit, 0);
      const totalCredit = trialBalance.reduce((sum, item) => sum + item.total_credit, 0);
      expect(totalDebit).toBe(70000);
      expect(totalCredit).toBe(70000);
    });

    it('should include only posted entries', async () => {
      const trialBalance = await service.getTrialBalance(
        '2024-01-01T00:00:00.000Z',
        '2024-12-31T23:59:59.999Z'
      );

      // Should only have 3 accounts from the posted entry
      expect(trialBalance.length).toBe(3);
    });

    it('should throw ValidationError when dates are missing', async () => {
      await expect(
        service.getTrialBalance('', '')
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('edge cases', () => {
    it('should handle multiple decimal places', async () => {
      const lines: JournalLineData[] = [
        {
          account_code: '1000',
          account_name: 'Cash',
          debit_amount: 10000.555,
          credit_amount: 0,
          line_no: 1,
        },
        {
          account_code: '4000',
          account_name: 'Sales Revenue',
          debit_amount: 0,
          credit_amount: 10000.555,
          line_no: 2,
        },
      ];

      const data: JournalEntryData = {
        entry_date: new Date().toISOString(),
        lines,
      };

      const id = await service.create(data);
      const entry = await service.findById(id);

      expect(entry).toBeDefined();
      expect(entry?.total_amount).toBeDefined();
    });

    it('should handle very large amounts', async () => {
      const lines: JournalLineData[] = [
        {
          account_code: '1000',
          account_name: 'Cash',
          debit_amount: 999999999.99,
          credit_amount: 0,
          line_no: 1,
        },
        {
          account_code: '4000',
          account_name: 'Sales Revenue',
          debit_amount: 0,
          credit_amount: 999999999.99,
          line_no: 2,
        },
      ];

      const data: JournalEntryData = {
        entry_date: new Date().toISOString(),
        lines,
      };

      const id = await service.create(data);
      const entry = await service.findById(id);

      expect(entry).toBeDefined();
    });

    it('should handle zero amounts after rounding', async () => {
      const lines: JournalLineData[] = [
        {
          account_code: '1000',
          account_name: 'Cash',
          debit_amount: 0.001,
          credit_amount: 0,
          line_no: 1,
        },
        {
          account_code: '4000',
          account_name: 'Sales Revenue',
          debit_amount: 0,
          credit_amount: 0.001,
          line_no: 2,
        },
      ];

      const data: JournalEntryData = {
        entry_date: new Date().toISOString(),
        lines,
      };

      // Should throw ValidationError because amounts round to zero
      await expect(service.create(data)).rejects.toThrow(ValidationError);
    });

    it('should preserve line order', async () => {
      const lines: JournalLineData[] = [
        {
          account_code: '1000',
          account_name: 'Cash',
          debit_amount: 10000,
          credit_amount: 0,
          line_no: 1,
          description: 'Line 1',
        },
        {
          account_code: '2000',
          account_name: 'Accounts Receivable',
          debit_amount: 5000,
          credit_amount: 0,
          line_no: 2,
          description: 'Line 2',
        },
        {
          account_code: '3000',
          account_name: 'Inventory',
          debit_amount: 2000,
          credit_amount: 0,
          line_no: 3,
          description: 'Line 3',
        },
        {
          account_code: '4000',
          account_name: 'Sales Revenue',
          debit_amount: 0,
          credit_amount: 17000,
          line_no: 4,
          description: 'Line 4',
        },
      ];

      const data: JournalEntryData = {
        entry_date: new Date().toISOString(),
        lines,
      };

      const id = await service.create(data);
      const entry = await service.findById(id);

      expect(entry?.lines).toHaveLength(4);
      expect(entry?.lines[0].line_no).toBe(1);
      expect(entry?.lines[3].line_no).toBe(4);
    });
  });
});
