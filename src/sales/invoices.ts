import Database from 'better-sqlite3';
import { generateId, generateCode, getCurrentTimestamp, calculateTax, floorToDecimal, ValidationError, NotFoundError, BusinessLogicError, DatabaseError } from '../utils/helpers';
import { Logger } from '../utils/logger';

const logger = new Logger('InvoicesService');

export interface InvoiceItemData {
  id?: string;
  product_id?: string;
  description?: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
  discount_rate?: number;
}

export interface InvoiceData {
  id?: string;
  invoice_no?: string;
  customer_id: string;
  order_id?: string;
  invoice_date: string;
  due_date: string;
  status?: 'PENDING' | 'SENT' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  items: InvoiceItemData[];
  subtotal?: number;
  tax_amount?: number;
  total_amount?: number;
  notes?: string;
}

export interface UpdateInvoiceData {
  invoice_date?: string;
  due_date?: string;
  status?: 'PENDING' | 'SENT' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  notes?: string;
}

export interface InvoiceQuery {
  customer_id?: string;
  order_id?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  due_start?: string;
  due_end?: string;
  limit?: number;
  offset?: number;
}

export class InvoicesService {
  private db: Database.Database;
  private invoiceCounter: number = 1;

  constructor(db: Database.Database) {
    this.db = db;
    this.initializeInvoiceCounter();
  }

  private initializeInvoiceCounter(): void {
    const row = this.db
      .prepare('SELECT MAX(invoice_no) as max_invoice FROM invoices')
      .get() as { max_invoice: string | null };

    if (row && row.max_invoice) {
      const match = row.max_invoice.match(/INV(\d+)/);
      if (match) {
        this.invoiceCounter = parseInt(match[1], 10) + 1;
      }
    }
  }

  private getNextInvoiceNo(): string {
    return generateCode('INV', this.invoiceCounter++);
  }

  async validateInvoiceData(data: InvoiceData): Promise<void> {
    if (!data.customer_id) {
      throw new ValidationError('Customer ID is required');
    }

    const customer = this.db
      .prepare('SELECT id, is_active FROM customers WHERE id = ?')
      .get(data.customer_id);

    if (!customer) {
      throw new NotFoundError('Customer', data.customer_id);
    }

    if (!(customer as any).is_active) {
      throw new BusinessLogicError('Customer is not active');
    }

    if (data.order_id) {
      const order = this.db
        .prepare('SELECT id, customer_id, status FROM sales_orders WHERE id = ?')
        .get(data.order_id);

      if (!order) {
        throw new NotFoundError('Sales Order', data.order_id);
      }

      if ((order as any).customer_id !== data.customer_id) {
        throw new BusinessLogicError('Order does not belong to this customer');
      }
    }

    if (!data.invoice_date) {
      throw new ValidationError('Invoice date is required');
    }

    if (!data.due_date) {
      throw new ValidationError('Due date is required');
    }

    if (new Date(data.due_date) < new Date(data.invoice_date)) {
      throw new ValidationError('Due date cannot be before invoice date');
    }

    if (!data.items || data.items.length === 0) {
      throw new ValidationError('Invoice must have at least one item');
    }

    for (const item of data.items) {
      if ((!item.description || item.description.trim().length === 0) && !item.product_id) {
        throw new ValidationError('Item description or product ID is required');
      }

      if (!item.quantity || item.quantity <= 0) {
        throw new ValidationError('Quantity must be greater than 0');
      }

      if (!item.unit_price || item.unit_price < 0) {
        throw new ValidationError('Unit price must be greater than or equal to 0');
      }

      if (item.discount_rate !== undefined && (item.discount_rate < 0 || item.discount_rate > 1)) {
        throw new ValidationError('Discount rate must be between 0 and 1');
      }
    }
  }

