import Database from 'better-sqlite3';
import { generateId, generateCode, getCurrentTimestamp, ValidationError, NotFoundError, BusinessLogicError, DatabaseError } from '../utils/helpers';
import { Logger } from '../utils/logger';

const logger = new Logger('ReceivingService');

export interface ReceivingItemData {
  id?: string;
  product_id: string;
  ordered_quantity: number;
  received_quantity: number;
  damaged_quantity?: number;
  notes?: string;
}

export interface ReceivingData {
  id?: string;
  receiving_no?: string;
  order_id: string;
  receiving_date: string;
  status?: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  items: ReceivingItemData[];
  notes?: string;
}

export interface UpdateReceivingData {
  receiving_date?: string;
  status?: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  notes?: string;
}

export interface ReceivingQuery {
  order_id?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}

export class ReceivingService {
  private db: Database.Database;
  private receivingCounter: number = 1;

  constructor(db: Database.Database) {
    this.db = db;
    this.initializeReceivingCounter();
  }

  private initializeReceivingCounter(): void {
    const row = this.db
      .prepare('SELECT MAX(receiving_no) as max_receiving FROM receiving')
      .get() as { max_receiving: string | null };

    if (row && row.max_receiving) {
      const match = row.max_receiving.match(/RCV(\d+)/);
      if (match) {
        this.receivingCounter = parseInt(match[1], 10) + 1;
      }
    }
  }

  private getNextReceivingNo(): string {
    return generateCode('RCV', this.receivingCounter++);
  }

