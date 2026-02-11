import Database from 'better-sqlite3';
import { generateId, generateCode, getCurrentTimestamp, calculateTax, floorToDecimal, ValidationError, NotFoundError, BusinessLogicError, DatabaseError } from '../utils/helpers';
import { Logger } from '../utils/logger';

const logger = new Logger('OrdersService');

export interface OrderItemData {
  id?: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
  discount_rate?: number;
}

export interface SalesOrderData {
  id?: string;
  order_no?: string;
  customer_id: string;
  order_date: string;
  delivery_date?: string;
  status?: 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  items: OrderItemData[];
  notes?: string;
}

export interface UpdateSalesOrderData {
  delivery_date?: string;
  status?: 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  notes?: string;
}

export interface OrderQuery {
  customer_id?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

export class OrdersService {
  private db: Database.Database;
  private orderCounter: number = 1;

  constructor(db: Database.Database) {
    this.db = db;
    this.initializeOrderCounter();
  }

  private initializeOrderCounter(): void {
    const row = this.db
      .prepare('SELECT MAX(order_no) as max_order FROM sales_orders')
      .get() as { max_order: string | null };

    if (row && row.max_order) {
      const match = row.max_order.match(/SO(\d+)/);
      if (match) {
        this.orderCounter = parseInt(match[1], 10) + 1;
      }
    }
  }

  private getNextOrderNo(): string {
    return generateCode('SO', this.orderCounter++);
  }

