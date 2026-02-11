import Database from 'better-sqlite3';
import { generateId, generateCode, getCurrentTimestamp, floorToDecimal, ValidationError, NotFoundError, BusinessLogicError, DatabaseError } from '../utils/helpers';
import { Logger } from '../utils/logger';

const logger = new Logger('JournalEntriesService');

export interface JournalLineData {
  account_code: string;
  account_name: string;
  debit_amount: number;
  credit_amount: number;
  description?: string;
  line_no: number;
}

export interface JournalEntryData {
  id?: string;
  entry_no?: string;
  entry_date: string;
  status?: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'POSTED';
  lines: JournalLineData[];
  total_amount?: number;
  notes?: string;
  created_by?: string;
}

export interface UpdateJournalEntryData {
  entry_date?: string;
  status?: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'POSTED';
  notes?: string;
}

export interface JournalEntryQuery {
  status?: string;
  start_date?: string;
  end_date?: string;
  account_code?: string;
  limit?: number;
  offset?: number;
}

export class JournalEntriesService {
  private db: Database.Database;
  private entryCounter: number = 1;

  constructor(db: Database.Database) {
    this.db = db;
    this.initializeEntryCounter();
  }

  private initializeEntryCounter(): void {
    const row = this.db
      .prepare('SELECT MAX(entry_no) as max_entry FROM journal_entries')
      .get() as { max_entry: string | null };

    if (row && row.max_entry) {
      const match = row.max_entry.match(/JE(\d+)/);
      if (match) {
        this.entryCounter = parseInt(match[1], 10) + 1;
      }
    }
  }

  private getNextEntryNo(): string {
    return generateCode('JE', this.entryCounter++);
  }

  async validateJournalEntry(data: JournalEntryData): Promise<void> {
    if (!data.entry_date) {
      throw new ValidationError('Entry date is required');
    }

    if (!data.lines || data.lines.length < 2) {
      throw new ValidationError('Journal entry must have at least 2 lines');
    }

    let totalDebit = 0;
    let totalCredit = 0;

    for (const line of data.lines) {
      if (!line.account_code || line.account_code.trim().length === 0) {
        throw new ValidationError('Account code is required for all lines');
      }

      if (!line.account_name || line.account_name.trim().length === 0) {
        throw new ValidationError('Account name is required for all lines');
      }

      if (line.debit_amount < 0) {
        throw new ValidationError('Debit amount cannot be negative');
      }

      if (line.credit_amount < 0) {
        throw new ValidationError('Credit amount cannot be negative');
      }

      if (line.debit_amount > 0 && line.credit_amount > 0) {
        throw new ValidationError('Line cannot have both debit and credit amounts');
      }

      if (line.debit_amount === 0 && line.credit_amount === 0) {
        throw new ValidationError('Line must have either debit or credit amount');
      }

      totalDebit += line.debit_amount;
      totalCredit += line.credit_amount;
    }

    const roundedDebit = floorToDecimal(totalDebit);
    const roundedCredit = floorToDecimal(totalCredit);

    if (roundedDebit !== roundedCredit) {
      throw new BusinessLogicError(`Debits (${roundedDebit}) must equal credits (${roundedCredit})`);
    }

    if (roundedDebit === 0) {
      throw new ValidationError('Journal entry must have a non-zero amount');
    }
  }

