import Database from 'better-sqlite3';
import { generateId, generateCode, getCurrentTimestamp, floorToDecimal, ValidationError, NotFoundError, BusinessLogicError, DatabaseError } from '../utils/helpers';
import { Logger } from '../utils/logger';

const logger = new Logger('PayrollService');

const HEALTH_INSURANCE_RATE = 0.05;
const PENSION_RATE = 0.045;
const UNEMPLOYMENT_INSURANCE_RATE = 0.003;
const INCOME_TAX_BRACKETS = [
  { max: 195000, rate: 0.05 },
  { max: 330000, rate: 0.10 },
  { max: 695000, rate: 0.20 },
  { max: 900000, rate: 0.23 },
  { max: 1800000, rate: 0.33 },
  { max: 4000000, rate: 0.40 },
  { max: Infinity, rate: 0.45 },
];

export interface PayrollData {
  id?: string;
  payroll_no?: string;
  employee_id: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  status?: 'DRAFT' | 'CALCULATED' | 'PAID' | 'CANCELLED';
  basic_salary: number;
  overtime_pay?: number;
  bonus?: number;
  allowances?: number;
  deductions?: number;
  tax_amount?: number;
  insurance_amount?: number;
  net_pay?: number;
  notes?: string;
}

export interface UpdatePayrollData {
  pay_date?: string;
  status?: 'DRAFT' | 'CALCULATED' | 'PAID' | 'CANCELLED';
  basic_salary?: number;
  overtime_pay?: number;
  bonus?: number;
  allowances?: number;
  deductions?: number;
  notes?: string;
}

export interface PayrollQuery {
  employee_id?: string;
  status?: string;
  period_start?: string;
  period_end?: string;
  limit?: number;
  offset?: number;
}

export class PayrollService {
  private db: Database.Database;
  private payrollCounter: number = 1;

  constructor(db: Database.Database) {
    this.db = db;
    this.initializePayrollCounter();
  }

  private initializePayrollCounter(): void {
    const row = this.db
      .prepare('SELECT MAX(payroll_no) as max_payroll FROM payroll')
      .get() as { max_payroll: string | null };

    if (row && row.max_payroll) {
      const match = row.max_payroll.match(/PR(\d+)/);
      if (match) {
        this.payrollCounter = parseInt(match[1], 10) + 1;
      }
    }
  }

  private getNextPayrollNo(): string {
    return generateCode('PR', this.payrollCounter++);
  }

  private calculateIncomeTax(taxableIncome: number): number {
    let tax = 0;
    let previousMax = 0;

    for (const bracket of INCOME_TAX_BRACKETS) {
      if (taxableIncome <= previousMax) {
        break;
      }

      const taxableInBracket = Math.min(taxableIncome, bracket.max) - previousMax;
      tax += taxableInBracket * bracket.rate;
      previousMax = bracket.max;
    }

    return floorToDecimal(tax);
  }

  private calculateSocialInsurance(grossSalary: number): number {
    const healthInsurance = grossSalary * HEALTH_INSURANCE_RATE;
    const pension = grossSalary * PENSION_RATE;
    const unemploymentInsurance = grossSalary * UNEMPLOYMENT_INSURANCE_RATE;
    return floorToDecimal(healthInsurance + pension + unemploymentInsurance);
  }

  private calculateNetPay(data: PayrollData): { taxAmount: number; insuranceAmount: number; netPay: number } {
    const grossSalary = data.basic_salary + (data.overtime_pay || 0) + (data.bonus || 0) + (data.allowances || 0);
    const taxAmount = this.calculateIncomeTax(grossSalary);
    const insuranceAmount = this.calculateSocialInsurance(grossSalary);
    const totalDeductions = taxAmount + insuranceAmount + (data.deductions || 0);
    const netPay = grossSalary - totalDeductions;

    return {
      taxAmount,
      insuranceAmount,
      netPay: Math.max(0, floorToDecimal(netPay)),
    };
  }

