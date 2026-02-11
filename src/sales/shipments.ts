import Database from 'better-sqlite3';
import { generateId, generateCode, getCurrentTimestamp, ValidationError, NotFoundError, BusinessLogicError, DatabaseError } from '../utils/helpers';
import { Logger } from '../utils/logger';

const logger = new Logger('ShipmentsService');

export interface ShipmentItemData {
  id?: string;
  product_id: string;
  quantity: number;
}

export interface ShipmentData {
  id?: string;
  shipment_no?: string;
  order_id: string;
  shipment_date: string;
  status?: 'PENDING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  tracking_number?: string;
  carrier?: string;
  items: ShipmentItemData[];
  notes?: string;
}

export interface UpdateShipmentData {
  shipment_date?: string;
  status?: 'PENDING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  tracking_number?: string;
  carrier?: string;
  notes?: string;
}

export interface ShipmentQuery {
  order_id?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

export class ShipmentsService {
  private db: Database.Database;
  private shipmentCounter: number = 1;

  constructor(db: Database.Database) {
    this.db = db;
    this.initializeShipmentCounter();
  }

  private initializeShipmentCounter(): void {
    const row = this.db
      .prepare('SELECT MAX(shipment_no) as max_shipment FROM shipments')
      .get() as { max_shipment: string | null };

    if (row && row.max_shipment) {
      const match = row.max_shipment.match(/SH(\d+)/);
      if (match) {
        this.shipmentCounter = parseInt(match[1], 10) + 1;
      }
    }
  }

  private getNextShipmentNo(): string {
    return generateCode('SH', this.shipmentCounter++);
  }

  async validateShipmentData(data: ShipmentData): Promise<void> {
    if (!data.order_id) {
      throw new ValidationError('Order ID is required');
    }

    const order = this.db
      .prepare('SELECT id, status FROM sales_orders WHERE id = ?')
      .get(data.order_id);

    if (!order) {
      throw new NotFoundError('Sales Order', data.order_id);
    }

    const orderStatus = (order as any).status;
    if (orderStatus === 'CANCELLED') {
      throw new BusinessLogicError('Cannot ship cancelled order');
    }

    if (!data.shipment_date) {
      throw new ValidationError('Shipment date is required');
    }

    if (!data.items || data.items.length === 0) {
      throw new ValidationError('Shipment must have at least one item');
    }

    const orderItems = this.db
      .prepare('SELECT product_id, quantity FROM sales_order_items WHERE order_id = ?')
      .all(data.order_id) as any[];

    const orderItemQuantities = new Map<string, number>();
    for (const item of orderItems) {
      orderItemQuantities.set(item.product_id, item.quantity);
    }

    for (const item of data.items) {
      if (!item.product_id) {
        throw new ValidationError('Product ID is required for all items');
      }

      if (!orderItemQuantities.has(item.product_id)) {
        throw new ValidationError(`Product ${item.product_id} is not in the order`);
      }

      if (!item.quantity || item.quantity <= 0) {
        throw new ValidationError('Quantity must be greater than 0');
      }
    }
  }

  async create(data: ShipmentData): Promise<string> {
    try {
      await this.validateShipmentData(data);

      const id = data.id || generateId();
      const shipmentNo = data.shipment_no || this.getNextShipmentNo();
      const now = getCurrentTimestamp();

      const stmt = this.db.prepare(`
        INSERT INTO shipments (
          id, shipment_no, order_id, shipment_date, status,
          tracking_number, carrier, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        shipmentNo,
        data.order_id,
        data.shipment_date,
        data.status || 'PENDING',
        data.tracking_number || null,
        data.carrier || null,
        data.notes || null,
        now,
        now
      );

      for (const item of data.items) {
        const itemStmt = this.db.prepare(`
          INSERT INTO shipment_items (
            id, shipment_id, product_id, quantity, created_at
          ) VALUES (?, ?, ?, ?, ?)
        `);

        itemStmt.run(
          generateId(),
          id,
          item.product_id,
          item.quantity,
          now
        );
      }

      const orderStmt = this.db.prepare('UPDATE sales_orders SET status = ?, updated_at = ? WHERE id = ?');
      orderStmt.run('SHIPPED', now, data.order_id);

      logger.info(`Shipment created: ${id}`);
      return id;
    } catch (error) {
      logger.error('Error creating shipment', error);
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to create shipment', error as Error);
    }
  }

  async update(id: string, data: UpdateShipmentData): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError('Shipment', id);
      }

      const updates: string[] = [];
      const values: any[] = [];

      if (data.shipment_date !== undefined) {
        updates.push('shipment_date = ?');
        values.push(data.shipment_date);
      }

      if (data.status !== undefined) {
        if (!['PENDING', 'SHIPPED', 'DELIVERED', 'CANCELLED'].includes(data.status)) {
          throw new ValidationError('Invalid status');
        }
        updates.push('status = ?');
        values.push(data.status);

        if (data.status === 'DELIVERED') {
          const orderStmt = this.db.prepare('UPDATE sales_orders SET status = ?, updated_at = ? WHERE id = ?');
          orderStmt.run('DELIVERED', getCurrentTimestamp(), existing.order_id);
        }
      }

      if (data.tracking_number !== undefined) {
        updates.push('tracking_number = ?');
        values.push(data.tracking_number);
      }

      if (data.carrier !== undefined) {
        updates.push('carrier = ?');
        values.push(data.carrier);
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
        UPDATE shipments SET ${updates.join(', ')} WHERE id = ?
      `);

      stmt.run(...values);

      logger.info(`Shipment updated: ${id}`);
    } catch (error) {
      logger.error('Error updating shipment', error);
      if (error instanceof ValidationError || error instanceof NotFoundError) {
        throw error;
      }
      throw new DatabaseError('Failed to update shipment', error as Error);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError('Shipment', id);
      }

      if (existing.status === 'DELIVERED') {
        throw new BusinessLogicError('Cannot delete delivered shipment');
      }

      this.db.prepare('DELETE FROM shipment_items WHERE shipment_id = ?').run(id);
      this.db.prepare('DELETE FROM shipments WHERE id = ?').run(id);

      logger.info(`Shipment deleted: ${id}`);
    } catch (error) {
      logger.error('Error deleting shipment', error);
      if (error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to delete shipment', error as Error);
    }
  }