  async create(data: JournalEntryData): Promise<string> {
    try {
      await this.validateJournalEntry(data);

      const id = data.id || generateId();
      const entryNo = data.entry_no || this.getNextEntryNo();
      const now = getCurrentTimestamp();

      this.db.prepare('BEGIN TRANSACTION').run();

      try {
        const stmt = this.db.prepare(`
          INSERT INTO journal_entries (
            id, entry_no, entry_date, status, notes, created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          id,
          entryNo,
          data.entry_date,
          data.status || 'DRAFT',
          data.notes || null,
          data.created_by || null,
          now,
          now
        );

        for (const line of data.lines) {
          const lineStmt = this.db.prepare(`
            INSERT INTO journal_entry_lines (
              id, entry_id, account_code, account_name, debit_amount,
              credit_amount, description, line_no, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          lineStmt.run(
            generateId(),
            id,
            line.account_code.trim(),
            line.account_name.trim(),
            Math.round(line.debit_amount * 100) / 100,
            Math.round(line.credit_amount * 100) / 100,
            line.description || null,
            line.line_no,
            now
          );
        }

        this.db.prepare('COMMIT').run();

        logger.info(`Journal entry created: ${id}`);
        return id;
      } catch (error) {
        this.db.prepare('ROLLBACK').run();
        throw error;
      }
    } catch (error) {
      logger.error('Error creating journal entry', error);
      if (error instanceof ValidationError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to create journal entry', error as Error);
    }
  }

  async update(id: string, data: UpdateJournalEntryData): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError('Journal Entry', id);
      }

      if (existing.status === 'POSTED') {
        throw new BusinessLogicError('Cannot update posted journal entry');
      }

      const updates: string[] = [];
      const values: any[] = [];

      if (data.entry_date !== undefined) {
        updates.push('entry_date = ?');
        values.push(data.entry_date);
      }

      if (data.status !== undefined) {
        if (!['DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED'].includes(data.status)) {
          throw new ValidationError('Invalid status');
        }
        updates.push('status = ?');
        values.push(data.status);
      }

      if (data.notes !== undefined) {
        updates.push('notes = ?');
        values.push(data.notes);
      }

      if (updates.length === 0) {
        return;
      }

      updates.push('updated_at = ?');
      values.push(getCurrentTimestamp());
      values.push(id);

      const stmt = this.db.prepare(`
        UPDATE journal_entries SET ${updates.join(', ')} WHERE id = ?
      `);

      stmt.run(...values);

      logger.info(`Journal entry updated: ${id}`);
    } catch (error) {
      logger.error('Error updating journal entry', error);
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to update journal entry', error as Error);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError('Journal Entry', id);
      }

      if (existing.status === 'POSTED') {
        throw new BusinessLogicError('Cannot delete posted journal entry');
      }

      this.db.prepare('DELETE FROM journal_entry_lines WHERE entry_id = ?').run(id);
      this.db.prepare('DELETE FROM journal_entries WHERE id = ?').run(id);

