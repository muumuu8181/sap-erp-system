import Database from 'better-sqlite3';
import { generateId, getCurrentTimestamp, ValidationError, NotFoundError, BusinessLogicError, DatabaseError } from '../utils/helpers';
import { Logger } from '../utils/logger';

const logger = new Logger('AccountsPayableService');

export interface PayableData {
  id?: string;
  supplier_id: string;
  reference_id: string;
  transaction_date: string;
  debit_amount: number;
  credit_amount: number;
  balance?: number;
  due_date: string;
  status?: 'OPEN' | 'PARTIAL' | 'PAID' | 'OVERDUE';
  notes?: string;
}

export interface PaymentData {
  payable_id: string;
  payment_date: string;
  amount: number;
  payment_method?: string;
  reference?: string;
  notes?: string;
}

export interface PayableQuery {
  supplier_id?: string;
  reference_id?: string;
  status?: string;
  due_start?: string;
  due_end?: string;
  limit?: number;
  offset?: number;
}

export class AccountsPayableService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  async create(data: PayableData): Promise<string> {
    try {
      const supplier = this.db
        .prepare('SELECT id FROM suppliers WHERE id = ?')
        .get(data.supplier_id);

      if (!supplier) {
        throw new NotFoundError('Supplier', data.supplier_id);
      }

      const balance = data.credit_amount - data.debit_amount;

      const id = data.id || generateId();
      const now = getCurrentTimestamp();

      const stmt = this.db.prepare(`
        INSERT INTO accounts_payable (
          id, supplier_id, reference_id, transaction_date, debit_amount,
          credit_amount, balance, due_date, status, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        data.supplier_id,
        data.reference_id,
        data.transaction_date,
        data.debit_amount,
        data.credit_amount,
        balance,
        data.due_date,
        data.status || 'OPEN',
        data.notes || null,
        now,
        now
      );

      logger.info(`Accounts payable created: ${id}`);
      return id;
    } catch (error) {
      logger.error('Error creating accounts payable', error);
      if (error instanceof NotFoundError) {
        throw error;
      }
      throw new DatabaseError('Failed to create accounts payable', error as Error);
    }
  }

  async applyPayment(data: PaymentData): Promise<string> {
    try {
      const payable = this.db
        .prepare('SELECT * FROM accounts_payable WHERE id = ?')
        .get(data.payable_id) as any;

      if (!payable) {
        throw new NotFoundError('Accounts Payable', data.payable_id);
      }

      if (payable.status === 'PAID') {
        throw new BusinessLogicError('Payable is already paid');
      }

      if (data.amount <= 0) {
        throw new ValidationError('Payment amount must be greater than 0');
      }

      if (data.amount > payable.balance) {
        throw new ValidationError('Payment amount cannot exceed balance');
      }

      const newDebitAmount = payable.debit_amount + data.amount;
      const newBalance = payable.balance - data.amount;
      const newStatus = newBalance === 0 ? 'PAID' : 'PARTIAL';

      this.db.prepare('BEGIN TRANSACTION').run();

      try {
        const paymentStmt = this.db.prepare(`
          INSERT INTO accounts_payable (
            id, supplier_id, reference_id, transaction_date, debit_amount,
            credit_amount, balance, due_date, status, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        paymentStmt.run(
          generateId(),
          payable.supplier_id,
          payable.reference_id,
          data.payment_date,
          data.amount,
          0,
          newBalance,
          payable.due_date,
          newStatus,
          `Payment: ${data.notes || data.payment_method || ''} ${data.reference || ''}`,
          getCurrentTimestamp(),
          getCurrentTimestamp()
        );

        this.db.prepare(`
          UPDATE accounts_payable
          SET debit_amount = ?, balance = ?, status = ?, updated_at = ?
          WHERE id = ?
        `).run(newDebitAmount, newBalance, newStatus, getCurrentTimestamp(), data.payable_id);

        this.db.prepare('COMMIT').run();

        logger.info(`Payment applied: ${data.payable_id}`);
        return data.payable_id;
      } catch (error) {
        this.db.prepare('ROLLBACK').run();
        throw error;
      }
    } catch (error) {
      logger.error('Error applying payment', error);
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to apply payment', error as Error);
    }
  }

