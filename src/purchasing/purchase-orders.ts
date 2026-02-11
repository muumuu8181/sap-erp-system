import Database from 'better-sqlite3';
import { generateId, generateCode, getCurrentTimestamp, calculateTax, floorToDecimal, ValidationError, NotFoundError, BusinessLogicError, DatabaseError } from '../utils/helpers';
import { Logger } from '../utils/logger';

const logger = new Logger('PurchaseOrdersService');

export interface PurchaseOrderItemData {
  id?: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
  discount_rate?: number;
}

export interface PurchaseOrderData {
  id?: string;
  order_no?: string;
  supplier_id: string;
  order_date: string;
  expected_date?: string;
  status?: 'PENDING' | 'CONFIRMED' | 'RECEIVED' | 'CANCELLED';
  items: PurchaseOrderItemData[];
  notes?: string;
}

export interface UpdatePurchaseOrderData {
  expected_date?: string;
  status?: 'PENDING' | 'CONFIRMED' | 'RECEIVED' | 'CANCELLED';
  notes?: string;
}

export interface PurchaseOrderQuery {
  supplier_id?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

export class PurchaseOrdersService {
  private db: Database.Database;
  private orderCounter: number = 1;

  constructor(db: Database.Database) {
    this.db = db;
    this.initializeOrderCounter();
  }

  private initializeOrderCounter(): void {
    const row = this.db
      .prepare('SELECT MAX(order_no) as max_order FROM purchase_orders')
      .get() as { max_order: string | null };

    if (row && row.max_order) {
      const match = row.max_order.match(/PO(\d+)/);
      if (match) {
        this.orderCounter = parseInt(match[1], 10) + 1;
      }
    }
  }

  private getNextOrderNo(): string {
    return generateCode('PO', this.orderCounter++);
  }