  private calculateInvoiceTotals(items: InvoiceItemData[]): { subtotal: number; taxAmount: number; totalAmount: number } {
    let subtotal = 0;
    let taxAmount = 0;

    for (const item of items) {
      const itemSubtotal = item.quantity * item.unit_price;
      const discountRate = item.discount_rate || 0;
      const discountAmount = floorToDecimal(itemSubtotal * discountRate);
      const afterDiscount = itemSubtotal - discountAmount;
      const taxRate = item.tax_rate || 0.10;
      const itemTax = calculateTax(afterDiscount, taxRate);

      subtotal += afterDiscount;
      taxAmount += itemTax;
    }

    const totalAmount = subtotal + taxAmount;

    return {
      subtotal: floorToDecimal(subtotal),
      taxAmount: floorToDecimal(taxAmount),
      totalAmount: floorToDecimal(totalAmount),
    };
  }

  async create(data: InvoiceData): Promise<string> {
    try {
      await this.validateInvoiceData(data);

      const totals = this.calculateInvoiceTotals(data.items);

      const id = data.id || generateId();
      const invoiceNo = data.invoice_no || this.getNextInvoiceNo();
      const now = getCurrentTimestamp();

      const stmt = this.db.prepare(`
        INSERT INTO invoices (
          id, invoice_no, customer_id, order_id, invoice_date, due_date, status,
          subtotal, tax_amount, discount_amount, total_amount, paid_amount, notes,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        invoiceNo,
        data.customer_id,
        data.order_id || null,
        data.invoice_date,
        data.due_date,
        data.status || 'PENDING',
        totals.subtotal,
        totals.taxAmount,
        0,
        totals.totalAmount,
        0,
        data.notes || null,
        now,
        now
      );

      for (const item of data.items) {
        const itemSubtotal = item.quantity * item.unit_price;
        const discountRate = item.discount_rate || 0;
        const discountAmount = floorToDecimal(itemSubtotal * discountRate);
        const afterDiscount = itemSubtotal - discountAmount;
        const taxRate = item.tax_rate || 0.10;
        const itemTax = calculateTax(afterDiscount, taxRate);
        const itemTotal = afterDiscount + itemTax;

        const itemStmt = this.db.prepare(`
          INSERT INTO invoice_items (
            id, invoice_id, product_id, description, quantity, unit_price,
            tax_rate, discount_rate, subtotal, tax_amount, total_amount, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        itemStmt.run(
          generateId(),
          id,
          item.product_id || null,
          item.description?.trim() || '',
          item.quantity,
          item.unit_price,
          taxRate,
          discountRate,
          afterDiscount,
          itemTax,
          itemTotal,
          now
        );
      }

      await this.createAccountsReceivable(id, data.customer_id, totals.totalAmount, data.due_date);

      logger.info(`Invoice created: ${id}`);
      return id;
    } catch (error) {
      logger.error('Error creating invoice', error);
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to create invoice', error as Error);
    }
  }

  private async createAccountsReceivable(invoiceId: string, customerId: string, amount: number, dueDate: string): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO accounts_receivable (
        id, customer_id, invoice_id, transaction_date, debit_amount,
        credit_amount, balance, due_date, status, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      generateId(),
      customerId,
      invoiceId,
      getCurrentTimestamp(),
      amount,
      0,
      amount,
      dueDate,
      'OPEN',
      `Invoice ${invoiceId}`,
      getCurrentTimestamp(),
      getCurrentTimestamp()
    );
  }