  async findById(id: string): Promise<PayableData | null> {
    try {
      const row = this.db
        .prepare('SELECT * FROM accounts_payable WHERE id = ?')
        .get(id) as any;

      if (!row) {
        return null;
      }

      return this.mapToPayableData(row);
    } catch (error) {
      logger.error('Error finding accounts payable', error);
      throw new DatabaseError('Failed to find accounts payable', error as Error);
    }
  }

  async findAll(query: PayableQuery = {}): Promise<PayableData[]> {
    try {
      const conditions: string[] = ['1 = 1'];
      const params: any[] = [];

      if (query.supplier_id) {
        conditions.push('supplier_id = ?');
        params.push(query.supplier_id);
      }

      if (query.reference_id) {
        conditions.push('reference_id = ?');
        params.push(query.reference_id);
      }

      if (query.status) {
        conditions.push('status = ?');
        params.push(query.status);
      }

      if (query.due_start) {
        conditions.push('due_date >= ?');
        params.push(query.due_start);
      }

      if (query.due_end) {
        conditions.push('due_date <= ?');
        params.push(query.due_end);
      }

      let sql = `SELECT * FROM accounts_payable WHERE ${conditions.join(' AND ')} ORDER BY transaction_date DESC`;

      if (query.limit) {
        sql += ' LIMIT ?';
        params.push(query.limit);
        if (query.offset) {
          sql += ' OFFSET ?';
          params.push(query.offset);
        }
      }

      const rows = this.db.prepare(sql).all(...params) as any[];
      return rows.map(row => this.mapToPayableData(row));
    } catch (error) {
      logger.error('Error finding accounts payable', error);
      throw new DatabaseError('Failed to find accounts payable', error as Error);
    }
  }

  async count(query: PayableQuery = {}): Promise<number> {
    try {
      const conditions: string[] = ['1 = 1'];
      const params: any[] = [];

      if (query.supplier_id) {
        conditions.push('supplier_id = ?');
        params.push(query.supplier_id);
      }

      if (query.reference_id) {
        conditions.push('reference_id = ?');
        params.push(query.reference_id);
      }

      if (query.status) {
        conditions.push('status = ?');
        params.push(query.status);
      }

      if (query.due_start) {
        conditions.push('due_date >= ?');
        params.push(query.due_start);
      }

      if (query.due_end) {
        conditions.push('due_date <= ?');
        params.push(query.due_end);
      }

      const sql = `SELECT COUNT(*) as count FROM accounts_payable WHERE ${conditions.join(' AND ')}`;

      const row = this.db.prepare(sql).get(...params) as { count: number };
      return row.count;
    } catch (error) {
      logger.error('Error counting accounts payable', error);
      throw new DatabaseError('Failed to count accounts payable', error as Error);
    }
  }

  async getSupplierPayables(supplierId: string): Promise<PayableData[]> {
    return this.findAll({ supplier_id: supplierId });
  }

  async getOverduePayables(): Promise<PayableData[]> {
    const now = getCurrentTimestamp();
    const rows = this.db
      .prepare(`
        SELECT * FROM accounts_payable
        WHERE due_date < ? AND status IN ('OPEN', 'PARTIAL')
        ORDER BY due_date ASC
      `)
      .all(now) as any[];

    return rows.map(row => this.mapToPayableData(row));
  }