      logger.info(`Journal entry deleted: ${id}`);
    } catch (error) {
      logger.error('Error deleting journal entry', error);
      if (error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to delete journal entry', error as Error);
    }
  }

  async findById(id: string): Promise<JournalEntryData | null> {
    try {
      const row = this.db
        .prepare('SELECT * FROM journal_entries WHERE id = ?')
        .get(id) as any;

      if (!row) {
        return null;
      }

      const lines = this.db
        .prepare('SELECT * FROM journal_entry_lines WHERE entry_id = ? ORDER BY line_no')
        .all(id) as any[];

      return this.mapToJournalEntryData(row, lines);
    } catch (error) {
      logger.error('Error finding journal entry', error);
      throw new DatabaseError('Failed to find journal entry', error as Error);
    }
  }

  async findByEntryNo(entryNo: string): Promise<JournalEntryData | null> {
    try {
      const row = this.db
        .prepare('SELECT * FROM journal_entries WHERE entry_no = ?')
        .get(entryNo) as any;

      if (!row) {
        return null;
      }

      const lines = this.db
        .prepare('SELECT * FROM journal_entry_lines WHERE entry_id = ? ORDER BY line_no')
        .all(row.id) as any[];

      return this.mapToJournalEntryData(row, lines);
    } catch (error) {
      logger.error('Error finding journal entry by number', error);
      throw new DatabaseError('Failed to find journal entry by number', error as Error);
    }
  }

  async findAll(query: JournalEntryQuery = {}): Promise<JournalEntryData[]> {
    try {
      const conditions: string[] = ['1 = 1'];
      const params: any[] = [];

      if (query.status) {
        conditions.push('status = ?');
        params.push(query.status);
      }

      if (query.start_date) {
        conditions.push('entry_date >= ?');
        params.push(query.start_date);
      }

      if (query.end_date) {
        conditions.push('entry_date <= ?');
        params.push(query.end_date);
      }

      let sql = `SELECT * FROM journal_entries WHERE ${conditions.join(' AND ')} ORDER BY entry_date DESC`;

      if (query.limit) {
        sql += ' LIMIT ?';
        params.push(query.limit);
        if (query.offset) {
          sql += ' OFFSET ?';
          params.push(query.offset);
        }
      }

      const rows = this.db.prepare(sql).all(...params) as any[];

      const entries: JournalEntryData[] = [];
      for (const row of rows) {
        const lines = this.db
          .prepare('SELECT * FROM journal_entry_lines WHERE entry_id = ? ORDER BY line_no')
          .all(row.id) as any[];
        entries.push(this.mapToJournalEntryData(row, lines));
      }

      return entries;
    } catch (error) {
      logger.error('Error finding journal entries', error);
      throw new DatabaseError('Failed to find journal entries', error as Error);
    }
  }

  async count(query: JournalEntryQuery = {}): Promise<number> {
    try {
      const conditions: string[] = ['1 = 1'];
      const params: any[] = [];

      if (query.status) {
        conditions.push('status = ?');
        params.push(query.status);
      }

      if (query.start_date) {
        conditions.push('entry_date >= ?');
        params.push(query.start_date);
      }

      if (query.end_date) {
        conditions.push('entry_date <= ?');
        params.push(query.end_date);
      }

      const sql = `SELECT COUNT(*) as count FROM journal_entries WHERE ${conditions.join(' AND ')}`;

      const row = this.db.prepare(sql).get(...params) as { count: number };
      return row.count;
    } catch (error) {
      logger.error('Error counting journal entries', error);
      throw new DatabaseError('Failed to count journal entries', error as Error);
    }
  }

  async getTrialBalance(startDate: string, endDate: string): Promise<any[]> {
    try {
      if (!startDate || !endDate) {
        throw new ValidationError('Start date and end date are required');
      }

      if (startDate.trim() === '' || endDate.trim() === '') {
        throw new ValidationError('Start date and end date are required');
      }

      const rows = this.db
        .prepare(`
          SELECT
            account_code,
            account_name,
            SUM(debit_amount) as total_debit,
            SUM(credit_amount) as total_credit
          FROM journal_entry_lines
          JOIN journal_entries je ON journal_entry_lines.entry_id = je.id
          WHERE je.entry_date >= ? AND je.entry_date <= ? AND je.status = 'POSTED'
          GROUP BY account_code, account_name
          ORDER BY account_code
        `)
        .all(startDate, endDate) as any[];

      return rows.map(row => ({
        account_code: row.account_code,
        account_name: row.account_name,
        total_debit: row.total_debit,
        total_credit: row.total_credit,
        balance: Math.abs(row.total_debit - row.total_credit),
        balance_type: row.total_debit > row.total_credit ? 'DEBIT' : 'CREDIT',
      }));
    } catch (error) {
      logger.error('Error getting trial balance', error);
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to get trial balance', error as Error);
    }
  }

  private mapToJournalEntryData(entry: any, lines: any[]): JournalEntryData {
    const totalDebit = lines.reduce((sum, line) => sum + (line.debit_amount || 0), 0);
    const totalCredit = lines.reduce((sum, line) => sum + (line.credit_amount || 0), 0);
    const totalAmount = totalDebit > 0 ? totalDebit : totalCredit;

    return {
      id: entry.id,
      entry_no: entry.entry_no,
      entry_date: entry.entry_date,
      status: entry.status,
      lines: lines.map(line => ({
        account_code: line.account_code,
        account_name: line.account_name,
        debit_amount: line.debit_amount,
        credit_amount: line.credit_amount,
        description: line.description,
        line_no: line.line_no,
      })),
      notes: entry.notes,
      created_by: entry.created_by,
      total_amount: totalAmount,
    } as any;
  }
}

export default JournalEntriesService;
