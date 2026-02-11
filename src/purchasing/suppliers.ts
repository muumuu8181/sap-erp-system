import Database from 'better-sqlite3';
import { generateId, generateCode, getCurrentTimestamp, ValidationError, NotFoundError, BusinessLogicError, DatabaseError } from '../utils/helpers';
import { Logger } from '../utils/logger';

const logger = new Logger('SuppliersService');

export interface SupplierData {
  id?: string;
  code: string;
  name: string;
  category: string;
  payment_term: number;
  tax_id?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  country?: string;
  is_active?: boolean;
}

export interface UpdateSupplierData {
  name?: string;
  category?: string;
  payment_term?: number;
  tax_id?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  country?: string;
  is_active?: boolean;
}

export interface SupplierQuery {
  category?: string;
  is_active?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export class SuppliersService {
  private db: Database.Database;
  private codeCounter: number = 1;

  constructor(db: Database.Database) {
    this.db = db;
    this.initializeCodeCounter();
  }

  private initializeCodeCounter(): void {
    const row = this.db
      .prepare('SELECT MAX(code) as max_code FROM suppliers')
      .get() as { max_code: string | null };

    if (row && row.max_code) {
      const match = row.max_code.match(/SUP(\d+)/);
      if (match) {
        this.codeCounter = parseInt(match[1], 10) + 1;
      }
    }
  }

  private getNextCode(): string {
    return generateCode('SUP', this.codeCounter++);
  }

  async validateSupplierData(data: SupplierData): Promise<void> {
    if (!data.name || data.name.trim().length === 0) {
      throw new ValidationError('Supplier name is required');
    }

    if (!data.category || data.category.trim().length === 0) {
      throw new ValidationError('Supplier category is required');
    }

    if (!data.payment_term || data.payment_term < 0) {
      throw new ValidationError('Valid payment term is required');
    }

    if (data.email && !this.isValidEmail(data.email)) {
      throw new ValidationError('Invalid email format');
    }

    const existing = this.db
      .prepare('SELECT id FROM suppliers WHERE code = ?')
      .get(data.code) as { id: string } | undefined;

    if (existing && existing.id !== data.id) {
      throw new BusinessLogicError('Supplier code already exists');
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async create(data: SupplierData): Promise<string> {
    try {
      await this.validateSupplierData(data);

      const id = data.id || generateId();
      const code = data.code || this.getNextCode();
      const now = getCurrentTimestamp();

      const stmt = this.db.prepare(`
        INSERT INTO suppliers (
          id, code, name, category, payment_term, tax_id,
          email, phone, address, city, postal_code, country,
          is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        code,
        data.name.trim(),
        data.category.trim(),
        data.payment_term,
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

      logger.info(`Supplier created: ${id}`);
      return id;
    } catch (error) {
      logger.error('Error creating supplier', error);
      if (error instanceof ValidationError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to create supplier', error as Error);
    }
  }

  async update(id: string, data: UpdateSupplierData): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError('Supplier', id);
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
        UPDATE suppliers SET ${updates.join(', ')} WHERE id = ?
      `);

      stmt.run(...values);

      logger.info(`Supplier updated: ${id}`);
    } catch (error) {
      logger.error('Error updating supplier', error);
      if (error instanceof ValidationError || error instanceof NotFoundError) {
        throw error;
      }
      throw new DatabaseError('Failed to update supplier', error as Error);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError('Supplier', id);
      }

      const hasOrders = this.db
        .prepare('SELECT COUNT(*) as count FROM purchase_orders WHERE supplier_id = ?')
        .get(id) as { count: number };

      if (hasOrders.count > 0) {
        throw new BusinessLogicError('Cannot delete supplier with existing orders');
      }

      const stmt = this.db.prepare('DELETE FROM suppliers WHERE id = ?');
      stmt.run(id);

      logger.info(`Supplier deleted: ${id}`);
    } catch (error) {
      logger.error('Error deleting supplier', error);
      if (error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to delete supplier', error as Error);
    }
  }

  async findById(id: string): Promise<SupplierData | null> {
    try {
      const row = this.db
        .prepare('SELECT * FROM suppliers WHERE id = ?')
        .get(id) as any;

      if (!row) {
        return null;
      }

      return this.mapToSupplierData(row);
    } catch (error) {
      logger.error('Error finding supplier', error);
      throw new DatabaseError('Failed to find supplier', error as Error);
    }
  }

  async findByCode(code: string): Promise<SupplierData | null> {
    try {
      const row = this.db
        .prepare('SELECT * FROM suppliers WHERE code = ?')
        .get(code) as any;

      if (!row) {
        return null;
      }

      return this.mapToSupplierData(row);
    } catch (error) {
      logger.error('Error finding supplier by code', error);
      throw new DatabaseError('Failed to find supplier by code', error as Error);
    }
  }

  async findAll(query: SupplierQuery = {}): Promise<SupplierData[]> {
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

      let sql = `SELECT * FROM suppliers WHERE ${conditions.join(' AND ')} ORDER BY code`;

      if (query.limit) {
        sql += ' LIMIT ?';
        params.push(query.limit);
        if (query.offset) {
          sql += ' OFFSET ?';
          params.push(query.offset);
        }
      }

      const rows = this.db.prepare(sql).all(...params) as any[];
      return rows.map(row => this.mapToSupplierData(row));
    } catch (error) {
      logger.error('Error finding suppliers', error);
      throw new DatabaseError('Failed to find suppliers', error as Error);
    }
  }

  async count(query: SupplierQuery = {}): Promise<number> {
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

      const sql = `SELECT COUNT(*) as count FROM suppliers WHERE ${conditions.join(' AND ')}`;

      const row = this.db.prepare(sql).get(...params) as { count: number };
      return row.count;
    } catch (error) {
      logger.error('Error counting suppliers', error);
      throw new DatabaseError('Failed to count suppliers', error as Error);
    }
  }

  private mapToSupplierData(row: any): SupplierData {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      category: row.category,
      payment_term: row.payment_term,
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

  async getSupplierStats(id: string): Promise<any> {
    try {
      const supplier = await this.findById(id);
      if (!supplier) {
        throw new NotFoundError('Supplier', id);
      }

      const totalOrders = this.db
        .prepare('SELECT COUNT(*) as count FROM purchase_orders WHERE supplier_id = ?')
        .get(id) as { count: number };

      const outstandingBalance = this.db
        .prepare(`
          SELECT COALESCE(SUM(balance), 0) as balance
          FROM accounts_payable
          WHERE supplier_id = ? AND status = 'OPEN'
        `)
        .get(id) as { balance: number };

      return {
        supplier,
        totalOrders: totalOrders.count,
        outstandingBalance: outstandingBalance.balance,
      };
    } catch (error) {
      logger.error('Error getting supplier stats', error);
      if (error instanceof NotFoundError) {
        throw error;
      }
      throw new DatabaseError('Failed to get supplier stats', error as Error);
    }
  }
}

export default SuppliersService;