  async getAgingReport(): Promise<any[]> {
    try {
      const now = new Date();
      const ranges = [
        { name: 'Current', days: 0 },
        { name: '1-30 Days', days: 30 },
        { name: '31-60 Days', days: 60 },
        { name: '61-90 Days', days: 90 },
        { name: 'Over 90 Days', days: 999 },
      ];

      const result: any[] = [];

      for (const range of ranges) {
        let sql = '';
        let params: any[] = [];

        if (range.name === 'Current') {
          sql = `
            SELECT
              supplier_id,
              s.name as supplier_name,
              SUM(balance) as total_balance
            FROM accounts_payable ap
            JOIN suppliers s ON ap.supplier_id = s.id
            WHERE status IN ('OPEN', 'PARTIAL') AND due_date >= ?
            GROUP BY supplier_id, s.name
            HAVING total_balance > 0
          `;
          params = [this.getDateDaysAgo(0)];
        } else if (range.name === '1-30 Days') {
          sql = `
            SELECT
              supplier_id,
              s.name as supplier_name,
              SUM(balance) as total_balance
            FROM accounts_payable ap
            JOIN suppliers s ON ap.supplier_id = s.id
            WHERE status IN ('OPEN', 'PARTIAL') AND due_date < ? AND due_date >= ?
            GROUP BY supplier_id, s.name
            HAVING total_balance > 0
          `;
          params = [this.getDateDaysAgo(1), this.getDateDaysAgo(30)];
        } else if (range.name === '31-60 Days') {
          sql = `
            SELECT
              supplier_id,
              s.name as supplier_name,
              SUM(balance) as total_balance
            FROM accounts_payable ap
            JOIN suppliers s ON ap.supplier_id = s.id
            WHERE status IN ('OPEN', 'PARTIAL') AND due_date < ? AND due_date >= ?
            GROUP BY supplier_id, s.name
            HAVING total_balance > 0
          `;
          params = [this.getDateDaysAgo(31), this.getDateDaysAgo(60)];
        } else if (range.name === '61-90 Days') {
          sql = `
            SELECT
              supplier_id,
              s.name as supplier_name,
              SUM(balance) as total_balance
            FROM accounts_payable ap
            JOIN suppliers s ON ap.supplier_id = s.id
            WHERE status IN ('OPEN', 'PARTIAL') AND due_date < ? AND due_date >= ?
            GROUP BY supplier_id, s.name
            HAVING total_balance > 0
          `;
          params = [this.getDateDaysAgo(61), this.getDateDaysAgo(90)];
        } else if (range.name === 'Over 90 Days') {
          sql = `
            SELECT
              supplier_id,
              s.name as supplier_name,
              SUM(balance) as total_balance
            FROM accounts_payable ap
            JOIN suppliers s ON ap.supplier_id = s.id
            WHERE status IN ('OPEN', 'PARTIAL') AND due_date < ?
            GROUP BY supplier_id, s.name
            HAVING total_balance > 0
          `;
          params = [this.getDateDaysAgo(91)];
        }

        const rows = this.db.prepare(sql).all(...params) as any[];

        for (const row of rows) {
          result.push({
            supplier_id: row.supplier_id,
            supplier_name: row.supplier_name,
            aging_period: range.name,
            balance: row.total_balance,
          });
        }
      }

      return result;
    } catch (error) {
      logger.error('Error getting aging report', error);
      throw new DatabaseError('Failed to get aging report', error as Error);
    }
  }

  private getDateDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString();
  }

  async getSummary(): Promise<any> {
    try {
      const row = this.db
        .prepare(`
          SELECT
            COUNT(*) as total_payables,
            SUM(CASE WHEN status IN ('OPEN', 'PARTIAL') THEN balance ELSE 0 END) as total_outstanding,
            SUM(CASE WHEN status = 'PAID' THEN debit_amount ELSE 0 END) as total_paid,
            SUM(CASE WHEN status IN ('OPEN', 'PARTIAL') AND due_date < date('now') THEN balance ELSE 0 END) as overdue_amount
          FROM accounts_payable
        `)
        .get() as any;

      return {
        total_payables: row.total_payables || 0,
        total_outstanding: row.total_outstanding || 0,
        total_paid: row.total_paid || 0,
        overdue_amount: row.overdue_amount || 0,
      };
    } catch (error) {
      logger.error('Error getting accounts payable summary', error);
      throw error;
    }
  }

  private mapToPayableData(row: any): PayableData {
    const balance = (row.credit_amount || 0) - (row.debit_amount || 0);
    return {
      id: row.id,
      supplier_id: row.supplier_id,
      reference_id: row.reference_id,
      transaction_date: row.transaction_date,
      debit_amount: row.debit_amount,
      credit_amount: row.credit_amount,
      balance: balance > 0 ? balance : 0,
      due_date: row.due_date,
      status: row.status,
      notes: row.notes,
    };
  }
}

export default AccountsPayableService;
