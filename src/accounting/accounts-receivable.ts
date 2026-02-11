import Database from 'better-sqlite3';
import { generateId, getCurrentTimestamp, ValidationError, NotFoundError, BusinessLogicError, DatabaseError } from '../utils/helpers';
import { Logger } from '../utils/logger';

const logger = new Logger('AccountsReceivableService');

export interface ReceivableData {
  id?: string;
  customer_id: string;
  invoice_id: string;
  transaction_date: string;
  debit_amount: number;
  credit_amount: number;
  balance?: number;
  due_date: string;
  status?: 'OPEN' | 'PARTIAL' | 'PAID' | 'OVERDUE';
  notes?: string;
}

export interface PaymentData {
  receivable_id: string;
  payment_date: string;
  amount: number;
  payment_method?: string;
  reference?: string;
  notes?: string;
}

export interface ReceivableQuery {
  customer_id?: string;
  invoice_id?: string;
  status?: string;
  due_start?: string;
  due_end?: string;
  limit?: number;
  offset?: number;
}

export class AccountsReceivableService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  async create(data: ReceivableData): Promise<string> {
    try {
      const customer = this.db
        .prepare('SELECT id FROM customers WHERE id = ?')
        .get(data.customer_id);

      if (!customer) {
        throw new NotFoundError('Customer', data.customer_id);
      }

      const invoice = this.db
        .prepare('SELECT id FROM invoices WHERE id = ?')
        .get(data.invoice_id);

      if (!invoice) {
        throw new NotFoundError('Invoice', data.invoice_id);
      }

      const balance = data.debit_amount - data.credit_amount;

      const id = data.id || generateId();
      const now = getCurrentTimestamp();

      const stmt = this.db.prepare(`
        INSERT INTO accounts_receivable (
          id, customer_id, invoice_id, transaction_date, debit_amount,
          credit_amount, balance, due_date, status, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        data.customer_id,
        data.invoice_id,
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

      logger.info(`Accounts receivable created: ${id}`);
      return id;
    } catch (error) {
      logger.error('Error creating accounts receivable', error);
      if (error instanceof NotFoundError) {
        throw error;
      }
      throw new DatabaseError('Failed to create accounts receivable', error as Error);
    }
  }

  async applyPayment(data: PaymentData): Promise<string> {
    try {
      const receivable = this.db
        .prepare('SELECT * FROM accounts_receivable WHERE id = ?')
        .get(data.receivable_id) as any;

      if (!receivable) {
        throw new NotFoundError('Accounts Receivable', data.receivable_id);
      }

      if (receivable.status === 'PAID') {
        throw new BusinessLogicError('Receivable is already paid');
      }

      if (data.amount <= 0) {
        throw new ValidationError('Payment amount must be greater than 0');
      }

      if (data.amount > receivable.balance) {
        throw new ValidationError('Payment amount cannot exceed balance');
      }

      const newCreditAmount = receivable.credit_amount + data.amount;
      const newBalance = receivable.balance - data.amount;
      const newStatus = newBalance === 0 ? 'PAID' : 'PARTIAL';

      this.db.prepare('BEGIN TRANSACTION').run();

      try {
        const paymentStmt = this.db.prepare(`
          INSERT INTO accounts_receivable (
            id, customer_id, invoice_id, transaction_date, debit_amount,
            credit_amount, balance, due_date, status, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        paymentStmt.run(
          generateId(),
          receivable.customer_id,
          receivable.invoice_id,
          data.payment_date,
          0,
          data.amount,
          newBalance,
          receivable.due_date,
          newStatus,
          `Payment: ${data.notes || data.payment_method || ''} ${data.reference || ''}`,
          getCurrentTimestamp(),
          getCurrentTimestamp()
        );

        this.db.prepare(`
          UPDATE accounts_receivable
          SET credit_amount = ?, balance = ?, status = ?, updated_at = ?
          WHERE id = ?
        `).run(newCreditAmount, newBalance, newStatus, getCurrentTimestamp(), data.receivable_id);

        // Update invoice status based on payment
        if (receivable.invoice_id) {
          const invoice = this.db.prepare('SELECT paid_amount, total_amount FROM invoices WHERE id = ?').get(receivable.invoice_id) as any;
          if (invoice) {
            const newPaidAmount = (invoice.paid_amount || 0) + data.amount;
            const invoiceStatus = newPaidAmount >= invoice.total_amount ? 'PAID' : (newPaidAmount > 0 ? 'PARTIAL' : 'PENDING');
            this.db.prepare(`
              UPDATE invoices
              SET paid_amount = ?, status = ?, updated_at = ?
              WHERE id = ?
            `).run(newPaidAmount, invoiceStatus, getCurrentTimestamp(), receivable.invoice_id);
          }
        }

        this.db.prepare('COMMIT').run();

        logger.info(`Payment applied: ${data.receivable_id}`);
        return data.receivable_id;
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

  async findById(id: string): Promise<ReceivableData | null> {
    try {
      const row = this.db
        .prepare('SELECT * FROM accounts_receivable WHERE id = ?')
        .get(id) as any;

      if (!row) {
        return null;
      }

      return this.mapToReceivableData(row);
    } catch (error) {
      logger.error('Error finding accounts receivable', error);
      throw new DatabaseError('Failed to find accounts receivable', error as Error);
    }
  }

  async findAll(query: ReceivableQuery = {}): Promise<ReceivableData[]> {
    try {
      const conditions: string[] = ['1 = 1'];
      const params: any[] = [];

      if (query.customer_id) {
        conditions.push('customer_id = ?');
        params.push(query.customer_id);
      }

      if (query.invoice_id) {
        conditions.push('invoice_id = ?');
        params.push(query.invoice_id);
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

      let sql = `SELECT * FROM accounts_receivable WHERE ${conditions.join(' AND ')} ORDER BY transaction_date DESC`;

      if (query.limit) {
        sql += ' LIMIT ?';
        params.push(query.limit);
        if (query.offset) {
          sql += ' OFFSET ?';
          params.push(query.offset);
        }
      }

      const rows = this.db.prepare(sql).all(...params) as any[];
      return rows.map(row => this.mapToReceivableData(row));
    } catch (error) {
      logger.error('Error finding accounts receivable', error);
      throw new DatabaseError('Failed to find accounts receivable', error as Error);
    }
  }

  async count(query: ReceivableQuery = {}): Promise<number> {
    try {
      const conditions: string[] = ['1 = 1'];
      const params: any[] = [];

      if (query.customer_id) {
        conditions.push('customer_id = ?');
        params.push(query.customer_id);
      }

      if (query.invoice_id) {
        conditions.push('invoice_id = ?');
        params.push(query.invoice_id);
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

      const sql = `SELECT COUNT(*) as count FROM accounts_receivable WHERE ${conditions.join(' AND ')}`;

      const row = this.db.prepare(sql).get(...params) as { count: number };
      return row.count;
    } catch (error) {
      logger.error('Error counting accounts receivable', error);
      throw new DatabaseError('Failed to count accounts receivable', error as Error);
    }
  }

  async getCustomerReceivables(customerId: string): Promise<ReceivableData[]> {
    return this.findAll({ customer_id: customerId });
  }

  async getOverdueReceivables(): Promise<ReceivableData[]> {
    const now = getCurrentTimestamp();
    const rows = this.db
      .prepare(`
        SELECT * FROM accounts_receivable
        WHERE due_date < ? AND status IN ('OPEN', 'PARTIAL')
        ORDER BY due_date ASC
      `)
      .all(now) as any[];

    return rows.map(row => this.mapToReceivableData(row));
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
              customer_id,
              c.name as customer_name,
              SUM(balance) as total_balance
            FROM accounts_receivable ar
            JOIN customers c ON ar.customer_id = c.id
            WHERE status IN ('OPEN', 'PARTIAL') AND due_date >= ?
            GROUP BY customer_id, c.name
            HAVING total_balance > 0
          `;
          params = [this.getDateDaysAgo(0)];
        } else if (range.name === '1-30 Days') {
          sql = `
            SELECT
              customer_id,
              c.name as customer_name,
              SUM(balance) as total_balance
            FROM accounts_receivable ar
            JOIN customers c ON ar.customer_id = c.id
            WHERE status IN ('OPEN', 'PARTIAL') AND due_date < ? AND due_date >= ?
            GROUP BY customer_id, c.name
            HAVING total_balance > 0
          `;
          params = [this.getDateDaysAgo(1), this.getDateDaysAgo(30)];
        } else if (range.name === '31-60 Days') {
          sql = `
            SELECT
              customer_id,
              c.name as customer_name,
              SUM(balance) as total_balance
            FROM accounts_receivable ar
            JOIN customers c ON ar.customer_id = c.id
            WHERE status IN ('OPEN', 'PARTIAL') AND due_date < ? AND due_date >= ?
            GROUP BY customer_id, c.name
            HAVING total_balance > 0
          `;
          params = [this.getDateDaysAgo(31), this.getDateDaysAgo(60)];
        } else if (range.name === '61-90 Days') {
          sql = `
            SELECT
              customer_id,
              c.name as customer_name,
              SUM(balance) as total_balance
            FROM accounts_receivable ar
            JOIN customers c ON ar.customer_id = c.id
            WHERE status IN ('OPEN', 'PARTIAL') AND due_date < ? AND due_date >= ?
            GROUP BY customer_id, c.name
            HAVING total_balance > 0
          `;
          params = [this.getDateDaysAgo(61), this.getDateDaysAgo(90)];
        } else if (range.name === 'Over 90 Days') {
          sql = `
            SELECT
              customer_id,
              c.name as customer_name,
              SUM(balance) as total_balance
            FROM accounts_receivable ar
            JOIN customers c ON ar.customer_id = c.id
            WHERE status IN ('OPEN', 'PARTIAL') AND due_date < ?
            GROUP BY customer_id, c.name
            HAVING total_balance > 0
          `;
          params = [this.getDateDaysAgo(91)];
        }

        const rows = this.db.prepare(sql).all(...params) as any[];

        for (const row of rows) {
          result.push({
            customer_id: row.customer_id,
            customer_name: row.customer_name,
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
            COUNT(*) as total_receivables,
            SUM(CASE WHEN status IN ('OPEN', 'PARTIAL') THEN balance ELSE 0 END) as total_outstanding,
            SUM(CASE WHEN status = 'PAID' THEN credit_amount ELSE 0 END) as total_collected,
            SUM(CASE WHEN status IN ('OPEN', 'PARTIAL') AND due_date < date('now') THEN balance ELSE 0 END) as overdue_amount
          FROM accounts_receivable
        `)
        .get() as any;

      return {
        total_receivables: row.total_receivables || 0,
        total_outstanding: row.total_outstanding || 0,
        total_collected: row.total_collected || 0,
        overdue_amount: row.overdue_amount || 0,
      };
    } catch (error) {
      logger.error('Error getting accounts receivable summary', error);
      throw error;
    }
  }

  private mapToReceivableData(row: any): ReceivableData {
    const balance = (row.debit_amount || 0) - (row.credit_amount || 0);
    return {
      id: row.id,
      customer_id: row.customer_id,
      invoice_id: row.invoice_id,
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

export default AccountsReceivableService;