  async update(id: string, data: UpdateInvoiceData): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError('Invoice', id);
      }

      if (existing.status === 'PAID' || existing.status === 'CANCELLED') {
        throw new BusinessLogicError('Cannot update paid or cancelled invoice');
      }

      const updates: string[] = [];
      const values: any[] = [];

      if (data.invoice_date !== undefined) {
        updates.push('invoice_date = ?');
        values.push(data.invoice_date);
      }

      if (data.due_date !== undefined) {
        updates.push('due_date = ?');
        values.push(data.due_date);
      }

      if (data.status !== undefined) {
        if (!['PENDING', 'SENT', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED'].includes(data.status)) {
          throw new ValidationError('Invalid status');
        }
        updates.push('status = ?');
        values.push(data.status);

        if (data.status === 'PAID') {
          await this.markAsPaid(id);
        }
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
        UPDATE invoices SET ${updates.join(', ')} WHERE id = ?
      `);

      stmt.run(...values);

      logger.info(`Invoice updated: ${id}`);
    } catch (error) {
      logger.error('Error updating invoice', error);
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to update invoice', error as Error);
    }
  }

  private async markAsPaid(invoiceId: string): Promise<void> {
    const invoice = this.db
      .prepare('SELECT total_amount, paid_amount FROM invoices WHERE id = ?')
      .get(invoiceId) as any;

    if (!invoice) {
      throw new NotFoundError('Invoice', invoiceId);
    }

    const paidAmount = invoice.paid_amount || 0;
    const totalAmount = invoice.total_amount;

    if (paidAmount >= totalAmount) {
      return;
    }

    const paymentAmount = totalAmount - paidAmount;

    this.db.prepare('UPDATE invoices SET paid_amount = ?, updated_at = ? WHERE id = ?')
      .run(totalAmount, getCurrentTimestamp(), invoiceId);

    this.db.prepare(`
      UPDATE accounts_receivable
      SET credit_amount = credit_amount + ?, balance = balance - ?, updated_at = ?
      WHERE invoice_id = ?
    `).run(paymentAmount, paymentAmount, getCurrentTimestamp(), invoiceId);

    this.db.prepare(`
      UPDATE accounts_receivable
      SET status = ?, updated_at = ?
      WHERE invoice_id = ? AND balance <= 0
    `).run('PAID', getCurrentTimestamp(), invoiceId);
  }

  async delete(id: string): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError('Invoice', id);
      }

      if (existing.status === 'PAID') {
        throw new BusinessLogicError('Cannot delete paid invoice');
      }

      this.db.prepare('DELETE FROM accounts_receivable WHERE invoice_id = ?').run(id);
      this.db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(id);
      this.db.prepare('DELETE FROM invoices WHERE id = ?').run(id);

      logger.info(`Invoice deleted: ${id}`);
    } catch (error) {
      logger.error('Error deleting invoice', error);
      if (error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to delete invoice', error as Error);
    }
  }

  async findById(id: string): Promise<InvoiceData | null> {
    try {
      const row = this.db
        .prepare('SELECT * FROM invoices WHERE id = ?')
        .get(id) as any;

      if (!row) {
        return null;
      }

      const items = this.db
        .prepare('SELECT * FROM invoice_items WHERE invoice_id = ?')
        .all(id) as any[];

      return this.mapToInvoiceData(row, items);
    } catch (error) {
      logger.error('Error finding invoice', error);
      throw new DatabaseError('Failed to find invoice', error as Error);
    }
  }

  async findByInvoiceNo(invoiceNo: string): Promise<InvoiceData | null> {
    try {
      const row = this.db
        .prepare('SELECT * FROM invoices WHERE invoice_no = ?')
        .get(invoiceNo) as any;

      if (!row) {
        return null;
      }

      const items = this.db
        .prepare('SELECT * FROM invoice_items WHERE invoice_id = ?')
        .all(row.id) as any[];

      return this.mapToInvoiceData(row, items);
    } catch (error) {
      logger.error('Error finding invoice by number', error);
      throw new DatabaseError('Failed to find invoice by number', error as Error);
    }
  }

  async findAll(query: InvoiceQuery = {}): Promise<InvoiceData[]> {
    try {
      const conditions: string[] = ['1 = 1'];
      const params: any[] = [];

      if (query.customer_id) {
        conditions.push('customer_id = ?');
        params.push(query.customer_id);
      }

      if (query.order_id) {
        conditions.push('order_id = ?');
        params.push(query.order_id);
      }

      if (query.status) {
        conditions.push('status = ?');
        params.push(query.status);
      }

      if (query.start_date) {
        conditions.push('invoice_date >= ?');
        params.push(query.start_date);
      }

      if (query.end_date) {
        conditions.push('invoice_date <= ?');
        params.push(query.end_date);
      }

      if (query.due_start) {
        conditions.push('due_date >= ?');
        params.push(query.due_start);
      }

      if (query.due_end) {
        conditions.push('due_date <= ?');
        params.push(query.due_end);
      }

      let sql = `SELECT * FROM invoices WHERE ${conditions.join(' AND ')} ORDER BY invoice_date DESC`;

      if (query.limit) {
        sql += ' LIMIT ?';
        params.push(query.limit);
        if (query.offset) {
          sql += ' OFFSET ?';
          params.push(query.offset);
        }
      }

      const rows = this.db.prepare(sql).all(...params) as any[];

      const invoices: InvoiceData[] = [];
      for (const row of rows) {
        const items = this.db
          .prepare('SELECT * FROM invoice_items WHERE invoice_id = ?')
          .all(row.id) as any[];
        invoices.push(this.mapToInvoiceData(row, items));
      }

      return invoices;
    } catch (error) {
      logger.error('Error finding invoices', error);
      throw new DatabaseError('Failed to find invoices', error as Error);
    }
  }

  async count(query: InvoiceQuery = {}): Promise<number> {
    try {
      const conditions: string[] = ['1 = 1'];
      const params: any[] = [];

      if (query.customer_id) {
        conditions.push('customer_id = ?');
        params.push(query.customer_id);
      }

      if (query.order_id) {
        conditions.push('order_id = ?');
        params.push(query.order_id);
      }

      if (query.status) {
        conditions.push('status = ?');
        params.push(query.status);
      }

      if (query.start_date) {
        conditions.push('invoice_date >= ?');
        params.push(query.start_date);
      }

      if (query.end_date) {
        conditions.push('invoice_date <= ?');
        params.push(query.end_date);
      }

      if (query.due_start) {
        conditions.push('due_date >= ?');
        params.push(query.due_start);
      }

      if (query.due_end) {
        conditions.push('due_date <= ?');
        params.push(query.due_end);
      }

      const sql = `SELECT COUNT(*) as count FROM invoices WHERE ${conditions.join(' AND ')}`;

      const row = this.db.prepare(sql).get(...params) as { count: number };
      return row.count;
    } catch (error) {
      logger.error('Error counting invoices', error);
      throw new DatabaseError('Failed to count invoices', error as Error);
    }
  }

  async getCustomerInvoices(customerId: string, limit: number = 50): Promise<InvoiceData[]> {
    return this.findAll({ customer_id: customerId, limit });
  }

  async getOverdueInvoices(): Promise<InvoiceData[]> {
    const now = getCurrentTimestamp();
    return this.findAll({
      status: 'PENDING',
      due_end: now,
    });
  }

  async getSummary(): Promise<any> {
    try {
      const row = this.db
        .prepare(`
          SELECT
            COUNT(*) as total_invoices,
            SUM(total_amount) as total_amount,
            SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END) as paid_invoices,
            SUM(CASE WHEN status = 'PAID' THEN total_amount ELSE 0 END) as paid_amount,
            SUM(CASE WHEN status = 'PARTIAL' THEN 1 ELSE 0 END) as partial_invoices,
            SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending_invoices,
            SUM(CASE WHEN status = 'OVERDUE' THEN 1 ELSE 0 END) as overdue_invoices
          FROM invoices
        `)
        .get() as any;

      return {
        total_invoices: row.total_invoices || 0,
        total_amount: row.total_amount || 0,
        paid_invoices: row.paid_invoices || 0,
        paid_amount: row.paid_amount || 0,
        partial_invoices: row.partial_invoices || 0,
        pending_invoices: row.pending_invoices || 0,
        overdue_invoices: row.overdue_invoices || 0,
      };
    } catch (error) {
      logger.error('Error getting invoice summary', error);
      throw new DatabaseError('Failed to get invoice summary', error as Error);
    }
  }

  private mapToInvoiceData(invoice: any, items: any[]): InvoiceData {
    return {
      id: invoice.id,
      invoice_no: invoice.invoice_no,
      customer_id: invoice.customer_id,
      order_id: invoice.order_id,
      invoice_date: invoice.invoice_date,
      due_date: invoice.due_date,
      status: invoice.status,
      items: items.map(item => ({
        id: item.id,
        product_id: item.product_id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_rate: item.tax_rate,
        discount_rate: item.discount_rate,
      })),
      subtotal: invoice.subtotal,
      tax_amount: invoice.tax_amount,
      total_amount: invoice.total_amount,
      notes: invoice.notes,
    };
  }
}

export default InvoicesService;