  async findById(id: string): Promise<ShipmentData | null> {
    try {
      const row = this.db
        .prepare('SELECT * FROM shipments WHERE id = ?')
        .get(id) as any;

      if (!row) {
        return null;
      }

      const items = this.db
        .prepare('SELECT * FROM shipment_items WHERE shipment_id = ?')
        .all(id) as any[];

      return this.mapToShipmentData(row, items);
    } catch (error) {
      logger.error('Error finding shipment', error);
      throw new DatabaseError('Failed to find shipment', error as Error);
    }
  }

  async findByShipmentNo(shipmentNo: string): Promise<ShipmentData | null> {
    try {
      const row = this.db
        .prepare('SELECT * FROM shipments WHERE shipment_no = ?')
        .get(shipmentNo) as any;

      if (!row) {
        return null;
      }

      const items = this.db
        .prepare('SELECT * FROM shipment_items WHERE shipment_id = ?')
        .all(row.id) as any[];

      return this.mapToShipmentData(row, items);
    } catch (error) {
      logger.error('Error finding shipment by number', error);
      throw new DatabaseError('Failed to find shipment by number', error as Error);
    }
  }

  async findAll(query: ShipmentQuery = {}): Promise<ShipmentData[]> {
    try {
      const conditions: string[] = ['1 = 1'];
      const params: any[] = [];

      if (query.order_id) {
        conditions.push('order_id = ?');
        params.push(query.order_id);
      }

      if (query.status) {
        conditions.push('status = ?');
        params.push(query.status);
      }

      if (query.start_date) {
        conditions.push('shipment_date >= ?');
        params.push(query.start_date);
      }

      if (query.end_date) {
        conditions.push('shipment_date <= ?');
        params.push(query.end_date);
      }

      let sql = `SELECT * FROM shipments WHERE ${conditions.join(' AND ')} ORDER BY shipment_date DESC`;

      if (query.limit) {
        sql += ' LIMIT ?';
        params.push(query.limit);
        if (query.offset) {
          sql += ' OFFSET ?';
          params.push(query.offset);
        }
      }

      const rows = this.db.prepare(sql).all(...params) as any[];

      const shipments: ShipmentData[] = [];
      for (const row of rows) {
        const items = this.db
          .prepare('SELECT * FROM shipment_items WHERE shipment_id = ?')
          .all(row.id) as any[];
        shipments.push(this.mapToShipmentData(row, items));
      }

      return shipments;
    } catch (error) {
      logger.error('Error finding shipments', error);
      throw new DatabaseError('Failed to find shipments', error as Error);
    }
  }

  async count(query: ShipmentQuery = {}): Promise<number> {
    try {
      const conditions: string[] = ['1 = 1'];
      const params: any[] = [];

      if (query.order_id) {
        conditions.push('order_id = ?');
        params.push(query.order_id);
      }

      if (query.status) {
        conditions.push('status = ?');
        params.push(query.status);
      }

      if (query.start_date) {
        conditions.push('shipment_date >= ?');
        params.push(query.start_date);
      }

      if (query.end_date) {
        conditions.push('shipment_date <= ?');
        params.push(query.end_date);
      }

      const sql = `SELECT COUNT(*) as count FROM shipments WHERE ${conditions.join(' AND ')}`;

      const row = this.db.prepare(sql).get(...params) as { count: number };
      return row.count;
    } catch (error) {
      logger.error('Error counting shipments', error);
      throw new DatabaseError('Failed to count shipments', error as Error);
    }
  }

  async getOrderShipments(orderId: string): Promise<ShipmentData[]> {
    return this.findAll({ order_id: orderId });
  }

  private mapToShipmentData(shipment: any, items: any[]): ShipmentData {
    return {
      id: shipment.id,
      shipment_no: shipment.shipment_no,
      order_id: shipment.order_id,
      shipment_date: shipment.shipment_date,
      status: shipment.status,
      tracking_number: shipment.tracking_number,
      carrier: shipment.carrier,
      items: items.map(item => ({
        id: item.id,
        product_id: item.product_id,
        quantity: item.quantity,
      })),
      notes: shipment.notes,
    };
  }
}

export default ShipmentsService;