  async validateReceivingData(data: ReceivingData): Promise<void> {
    if (!data.order_id) {
      throw new ValidationError('Order ID is required');
    }

    const order = this.db
      .prepare('SELECT id, status FROM purchase_orders WHERE id = ?')
      .get(data.order_id);

    if (!order) {
      throw new NotFoundError('Purchase Order', data.order_id);
    }

    const orderStatus = (order as any).status;
    if (orderStatus === 'CANCELLED') {
      throw new BusinessLogicError('Cannot receive cancelled order');
    }

    if (!data.receiving_date) {
      throw new ValidationError('Receiving date is required');
    }

    if (!data.items || data.items.length === 0) {
      throw new ValidationError('Receiving must have at least one item');
    }

    const orderItems = this.db
      .prepare('SELECT product_id, quantity FROM purchase_order_items WHERE order_id = ?')
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

      if (!item.ordered_quantity || item.ordered_quantity <= 0) {
        throw new ValidationError('Ordered quantity must be greater than 0');
      }

      if (!item.received_quantity && item.received_quantity !== 0) {
        throw new ValidationError('Received quantity is required');
      }

      if (item.received_quantity < 0) {
        throw new ValidationError('Received quantity cannot be negative');
      }

      if (item.damaged_quantity !== undefined && item.damaged_quantity < 0) {
        throw new ValidationError('Damaged quantity cannot be negative');
      }

      if (item.damaged_quantity && item.received_quantity + item.damaged_quantity > item.ordered_quantity) {
        throw new ValidationError('Total received cannot exceed ordered quantity');
      }
    }
  }

  async create(data: ReceivingData): Promise<string> {
    try {
      await this.validateReceivingData(data);

      const id = data.id || generateId();
      const receivingNo = data.receiving_no || this.getNextReceivingNo();
      const now = getCurrentTimestamp();

      this.db.prepare('BEGIN TRANSACTION').run();

      try {
        const stmt = this.db.prepare(`
          INSERT INTO receiving (
            id, receiving_no, order_id, receiving_date, status, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          id,
          receivingNo,
          data.order_id,
          data.receiving_date,
          data.status || 'PENDING',
          data.notes || null,
          now,
          now
        );

        for (const item of data.items) {
          const itemStmt = this.db.prepare(`
            INSERT INTO receiving_items (
              id, receiving_id, product_id, ordered_quantity, received_quantity,
              damaged_quantity, notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `);

          itemStmt.run(
            generateId(),
            id,
            item.product_id,
            item.ordered_quantity,
            item.received_quantity,
            item.damaged_quantity || 0,
            item.notes || null,
            now
          );
        }

        if (data.status === 'COMPLETED') {
          await this.processReceiving(id);
        }

        this.db.prepare('COMMIT').run();

        logger.info(`Receiving created: ${id}`);
        return id;
      } catch (error) {
        this.db.prepare('ROLLBACK').run();
        throw error;
      }
    } catch (error) {
      logger.error('Error creating receiving', error);
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to create receiving', error as Error);
    }
  }

  private async processReceiving(receivingId: string): Promise<void> {
    const items = this.db
      .prepare('SELECT product_id, received_quantity, damaged_quantity FROM receiving_items WHERE receiving_id = ?')
      .all(receivingId) as any[];

    for (const item of items) {
      const goodQuantity = item.received_quantity - (item.damaged_quantity || 0);

      if (goodQuantity > 0) {
        const movementStmt = this.db.prepare(`
          INSERT INTO stock_movements (
            id, product_id, movement_type, quantity, reference_id,
            reference_type, movement_date, notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        movementStmt.run(
          generateId(),
          item.product_id,
          'IN',
          goodQuantity,
          receivingId,
          'RECEIVING',
          getCurrentTimestamp(),
          'Goods received',
          getCurrentTimestamp()
        );

        this.db.prepare(`
          UPDATE inventory_stock
          SET quantity_on_hand = quantity_on_hand + ?,
              quantity_available = quantity_available + ?,
              updated_at = ?
          WHERE product_id = ?
        `).run(goodQuantity, goodQuantity, getCurrentTimestamp(), item.product_id);
      }

      if (item.damaged_quantity && item.damaged_quantity > 0) {
        const movementStmt = this.db.prepare(`
          INSERT INTO stock_movements (
            id, product_id, movement_type, quantity, reference_id,
            reference_type, movement_date, notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        movementStmt.run(
          generateId(),
          item.product_id,
          'OUT',
          item.damaged_quantity,
          receivingId,
          'DAMAGED',
          getCurrentTimestamp(),
          'Damaged goods',
          getCurrentTimestamp()
        );
      }
    }

    const receiving = this.db
      .prepare('SELECT order_id FROM receiving WHERE id = ?')
      .get(receivingId) as any;

    this.db.prepare('UPDATE purchase_orders SET status = ?, updated_at = ? WHERE id = ?')
      .run('RECEIVED', getCurrentTimestamp(), receiving.order_id);
  }

  async update(id: string, data: UpdateReceivingData): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError('Receiving', id);
      }

      if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
        throw new BusinessLogicError('Cannot update completed or cancelled receiving');
      }

      const updates: string[] = [];
      const values: any[] = [];

      if (data.receiving_date !== undefined) {
        updates.push('receiving_date = ?');
        values.push(data.receiving_date);
      }

      if (data.status !== undefined) {
        if (!['PENDING', 'COMPLETED', 'CANCELLED'].includes(data.status)) {
          throw new ValidationError('Invalid status');
        }
        updates.push('status = ?');
        values.push(data.status);

        if (data.status === 'COMPLETED') {
          await this.processReceiving(id);
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
        UPDATE receiving SET ${updates.join(', ')} WHERE id = ?
      `);

      stmt.run(...values);

      logger.info(`Receiving updated: ${id}`);
    } catch (error) {
      logger.error('Error updating receiving', error);
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to update receiving', error as Error);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError('Receiving', id);
      }

      if (existing.status === 'COMPLETED') {
        throw new BusinessLogicError('Cannot delete completed receiving');
      }

      this.db.prepare('DELETE FROM receiving_items WHERE receiving_id = ?').run(id);
      this.db.prepare('DELETE FROM receiving WHERE id = ?').run(id);

      logger.info(`Receiving deleted: ${id}`);
    } catch (error) {
      logger.error('Error deleting receiving', error);
      if (error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to delete receiving', error as Error);
    }
  }

  async findById(id: string): Promise<ReceivingData | null> {
    try {
      const row = this.db
        .prepare('SELECT * FROM receiving WHERE id = ?')
        .get(id) as any;

      if (!row) {
        return null;
      }

      const items = this.db
        .prepare('SELECT * FROM receiving_items WHERE receiving_id = ?')
        .all(id) as any[];

      return this.mapToReceivingData(row, items);
    } catch (error) {
      logger.error('Error finding receiving', error);
      throw new DatabaseError('Failed to find receiving', error as Error);
    }
  }

  async findByReceivingNo(receivingNo: string): Promise<ReceivingData | null> {
    try {
      const row = this.db
        .prepare('SELECT * FROM receiving WHERE receiving_no = ?')
        .get(receivingNo) as any;

      if (!row) {
        return null;
      }

      const items = this.db
        .prepare('SELECT * FROM receiving_items WHERE receiving_id = ?')
        .all(row.id) as any[];

      return this.mapToReceivingData(row, items);
    } catch (error) {
      logger.error('Error finding receiving by number', error);
      throw new DatabaseError('Failed to find receiving by number', error as Error);
    }
  }

  async findAll(query: ReceivingQuery = {}): Promise<ReceivingData[]> {
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
        conditions.push('receiving_date >= ?');
        params.push(query.start_date);
      }

      if (query.end_date) {
        conditions.push('receiving_date <= ?');
        params.push(query.end_date);
      }

      let sql = `SELECT * FROM receiving WHERE ${conditions.join(' AND ')} ORDER BY receiving_date DESC`;

      if (query.limit) {
        sql += ' LIMIT ?';
        params.push(query.limit);
        if (query.offset) {
          sql += ' OFFSET ?';
          params.push(query.offset);
        }
      }

      const rows = this.db.prepare(sql).all(...params) as any[];

      const receivings: ReceivingData[] = [];
      for (const row of rows) {
        const items = this.db
          .prepare('SELECT * FROM receiving_items WHERE receiving_id = ?')
          .all(row.id) as any[];
        receivings.push(this.mapToReceivingData(row, items));
      }

      return receivings;
    } catch (error) {
      logger.error('Error finding receivings', error);
      throw new DatabaseError('Failed to find receivings', error as Error);
    }
  }

  async count(query: ReceivingQuery = {}): Promise<number> {
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
        conditions.push('receiving_date >= ?');
        params.push(query.start_date);
      }

      if (query.end_date) {
        conditions.push('receiving_date <= ?');
        params.push(query.end_date);
      }

      const sql = `SELECT COUNT(*) as count FROM receiving WHERE ${conditions.join(' AND ')}`;

      const row = this.db.prepare(sql).get(...params) as { count: number };
      return row.count;
    } catch (error) {
      logger.error('Error counting receivings', error);
      throw new DatabaseError('Failed to count receivings', error as Error);
    }
  }

  async getOrderReceiving(orderId: string): Promise<ReceivingData[]> {
    return this.findAll({ order_id: orderId });
  }

  private mapToReceivingData(receiving: any, items: any[]): ReceivingData {
    return {
      id: receiving.id,
      receiving_no: receiving.receiving_no,
      order_id: receiving.order_id,
      receiving_date: receiving.receiving_date,
      status: receiving.status,
      items: items.map(item => ({
        id: item.id,
        product_id: item.product_id,
        ordered_quantity: item.ordered_quantity,
        received_quantity: item.received_quantity,
        damaged_quantity: item.damaged_quantity,
        notes: item.notes,
      })),
      notes: receiving.notes,
    };
  }
}

export default ReceivingService;