  async validatePayrollData(data: PayrollData): Promise<void> {
    if (!data.employee_id) {
      throw new ValidationError('Employee ID is required');
    }

    const employee = this.db
      .prepare('SELECT id, is_active FROM employees WHERE id = ?')
      .get(data.employee_id);

    if (!employee) {
      throw new NotFoundError('Employee', data.employee_id);
    }

    if (!(employee as any).is_active) {
      throw new BusinessLogicError('Employee is not active');
    }

    if (!data.period_start) {
      throw new ValidationError('Period start date is required');
    }

    if (!data.period_end) {
      throw new ValidationError('Period end date is required');
    }

    if (new Date(data.period_end) < new Date(data.period_start)) {
      throw new ValidationError('Period end date cannot be before period start date');
    }

    if (!data.pay_date) {
      throw new ValidationError('Pay date is required');
    }

    if (new Date(data.pay_date) < new Date(data.period_end)) {
      throw new ValidationError('Pay date cannot be before period end date');
    }

    if (data.basic_salary < 0) {
      throw new ValidationError('Basic salary cannot be negative');
    }

    if (data.overtime_pay !== undefined && data.overtime_pay < 0) {
      throw new ValidationError('Overtime pay cannot be negative');
    }

    if (data.bonus !== undefined && data.bonus < 0) {
      throw new ValidationError('Bonus cannot be negative');
    }

    if (data.allowances !== undefined && data.allowances < 0) {
      throw new ValidationError('Allowances cannot be negative');
    }

    if (data.deductions !== undefined && data.deductions < 0) {
      throw new ValidationError('Deductions cannot be negative');
    }

    const existing = this.db
      .prepare(`
        SELECT id FROM payroll
        WHERE employee_id = ? AND period_start = ? AND period_end = ?
        AND status != 'CANCELLED'
      `)
      .get(data.employee_id, data.period_start, data.period_end) as { id: string } | undefined;

    if (existing && existing.id !== data.id) {
      throw new BusinessLogicError('Payroll for this period already exists');
    }
  }

  async create(data: PayrollData): Promise<string> {
    try {
      await this.validatePayrollData(data);

      const { taxAmount, insuranceAmount, netPay } = this.calculateNetPay(data);

      const id = data.id || generateId();
      const payrollNo = data.payroll_no || this.getNextPayrollNo();
      const now = getCurrentTimestamp();

      const stmt = this.db.prepare(`
        INSERT INTO payroll (
          id, payroll_no, employee_id, period_start, period_end, pay_date,
          status, basic_salary, overtime_pay, bonus, allowances, deductions,
          tax_amount, insurance_amount, net_pay, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        payrollNo,
        data.employee_id,
        data.period_start,
        data.period_end,
        data.pay_date,
        data.status || 'DRAFT',
        data.basic_salary,
        data.overtime_pay || 0,
        data.bonus || 0,
        data.allowances || 0,
        data.deductions || 0,
        taxAmount,
        insuranceAmount,
        netPay,
        data.notes || null,
        now,
        now
      );

      logger.info(`Payroll created: ${id}`);
      return id;
    } catch (error) {
      logger.error('Error creating payroll', error);
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to create payroll', error as Error);
    }
  }

  async update(id: string, data: UpdatePayrollData): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError('Payroll', id);
      }

      if (existing.status === 'PAID' || existing.status === 'CANCELLED') {
        throw new BusinessLogicError('Cannot update paid or cancelled payroll');
      }

      const updates: string[] = [];
      const values: any[] = [];

      if (data.pay_date !== undefined) {
        updates.push('pay_date = ?');
        values.push(data.pay_date);
      }

      if (data.status !== undefined) {
        if (!['DRAFT', 'CALCULATED', 'PAID', 'CANCELLED'].includes(data.status)) {
          throw new ValidationError('Invalid status');
        }
        updates.push('status = ?');
        values.push(data.status);
      }

      if (data.basic_salary !== undefined) {
        if (data.basic_salary < 0) {
          throw new ValidationError('Basic salary cannot be negative');
        }
        updates.push('basic_salary = ?');
        values.push(data.basic_salary);
      }

      if (data.overtime_pay !== undefined) {
        if (data.overtime_pay < 0) {
          throw new ValidationError('Overtime pay cannot be negative');
        }
        updates.push('overtime_pay = ?');
        values.push(data.overtime_pay);
      }

      if (data.bonus !== undefined) {
        if (data.bonus < 0) {
          throw new ValidationError('Bonus cannot be negative');
        }
        updates.push('bonus = ?');
        values.push(data.bonus);
      }

      if (data.allowances !== undefined) {
        if (data.allowances < 0) {
          throw new ValidationError('Allowances cannot be negative');
        }
        updates.push('allowances = ?');
        values.push(data.allowances);
      }

      if (data.deductions !== undefined) {
        if (data.deductions < 0) {
          throw new ValidationError('Deductions cannot be negative');
        }
        updates.push('deductions = ?');
        values.push(data.deductions);
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
        UPDATE payroll SET ${updates.join(', ')} WHERE id = ?
      `);

      stmt.run(...values);

      await this.recalculate(id);

      logger.info(`Payroll updated: ${id}`);
    } catch (error) {
      logger.error('Error updating payroll', error);
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to update payroll', error as Error);
    }
  }

