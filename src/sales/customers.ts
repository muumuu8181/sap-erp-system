import Database from 'better-sqlite3';
import { generateId, generateCode, getCurrentTimestamp, ValidationError, NotFoundError, BusinessLogicError, DatabaseError } from '../utils/helpers';
import { Logger } from '../utils/logger';

const logger = new Logger('CustomersService');

export interface CustomerData {
  id?: string;
  code: string;
  name: string;
  category: string;
  payment_term: number;
  credit_limit?: number;
  tax_id?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  country?: string;
  is_active?: boolean;
}

export interface UpdateCustomerData {
  name?: string;
  category?: string;
  payment_term?: number;
  credit_limit?: number;
  tax_id?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  country?: string;
  is_active?: boolean;
}

export interface CustomerQuery {
  category?: string;
  is_active?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export class CustomersService {
  private db: Database.Database;
  private codeCounter: number = 1;

  constructor(db: Database.Database) {
    this.db = db;
    this.initializeCodeCounter();
  }

  private initializeCodeCounter(): void {
    const row = this.db
      .prepare('SELECT MAX(code) as max_code FROM customers')
      .get() as { max_code: string | null };

    if (row && row.max_code) {
      const match = row.max_code.match(/CUS(\d+)/);
      if (match) {
        this.codeCounter = parseInt(match[1], 10) + 1;
      }
    }
  }

  private getNextCode(): string {
    return generateCode('CUS', this.codeCounter++);
  }

  async validateCustomerData(data: CustomerData): Promise<void> {
    if (!data.name || data.name.trim().length === 0) {
      throw new ValidationError('Customer name is required');
    }

    if (!data.category || data.category.trim().length === 0) {
      throw new ValidationError('Customer category is required');
    }

    if (!data.payment_term || data.payment_term < 0) {
      throw new ValidationError('Valid payment term is required');
    }

    if (data.credit_limit !== undefined && data.credit_limit < 0) {
      throw new ValidationError('Credit limit cannot be negative');
    }

    if (data.email && !this.isValidEmail(data.email)) {
      throw new ValidationError('Invalid email format');
    }

    const existing = this.db
      .prepare('SELECT id FROM customers WHERE code = ?')
      .get(data.code) as { id: string } | undefined;

    if (existing && existing.id !== data.id) {
      throw new BusinessLogicError('Customer code already exists');
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async create(data: CustomerData): Promise<string> {
    try {
      await this.validateCustomerData(data);

      const id = data.id || generateId();
      const code = data.code || this.getNextCode();
      const now = getCurrentTimestamp();

      const stmt = this.db.prepare(`
        INSERT INTO customers (
          id, code, name, category, payment_term, credit_limit,
          tax_id, email, phone, address, city, postal_code, country,
          is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        code,
        data.name.trim(),
        data.category.trim(),
        data.payment_term,
        data.credit_limit || 0,
        data.tax_id || null,
        data.email || null,
        data.phone || null,
        data.address || null,
        data.city || null,
        data.postal_code || null,
        data.country || 'JP',
        data.is_active !== undefined ? data.is_active ? 1 : 0 : 1,
        now,
        now
      );

      logger.info(`Customer created: ${id}`);
      return id;
    } catch (error) {
      logger.error('Error creating customer', error);
      if (error instanceof ValidationError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to create customer', error as Error);
    }
  }

  async update(id: string, data: UpdateCustomerData): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError('Customer', id);
      }

      const updates: string[] = [];
      const values: any[] = [];

      if (data.name !== undefined) {
        updates.push('name = ?');
        values.push(data.name.trim());
      }
      if (data.category !== undefined) {
        updates.push('category = ?');
        values.push(data.category.trim());
      }
      if (data.payment_term !== undefined) {
        if (data.payment_term < 0) {
          throw new ValidationError('Payment term cannot be negative');
        }
        updates.push('payment_term = ?');
        values.push(data.payment_term);
      }
      if (data.credit_limit !== undefined) {
        if (data.credit_limit < 0) {
          throw new ValidationError('Credit limit cannot be negative');
        }
        updates.push('credit_limit = ?');
        values.push(data.credit_limit);
      }
      if (data.tax_id !== undefined) {
        updates.push('tax_id = ?');
        values.push(data.tax_id);
      }
      if (data.email !== undefined) {
        if (data.email && !this.isValidEmail(data.email)) {
          throw new ValidationError('Invalid email format');
        }
        updates.push('email = ?');
        values.push(data.email);
      }
      if (data.phone !== undefined) {
        updates.push('phone = ?');
        values.push(data.phone);
      }
      if (data.address !== undefined) {
        updates.push('address = ?');
        values.push(data.address);
      }
      if (data.city !== undefined) {
        updates.push('city = ?');
        values.push(data.city);
      }
      if (data.postal_code !== undefined) {
        updates.push('postal_code = ?');
        values.push(data.postal_code);
      }
      if (data.country !== undefined) {
        updates.push('country = ?');
        values.push(data.country);
      }
      if (data.is_active !== undefined) {
        updates.push('is_active = ?');
        values.push(data.is_active ? 1 : 0);
      }

      if (updates.length === 0) {
        return;
      }

      updates.push('updated_at = ?');
      values.push(getCurrentTimestamp());
      values.push(id);

      const stmt = this.db.prepare(`
        UPDATE customers SET ${updates.join(', ')} WHERE id = ?
      `);

      stmt.run(...values);

      logger.info(`Customer updated: ${id}`);
    } catch (error) {
      logger.error('Error updating customer', error);
      if (error instanceof ValidationError || error instanceof NotFoundError) {
        throw error;
      }
      throw new DatabaseError('Failed to update customer', error as Error);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError('Customer', id);
      }

      const hasOrders = this.db
        .prepare('SELECT COUNT(*) as count FROM sales_orders WHERE customer_id = ?')
        .get(id) as { count: number };

      if (hasOrders.count > 0) {
        throw new BusinessLogicError('Cannot delete customer with existing orders');
      }

      const stmt = this.db.prepare('DELETE FROM customers WHERE id = ?');
      stmt.run(id);

      logger.info(`Customer deleted: ${id}`);
    } catch (error) {
      logger.error('Error deleting customer', error);
      if (error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to delete customer', error as Error);
    }
  }

  async findById(id: string): Promise<CustomerData | null> {
    try {
      const row = this.db
        .prepare('SELECT * FROM customers WHERE id = ?')
        .get(id) as any;

      if (!row) {
        return null;
      }

      return this.mapToCustomerData(row);
    } catch (error) {
      logger.error('Error finding customer', error);
      throw new DatabaseError('Failed to find customer', error as Error);
    }
  }

  async findByCode(code: string): Promise<CustomerData | null> {
    try {
      const row = this.db
        .prepare('SELECT * FROM customers WHERE code = ?')
        .get(code) as any;

      if (!row) {
        return null;
      }

      return this.mapToCustomerData(row);
    } catch (error) {
      logger.error('Error finding customer by code', error);
      throw new DatabaseError('Failed to find customer by code', error as Error);
    }
  }

  async findAll(query: CustomerQuery = {}): Promise<CustomerData[]> {
    try {
      const conditions: string[] = ['1 = 1'];
      const params: any[] = [];

      if (query.category) {
        conditions.push('category = ?');
        params.push(query.category);
      }

      if (query.is_active !== undefined) {
        conditions.push('is_active = ?');
        params.push(query.is_active ? 1 : 0);
      }

      if (query.search) {
        conditions.push('(name LIKE ? OR code LIKE ? OR email LIKE ?)');
        const searchTerm = `%${query.search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }

      let sql = `SELECT * FROM customers WHERE ${conditions.join(' AND ')} ORDER BY code`;

      if (query.limit) {
        sql += ' LIMIT ?';
        params.push(query.limit);
        if (query.offset) {
          sql += ' OFFSET ?';
          params.push(query.offset);
        }
      }

      const rows = this.db.prepare(sql).all(...params) as any[];
      return rows.map(row => this.mapToCustomerData(row));
    } catch (error) {
      logger.error('Error finding customers', error);
      throw new DatabaseError('Failed to find customers', error as Error);
    }
  }

  async count(query: CustomerQuery = {}): Promise<number> {
    try {
      const conditions: string[] = ['1 = 1'];
      const params: any[] = [];

      if (query.category) {
        conditions.push('category = ?');
        params.push(query.category);
      }

      if (query.is_active !== undefined) {
        conditions.push('is_active = ?');
        params.push(query.is_active ? 1 : 0);
      }

      if (query.search) {
        conditions.push('(name LIKE ? OR code LIKE ? OR email LIKE ?)');
        const searchTerm = `%${query.search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
      }

      const sql = `SELECT COUNT(*) as count FROM customers WHERE ${conditions.join(' AND ')}`;

      const row = this.db.prepare(sql).get(...params) as { count: number };
      return row.count;
    } catch (error) {
      logger.error('Error counting customers', error);
      throw new DatabaseError('Failed to count customers', error as Error);
    }
  }

  private mapToCustomerData(row: any): CustomerData {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      category: row.category,
      payment_term: row.payment_term,
      credit_limit: row.credit_limit,
      tax_id: row.tax_id,
      email: row.email,
      phone: row.phone,
      address: row.address,
      city: row.city,
      postal_code: row.postal_code,
      country: row.country,
      is_active: row.is_active === 1,
    };
  }

  async getCustomerStats(id: string): Promise<any> {
    try {
      const customer = await this.findById(id);
      if (!customer) {
        throw new NotFoundError('Customer', id);
      }

      const totalOrders = this.db
        .prepare('SELECT COUNT(*) as count FROM sales_orders WHERE customer_id = ?')
        .get(id) as { count: number };

      const totalInvoices = this.db
        .prepare('SELECT COUNT(*) as count FROM invoices WHERE customer_id = ?')
        .get(id) as { count: number };

      const outstandingBalance = this.db
        .prepare(`
          SELECT COALESCE(SUM(balance), 0) as balance
          FROM accounts_receivable
          WHERE customer_id = ? AND status = 'OPEN'
        `)
        .get(id) as { balance: number };

      return {
        customer,
        totalOrders: totalOrders.count,
        totalInvoices: totalInvoices.count,
        outstandingBalance: outstandingBalance.balance,
      };
    } catch (error) {
      logger.error('Error getting customer stats', error);
      if (error instanceof NotFoundError) {
        throw error;
      }
      throw new DatabaseError('Failed to get customer stats', error as Error);
    }
  }
}

export default CustomersService;
