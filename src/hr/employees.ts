import Database from 'better-sqlite3';
import { generateId, generateCode, getCurrentTimestamp, ValidationError, NotFoundError, BusinessLogicError, DatabaseError } from '../utils/helpers';
import { Logger } from '../utils/logger';

const logger = new Logger('EmployeesService');

export interface EmployeeData {
  id?: string;
  code: string;
  name: string;
  email: string;
  phone?: string;
  department: string;
  position: string;
  hire_date: string;
  birth_date?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  address?: string;
  bank_name?: string;
  bank_account?: string;
  is_active?: boolean;
}

export interface UpdateEmployeeData {
  name?: string;
  email?: string;
  phone?: string;
  department?: string;
  position?: string;
  birth_date?: string;
  gender?: 'MALE' | 'FEMALE' | 'OTHER';
  address?: string;
  bank_name?: string;
  bank_account?: string;
  is_active?: boolean;
}

export interface EmployeeQuery {
  department?: string;
  position?: string;
  is_active?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export class EmployeesService {
  private db: Database.Database;
  private codeCounter: number = 1;

  constructor(db: Database.Database) {
    this.db = db;
    this.initializeCodeCounter();
  }

  private initializeCodeCounter(): void {
    const row = this.db
      .prepare('SELECT MAX(code) as max_code FROM employees')
      .get() as { max_code: string | null };

    if (row && row.max_code) {
      const match = row.max_code.match(/EMP(\d+)/);
      if (match) {
        this.codeCounter = parseInt(match[1], 10) + 1;
      }
    }
  }

  private getNextCode(): string {
    return generateCode('EMP', this.codeCounter++);
  }

  async validateEmployeeData(data: EmployeeData): Promise<void> {
    if (!data.name || data.name.trim().length === 0) {
      throw new ValidationError('Employee name is required');
    }

    if (!data.email || !this.isValidEmail(data.email)) {
      throw new ValidationError('Valid email is required');
    }

    if (!data.department || data.department.trim().length === 0) {
      throw new ValidationError('Department is required');
    }

    if (!data.position || data.position.trim().length === 0) {
      throw new ValidationError('Position is required');
    }

    if (!data.hire_date) {
      throw new ValidationError('Hire date is required');
    }

    if (data.gender && !['MALE', 'FEMALE', 'OTHER'].includes(data.gender)) {
      throw new ValidationError('Invalid gender');
    }

    const existing = this.db
      .prepare('SELECT id FROM employees WHERE code = ? AND id != ?')
      .get(data.code, data.id || '');

    if (existing) {
      throw new BusinessLogicError('Employee code already exists');
    }

    const existingEmail = this.db
      .prepare('SELECT id FROM employees WHERE email = ? AND id != ?')
      .get(data.email, data.id || '');

    if (existingEmail) {
      throw new BusinessLogicError('Email already exists');
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async create(data: EmployeeData): Promise<string> {
    try {
      await this.validateEmployeeData(data);

      const id = data.id || generateId();
      const code = data.code || this.getNextCode();
      const now = getCurrentTimestamp();

      const stmt = this.db.prepare(`
        INSERT INTO employees (
          id, code, name, email, phone, department, position,
          hire_date, birth_date, gender, address, bank_name,
          bank_account, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        code,
        data.name.trim(),
        data.email.trim(),
        data.phone || null,
        data.department.trim(),
        data.position.trim(),
        data.hire_date,
        data.birth_date || null,
        data.gender || null,
        data.address || null,
        data.bank_name || null,
        data.bank_account || null,
        data.is_active !== undefined ? data.is_active ? 1 : 0 : 1,
        now,
        now
      );

      logger.info(`Employee created: ${id}`);
      return id;
    } catch (error) {
      logger.error('Error creating employee', error);
      if (error instanceof ValidationError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to create employee', error as Error);
    }
  }

  async update(id: string, data: UpdateEmployeeData): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError('Employee', id);
      }

      const updates: string[] = [];
      const values: any[] = [];

      if (data.name !== undefined) {
        updates.push('name = ?');
        values.push(data.name.trim());
      }
      if (data.email !== undefined) {
        if (!this.isValidEmail(data.email)) {
          throw new ValidationError('Invalid email format');
        }
        const existingEmail = this.db
          .prepare('SELECT id FROM employees WHERE email = ? AND id != ?')
          .get(data.email, id);
        if (existingEmail) {
          throw new BusinessLogicError('Email already exists');
        }
        updates.push('email = ?');
        values.push(data.email.trim());
      }
      if (data.phone !== undefined) {
        updates.push('phone = ?');
        values.push(data.phone);
      }
      if (data.department !== undefined) {
        updates.push('department = ?');
        values.push(data.department.trim());
      }
      if (data.position !== undefined) {
        updates.push('position = ?');
        values.push(data.position.trim());
      }
      if (data.birth_date !== undefined) {
        updates.push('birth_date = ?');
        values.push(data.birth_date);
      }
      if (data.gender !== undefined) {
        if (!['MALE', 'FEMALE', 'OTHER'].includes(data.gender)) {
          throw new ValidationError('Invalid gender');
        }
        updates.push('gender = ?');
        values.push(data.gender);
      }
      if (data.address !== undefined) {
        updates.push('address = ?');
        values.push(data.address);
      }
      if (data.bank_name !== undefined) {
        updates.push('bank_name = ?');
        values.push(data.bank_name);
      }
      if (data.bank_account !== undefined) {
        updates.push('bank_account = ?');
        values.push(data.bank_account);
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
        UPDATE employees SET ${updates.join(', ')} WHERE id = ?
      `);

      stmt.run(...values);

      logger.info(`Employee updated: ${id}`);
    } catch (error) {
      logger.error('Error updating employee', error);
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to update employee', error as Error);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError('Employee', id);
      }

      const hasPayroll = this.db
        .prepare('SELECT COUNT(*) as count FROM payroll WHERE employee_id = ?')
        .get(id) as { count: number };

      if (hasPayroll.count > 0) {
        throw new BusinessLogicError('Cannot delete employee with payroll records');
      }

      const stmt = this.db.prepare('DELETE FROM employees WHERE id = ?');
      stmt.run(id);

      logger.info(`Employee deleted: ${id}`);
    } catch (error) {
      logger.error('Error deleting employee', error);
      if (error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to delete employee', error as Error);
    }
  }

  async findById(id: string): Promise<EmployeeData | null> {
    try {
      const row = this.db
        .prepare('SELECT * FROM employees WHERE id = ?')
        .get(id) as any;

      if (!row) {
        return null;
      }

      return this.mapToEmployeeData(row);
    } catch (error) {
      logger.error('Error finding employee', error);
      throw new DatabaseError('Failed to find employee', error as Error);
    }
  }

  async findByCode(code: string): Promise<EmployeeData | null> {
    try {
      const row = this.db
        .prepare('SELECT * FROM employees WHERE code = ?')
        .get(code) as any;

      if (!row) {
        return null;
      }

      return this.mapToEmployeeData(row);
    } catch (error) {
      logger.error('Error finding employee by code', error);
      throw new DatabaseError('Failed to find employee by code', error as Error);
    }
  }

  async findAll(query: EmployeeQuery = {}): Promise<EmployeeData[]> {
    try {
      const conditions: string[] = ['1 = 1'];
      const params: any[] = [];

      if (query.department) {
        conditions.push('department = ?');
        params.push(query.department);
      }

      if (query.position) {
        conditions.push('position = ?');
        params.push(query.position);
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

      let sql = `SELECT * FROM employees WHERE ${conditions.join(' AND ')} ORDER BY code`;

      if (query.limit) {
        sql += ' LIMIT ?';
        params.push(query.limit);
        if (query.offset) {
          sql += ' OFFSET ?';
          params.push(query.offset);
        }
      }

      const rows = this.db.prepare(sql).all(...params) as any[];
      return rows.map(row => this.mapToEmployeeData(row));
    } catch (error) {
      logger.error('Error finding employees', error);
      throw new DatabaseError('Failed to find employees', error as Error);
    }
  }

  async count(query: EmployeeQuery = {}): Promise<number> {
    try {
      const conditions: string[] = ['1 = 1'];
      const params: any[] = [];

      if (query.department) {
        conditions.push('department = ?');
        params.push(query.department);
      }

      if (query.position) {
        conditions.push('position = ?');
        params.push(query.position);
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

      const sql = `SELECT COUNT(*) as count FROM employees WHERE ${conditions.join(' AND ')}`;

      const row = this.db.prepare(sql).get(...params) as { count: number };
      return row.count;
    } catch (error) {
      logger.error('Error counting employees', error);
      throw new DatabaseError('Failed to count employees', error as Error);
    }
  }

  async getDepartments(): Promise<string[]> {
    try {
      const rows = this.db
        .prepare('SELECT DISTINCT department FROM employees WHERE is_active = 1 ORDER BY department')
        .all() as any[];

      return rows.map(row => row.department);
    } catch (error) {
      logger.error('Error getting departments', error);
      throw new DatabaseError('Failed to get departments', error as Error);
    }
  }

  async getPositions(): Promise<string[]> {
    try {
      const rows = this.db
        .prepare('SELECT DISTINCT position FROM employees WHERE is_active = 1 ORDER BY position')
        .all() as any[];

      return rows.map(row => row.position);
    } catch (error) {
      logger.error('Error getting positions', error);
      throw new DatabaseError('Failed to get positions', error as Error);
    }
  }

  private mapToEmployeeData(row: any): EmployeeData {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      email: row.email,
      phone: row.phone,
      department: row.department,
      position: row.position,
      hire_date: row.hire_date,
      birth_date: row.birth_date,
      gender: row.gender,
      address: row.address,
      bank_name: row.bank_name,
      bank_account: row.bank_account,
      is_active: row.is_active === 1,
    };
  }
}

export default EmployeesService;