  private async recalculate(id: string): Promise<void> {
    const row = this.db
      .prepare('SELECT * FROM payroll WHERE id = ?')
      .get(id) as any;

    if (!row) {
      return;
    }

    const data: PayrollData = {
      employee_id: row.employee_id,
      period_start: row.period_start,
      period_end: row.period_end,
      pay_date: row.pay_date,
      basic_salary: row.basic_salary,
      overtime_pay: row.overtime_pay,
      bonus: row.bonus,
      allowances: row.allowances,
      deductions: row.deductions,
    };

    const { taxAmount, insuranceAmount, netPay } = this.calculateNetPay(data);

    this.db.prepare(`
      UPDATE payroll
      SET tax_amount = ?, insurance_amount = ?, net_pay = ?, updated_at = ?
      WHERE id = ?
    `).run(taxAmount, insuranceAmount, netPay, getCurrentTimestamp(), id);
  }

  async delete(id: string): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError('Payroll', id);
      }

      if (existing.status === 'PAID') {
        throw new BusinessLogicError('Cannot delete paid payroll');
      }

      const stmt = this.db.prepare('DELETE FROM payroll WHERE id = ?');
      stmt.run(id);

      logger.info(`Payroll deleted: ${id}`);
    } catch (error) {
      logger.error('Error deleting payroll', error);
      if (error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to delete payroll', error as Error);
    }
  }

  async findById(id: string): Promise<PayrollData | null> {
    try {
      const row = this.db
        .prepare('SELECT * FROM payroll WHERE id = ?')
        .get(id) as any;

      if (!row) {
        return null;
      }

      return this.mapToPayrollData(row);
    } catch (error) {
      logger.error('Error finding payroll', error);
      throw new DatabaseError('Failed to find payroll', error as Error);
    }
  }

  async findByPayrollNo(payrollNo: string): Promise<PayrollData | null> {
    try {
      const row = this.db
        .prepare('SELECT * FROM payroll WHERE payroll_no = ?')
        .get(payrollNo) as any;

      if (!row) {
        return null;
      }

      return this.mapToPayrollData(row);
    } catch (error) {
      logger.error('Error finding payroll by number', error);
      throw new DatabaseError('Failed to find payroll by number', error as Error);
    }
  }

  async findAll(query: PayrollQuery = {}): Promise<PayrollData[]> {
    try {
      const conditions: string[] = ['1 = 1'];
      const params: any[] = [];

      if (query.employee_id) {
        conditions.push('employee_id = ?');
        params.push(query.employee_id);
      }

      if (query.status) {
        conditions.push('status = ?');
        params.push(query.status);
      }

      if (query.period_start) {
        conditions.push('period_end >= ?');
        params.push(query.period_start);
      }

      if (query.period_end) {
        conditions.push('period_start <= ?');
        params.push(query.period_end);
      }

      let sql = `SELECT * FROM payroll WHERE ${conditions.join(' AND ')} ORDER BY period_start DESC`;

      if (query.limit) {
        sql += ' LIMIT ?';
        params.push(query.limit);
        if (query.offset) {
          sql += ' OFFSET ?';
          params.push(query.offset);
        }
      }

      const rows = this.db.prepare(sql).all(...params) as any[];
      return rows.map(row => this.mapToPayrollData(row));
    } catch (error) {
      logger.error('Error finding payroll records', error);
      throw new DatabaseError('Failed to find payroll records', error as Error);
    }
  }

  async count(query: PayrollQuery = {}): Promise<number> {
    try {
      const conditions: string[] = ['1 = 1'];
      const params: any[] = [];

      if (query.employee_id) {
        conditions.push('employee_id = ?');
        params.push(query.employee_id);
      }

      if (query.status) {
        conditions.push('status = ?');
        params.push(query.status);
      }

      if (query.period_start) {
        conditions.push('period_end >= ?');
        params.push(query.period_start);
      }

      if (query.period_end) {
        conditions.push('period_start <= ?');
        params.push(query.period_end);
      }

      const sql = `SELECT COUNT(*) as count FROM payroll WHERE ${conditions.join(' AND ')}`;

      const row = this.db.prepare(sql).get(...params) as { count: number };
      return row.count;
    } catch (error) {
      logger.error('Error counting payroll records', error);
      throw new DatabaseError('Failed to count payroll records', error as Error);
    }
  }

  async getEmployeePayroll(employeeId: string, limit: number = 12): Promise<PayrollData[]> {
    return this.findAll({ employee_id: employeeId, limit });
  }

  private mapToPayrollData(row: any): PayrollData {
    return {
      id: row.id,
      payroll_no: row.payroll_no,
      employee_id: row.employee_id,
      period_start: row.period_start,
      period_end: row.period_end,
      pay_date: row.pay_date,
      status: row.status,
      basic_salary: row.basic_salary,
      overtime_pay: row.overtime_pay,
      bonus: row.bonus,
      allowances: row.allowances,
      deductions: row.deductions,
      tax_amount: row.tax_amount,
      insurance_amount: row.insurance_amount,
      net_pay: row.net_pay,
      notes: row.notes,
    } as any;
  }
}

export default PayrollService;