  async validateOrderData(data: SalesOrderData): Promise<void> {
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

    if (!data.order_date) {
      throw new ValidationError('Order date is required');
    }

    if (data.delivery_date && new Date(data.delivery_date) < new Date(data.order_date)) {
      throw new ValidationError('Delivery date cannot be before order date');
    }

    if (!data.items || data.items.length === 0) {
      throw new ValidationError('Order must have at least one item');
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

  private calculateOrderTotals(items: OrderItemData[]): { subtotal: number; taxAmount: number; totalAmount: number } {
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

  async create(data: SalesOrderData): Promise<string> {
    try {
      await this.validateOrderData(data);

      const totals = this.calculateOrderTotals(data.items);

      const id = data.id || generateId();
      const orderNo = data.order_no || this.getNextOrderNo();
      const now = getCurrentTimestamp();

      const stmt = this.db.prepare(`
        INSERT INTO sales_orders (
          id, order_no, customer_id, order_date, delivery_date, status,
          subtotal, tax_amount, discount_amount, total_amount, notes,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        orderNo,
        data.customer_id,
        data.order_date,
        data.delivery_date || null,
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
          INSERT INTO sales_order_items (
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

      logger.info(`Sales order created: ${id}`);
      return id;
    } catch (error) {
      logger.error('Error creating sales order', error);
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to create sales order', error as Error);
    }
  }

  async update(id: string, data: UpdateSalesOrderData): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError('Sales Order', id);
      }

      if (existing.status === 'SHIPPED' || existing.status === 'DELIVERED') {
        throw new BusinessLogicError('Cannot update shipped or delivered order');
      }

      const updates: string[] = [];
      const values: any[] = [];

      if (data.delivery_date !== undefined) {
        if (new Date(data.delivery_date) < new Date(existing.order_date)) {
          throw new ValidationError('Delivery date cannot be before order date');
        }
        updates.push('delivery_date = ?');
        values.push(data.delivery_date);
      }

      if (data.status !== undefined) {
        if (!['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'].includes(data.status)) {
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
        UPDATE sales_orders SET ${updates.join(', ')} WHERE id = ?
      `);

      stmt.run(...values);

      logger.info(`Sales order updated: ${id}`);
    } catch (error) {
      logger.error('Error updating sales order', error);
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to update sales order', error as Error);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError('Sales Order', id);
      }

      if (existing.status === 'SHIPPED' || existing.status === 'DELIVERED') {
        throw new BusinessLogicError('Cannot delete shipped or delivered order');
      }

      const hasShipments = this.db
        .prepare('SELECT COUNT(*) as count FROM shipments WHERE order_id = ?')
        .get(id) as { count: number };

      if (hasShipments.count > 0) {
        throw new BusinessLogicError('Cannot delete order with existing shipments');
      }

      const hasInvoices = this.db
        .prepare('SELECT COUNT(*) as count FROM invoices WHERE order_id = ?')
        .get(id) as { count: number };

      if (hasInvoices.count > 0) {
        throw new BusinessLogicError('Cannot delete order with existing invoices');
      }

      this.db.prepare('DELETE FROM sales_order_items WHERE order_id = ?').run(id);
      this.db.prepare('DELETE FROM sales_orders WHERE id = ?').run(id);

      logger.info(`Sales order deleted: ${id}`);
    } catch (error) {
      logger.error('Error deleting sales order', error);
      if (error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to delete sales order', error as Error);
    }
  }

  async findById(id: string): Promise<SalesOrderData | null> {
    try {
      const row = this.db
        .prepare('SELECT * FROM sales_orders WHERE id = ?')
        .get(id) as any;

      if (!row) {
        return null;
      }

      const items = this.db
        .prepare('SELECT * FROM sales_order_items WHERE order_id = ?')
        .all(id) as any[];

      return this.mapToSalesOrderData(row, items);
    } catch (error) {
      logger.error('Error finding sales order', error);
      throw new DatabaseError('Failed to find sales order', error as Error);
    }
  }

  async findByOrderNo(orderNo: string): Promise<SalesOrderData | null> {
    try {
      const row = this.db
        .prepare('SELECT * FROM sales_orders WHERE order_no = ?')
        .get(orderNo) as any;

      if (!row) {
        return null;
      }

      const items = this.db
        .prepare('SELECT * FROM sales_order_items WHERE order_id = ?')
        .all(row.id) as any[];

      return this.mapToSalesOrderData(row, items);
    } catch (error) {
      logger.error('Error finding sales order by number', error);
      throw new DatabaseError('Failed to find sales order by number', error as Error);
    }
  }

  async findAll(query: OrderQuery = {}): Promise<SalesOrderData[]> {
    try {
      const conditions: string[] = ['1 = 1'];
      const params: any[] = [];

      if (query.customer_id) {
        conditions.push('customer_id = ?');
        params.push(query.customer_id);
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

      let sql = `SELECT * FROM sales_orders WHERE ${conditions.join(' AND ')} ORDER BY order_date DESC`;

      if (query.limit) {
        sql += ' LIMIT ?';
        params.push(query.limit);
        if (query.offset) {
          sql += ' OFFSET ?';
          params.push(query.offset);
        }
      }

      const rows = this.db.prepare(sql).all(...params) as any[];

      const orders: SalesOrderData[] = [];
      for (const row of rows) {
        const items = this.db
          .prepare('SELECT * FROM sales_order_items WHERE order_id = ?')
          .all(row.id) as any[];
        orders.push(this.mapToSalesOrderData(row, items));
      }

      return orders;
    } catch (error) {
      logger.error('Error finding sales orders', error);
      throw new DatabaseError('Failed to find sales orders', error as Error);
    }
  }

  async count(query: OrderQuery = {}): Promise<number> {
    try {
      const conditions: string[] = ['1 = 1'];
      const params: any[] = [];

      if (query.customer_id) {
        conditions.push('customer_id = ?');
        params.push(query.customer_id);
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

      const sql = `SELECT COUNT(*) as count FROM sales_orders WHERE ${conditions.join(' AND ')}`;

      const row = this.db.prepare(sql).get(...params) as { count: number };
      return row.count;
    } catch (error) {
      logger.error('Error counting sales orders', error);
      throw new DatabaseError('Failed to count sales orders', error as Error);
    }
  }

  async getCustomerOrders(customerId: string, limit: number = 50): Promise<SalesOrderData[]> {
    return this.findAll({ customer_id: customerId, limit });
  }

  private mapToSalesOrderData(order: any, items: any[]): SalesOrderData {
    return {
      id: order.id,
      order_no: order.order_no,
      customer_id: order.customer_id,
      order_date: order.order_date,
      delivery_date: order.delivery_date,
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

export default OrdersService;