  async validateOrderData(data: PurchaseOrderData): Promise<void> {
    if (!data.supplier_id) {
      throw new ValidationError('Supplier ID is required');
    }

    const supplier = this.db
      .prepare('SELECT id, is_active FROM suppliers WHERE id = ?')
      .get(data.supplier_id);

    if (!supplier) {
      throw new NotFoundError('Supplier', data.supplier_id);
    }

    if (!(supplier as any).is_active) {
      throw new BusinessLogicError('Supplier is not active');
    }

    if (!data.order_date) {
      throw new ValidationError('Order date is required');
    }

    if (data.expected_date && new Date(data.expected_date) < new Date(data.order_date)) {
      throw new ValidationError('Expected date cannot be before order date');
    }

    if (!data.items || data.items.length === 0) {
      throw new ValidationError('Purchase order must have at least one item');
    }

    for (const item of data.items) {
      if (!item.product_id) {
        throw new ValidationError('Product ID is required for all items');
      }

      const product = this.db
        .prepare('SELECT id, is_active FROM products WHERE id = ?')
        .get(item.product_id);

      if (!product) {
        throw new NotFoundError('Product', item.product_id);
      }

      if (!(product as any).is_active) {
        throw new BusinessLogicError('Product is not active');
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

  private calculateOrderTotals(items: PurchaseOrderItemData[]): { subtotal: number; taxAmount: number; totalAmount: number } {
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

  async create(data: PurchaseOrderData): Promise<string> {
    try {
      await this.validateOrderData(data);

      const totals = this.calculateOrderTotals(data.items);

      const id = data.id || generateId();
      const orderNo = data.order_no || this.getNextOrderNo();
      const now = getCurrentTimestamp();

      const stmt = this.db.prepare(`
        INSERT INTO purchase_orders (
          id, order_no, supplier_id, order_date, expected_date, status,
          subtotal, tax_amount, discount_amount, total_amount, notes,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        orderNo,
        data.supplier_id,
        data.order_date,
        data.expected_date || null,
        data.status || 'PENDING',
        totals.subtotal,
        totals.taxAmount,
        0,
        totals.totalAmount,
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
          INSERT INTO purchase_order_items (
            id, order_id, product_id, quantity, unit_price, tax_rate,
            discount_rate, subtotal, tax_amount, total_amount, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        itemStmt.run(
          generateId(),
          id,
          item.product_id,
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

      logger.info(`Purchase order created: ${id}`);
      return id;
    } catch (error) {
      logger.error('Error creating purchase order', error);
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to create purchase order', error as Error);
    }
  }

  async update(id: string, data: UpdatePurchaseOrderData): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError('Purchase Order', id);
      }

      if (existing.status === 'RECEIVED' || existing.status === 'CANCELLED') {
        throw new BusinessLogicError('Cannot update received or cancelled order');
      }

      const updates: string[] = [];
      const values: any[] = [];

      if (data.expected_date !== undefined) {
        if (new Date(data.expected_date) < new Date(existing.order_date)) {
          throw new ValidationError('Expected date cannot be before order date');
        }
        updates.push('expected_date = ?');
        values.push(data.expected_date);
      }

      if (data.status !== undefined) {
        if (!['PENDING', 'CONFIRMED', 'RECEIVED', 'CANCELLED'].includes(data.status)) {
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
        UPDATE purchase_orders SET ${updates.join(', ')} WHERE id = ?
      `);

      stmt.run(...values);

      logger.info(`Purchase order updated: ${id}`);
    } catch (error) {
      logger.error('Error updating purchase order', error);
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to update purchase order', error as Error);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError('Purchase Order', id);
      }

      if (existing.status === 'RECEIVED') {
        throw new BusinessLogicError('Cannot delete received order');
      }

      const hasReceiving = this.db
        .prepare('SELECT COUNT(*) as count FROM receiving WHERE order_id = ?')
        .get(id) as { count: number };

      if (hasReceiving.count > 0) {
        throw new BusinessLogicError('Cannot delete order with existing receiving records');
      }

      this.db.prepare('DELETE FROM purchase_order_items WHERE order_id = ?').run(id);
      this.db.prepare('DELETE FROM purchase_orders WHERE id = ?').run(id);

      logger.info(`Purchase order deleted: ${id}`);
    } catch (error) {
      logger.error('Error deleting purchase order', error);
      if (error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to delete purchase order', error as Error);
    }
  }

  async findById(id: string): Promise<PurchaseOrderData | null> {
    try {
      const row = this.db
        .prepare('SELECT * FROM purchase_orders WHERE id = ?')
        .get(id) as any;

      if (!row) {
        return null;
      }

      const items = this.db
        .prepare('SELECT * FROM purchase_order_items WHERE order_id = ?')
        .all(id) as any[];

      return this.mapToPurchaseOrderData(row, items);
    } catch (error) {
      logger.error('Error finding purchase order', error);
      throw new DatabaseError('Failed to find purchase order', error as Error);
    }
  }

  async findByOrderNo(orderNo: string): Promise<PurchaseOrderData | null> {
    try {
      const row = this.db
        .prepare('SELECT * FROM purchase_orders WHERE order_no = ?')
        .get(orderNo) as any;

      if (!row) {
        return null;
      }

      const items = this.db
        .prepare('SELECT * FROM purchase_order_items WHERE order_id = ?')
        .all(row.id) as any[];

      return this.mapToPurchaseOrderData(row, items);
    } catch (error) {
      logger.error('Error finding purchase order by number', error);
      throw new DatabaseError('Failed to find purchase order by number', error as Error);
    }
  }

  async findAll(query: PurchaseOrderQuery = {}): Promise<PurchaseOrderData[]> {
    try {
      const conditions: string[] = ['1 = 1'];
      const params: any[] = [];

      if (query.supplier_id) {
        conditions.push('supplier_id = ?');
        params.push(query.supplier_id);
      }

      if (query.status) {
        conditions.push('status = ?');
        params.push(query.status);
      }

      if (query.start_date) {
        conditions.push('order_date >= ?');
        params.push(query.start_date);
      }

      if (query.end_date) {
        conditions.push('order_date <= ?');
        params.push(query.end_date);
      }

      let sql = `SELECT * FROM purchase_orders WHERE ${conditions.join(' AND ')} ORDER BY order_date DESC`;

      if (query.limit) {
        sql += ' LIMIT ?';
        params.push(query.limit);
        if (query.offset) {
          sql += ' OFFSET ?';
          params.push(query.offset);
        }
      }

      const rows = this.db.prepare(sql).all(...params) as any[];

      const orders: PurchaseOrderData[] = [];
      for (const row of rows) {
        const items = this.db
          .prepare('SELECT * FROM purchase_order_items WHERE order_id = ?')
          .all(row.id) as any[];
        orders.push(this.mapToPurchaseOrderData(row, items));
      }

      return orders;
    } catch (error) {
      logger.error('Error finding purchase orders', error);
      throw new DatabaseError('Failed to find purchase orders', error as Error);
    }
  }

  async count(query: PurchaseOrderQuery = {}): Promise<number> {
    try {
      const conditions: string[] = ['1 = 1'];
      const params: any[] = [];

      if (query.supplier_id) {
        conditions.push('supplier_id = ?');
        params.push(query.supplier_id);
      }

      if (query.status) {
        conditions.push('status = ?');
        params.push(query.status);
      }

      if (query.start_date) {
        conditions.push('order_date >= ?');
        params.push(query.start_date);
      }

      if (query.end_date) {
        conditions.push('order_date <= ?');
        params.push(query.end_date);
      }

      const sql = `SELECT COUNT(*) as count FROM purchase_orders WHERE ${conditions.join(' AND ')}`;

      const row = this.db.prepare(sql).get(...params) as { count: number };
      return row.count;
    } catch (error) {
      logger.error('Error counting purchase orders', error);
      throw new DatabaseError('Failed to count purchase orders', error as Error);
    }
  }

  async getSupplierOrders(supplierId: string, limit: number = 50): Promise<PurchaseOrderData[]> {
    return this.findAll({ supplier_id: supplierId, limit });
  }

  private mapToPurchaseOrderData(order: any, items: any[]): PurchaseOrderData {
    return {
      id: order.id,
      order_no: order.order_no,
      supplier_id: order.supplier_id,
      order_date: order.order_date,
      expected_date: order.expected_date,
      status: order.status,
      items: items.map(item => ({
        id: item.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_rate: item.tax_rate,
        discount_rate: item.discount_rate,
      })),
      notes: order.notes,
    };
  }
}

export default PurchaseOrdersService;
