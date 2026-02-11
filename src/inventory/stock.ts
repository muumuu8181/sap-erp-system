import Database from 'better-sqlite3';
import { generateId, getCurrentTimestamp, ValidationError, NotFoundError, BusinessLogicError, DatabaseError } from '../utils/helpers';
import { Logger } from '../utils/logger';

const logger = new Logger('StockService');

export interface StockMovementData {
  product_id: string;
  location_id?: string;
  movement_type: 'IN' | 'OUT' | 'TRANSFER' | 'ADJUSTMENT' | 'RETURN';
  quantity: number;
  reference_id?: string;
  reference_type?: string;
  to_location_id?: string;
  notes?: string;
}

export interface StockLevel {
  product_id: string;
  quantity_on_hand: number;
  quantity_allocated: number;
  quantity_available: number;
  reorder_level: number;
}

export interface StockQuery {
  product_id?: string;
  low_stock?: boolean;
  limit?: number;
  offset?: number;
}

export class StockService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  async validateStockMovement(data: StockMovementData): Promise<void> {
    if (!data.product_id) {
      throw new ValidationError('Product ID is required');
    }

    const product = this.db
      .prepare('SELECT id, is_active FROM products WHERE id = ?')
      .get(data.product_id);

    if (!product) {
      throw new NotFoundError('Product', data.product_id);
    }

    if (!data.movement_type) {
      throw new ValidationError('Movement type is required');
    }

    if (!['IN', 'OUT', 'TRANSFER', 'ADJUSTMENT', 'RETURN'].includes(data.movement_type)) {
      throw new ValidationError('Invalid movement type');
    }

    // ADJUSTMENT can have negative quantity to reduce stock
    const isAdjustment = data.movement_type === 'ADJUSTMENT';
    if (!data.quantity || (!isAdjustment && data.quantity <= 0)) {
      throw new ValidationError('Quantity must be greater than 0');
    }

    if (data.movement_type === 'OUT' || data.movement_type === 'TRANSFER' || data.movement_type === 'RETURN') {
      const stock = this.getStockLevel(data.product_id);
      if (stock.quantity_available < data.quantity) {
        throw new BusinessLogicError('Insufficient stock available');
      }
    }
  }

  getStockLevel(productId: string): StockLevel {
    const row = this.db
      .prepare('SELECT * FROM inventory_stock WHERE product_id = ?')
      .get(productId) as any;

    if (!row) {
      throw new NotFoundError('Stock for product', productId);
    }

    return {
      product_id: row.product_id,
      quantity_on_hand: row.quantity_on_hand,
      quantity_allocated: row.quantity_allocated,
      quantity_available: row.quantity_available,
      reorder_level: row.reorder_level,
    };
  }

  async findByProductAndLocation(productId: string, locationId: string): Promise<any> {
    try {
      const row = this.db
        .prepare('SELECT * FROM inventory_stock WHERE product_id = ?')
        .get(productId) as any;

      if (!row) {
        return null;
      }

      return {
        id: row.id,
        product_id: row.product_id,
        warehouse_location: row.warehouse_location,
        quantity: row.quantity_on_hand,
        quantity_on_hand: row.quantity_on_hand,
        quantity_allocated: row.quantity_allocated,
        allocated_quantity: row.quantity_allocated,
        quantity_available: row.quantity_available,
        available_quantity: row.quantity_available,
        reorder_level: row.reorder_level,
      };
    } catch (error) {
      logger.error('Error finding stock by product and location', error);
      throw new DatabaseError('Failed to find stock', error as Error);
    }
  }

  async findByProduct(productId: string): Promise<any[]> {
    try {
      const rows = this.db
        .prepare('SELECT * FROM inventory_stock WHERE product_id = ?')
        .all(productId) as any[];

      return rows.map(row => ({
        id: row.id,
        product_id: row.product_id,
        warehouse_location: row.warehouse_location,
        quantity: row.quantity_on_hand,
        quantity_on_hand: row.quantity_on_hand,
        quantity_allocated: row.quantity_allocated,
        allocated_quantity: row.quantity_allocated,
        quantity_available: row.quantity_available,
        available_quantity: row.quantity_available,
        reorder_level: row.reorder_level,
      }));
    } catch (error) {
      logger.error('Error finding stock by product', error);
      throw new DatabaseError('Failed to find stock', error as Error);
    }
  }

  async createMovement(data: StockMovementData): Promise<string> {
    try {
      await this.validateStockMovement(data);

      const movementId = generateId();
      const now = getCurrentTimestamp();

      const stock = this.getStockLevel(data.product_id);

      let newQuantityOnHand = stock.quantity_on_hand;
      let newQuantityAllocated = stock.quantity_allocated;
      let newQuantityAvailable = stock.quantity_available;

      switch (data.movement_type) {
        case 'IN':
          newQuantityOnHand += data.quantity;
          newQuantityAvailable += data.quantity;
          break;
        case 'OUT':
          newQuantityOnHand -= data.quantity;
          newQuantityAvailable -= data.quantity;
          break;
        case 'TRANSFER':
          newQuantityAllocated += data.quantity;
          newQuantityAvailable -= data.quantity;
          break;
        case 'ADJUSTMENT':
          if (data.quantity >= 0) {
            // Positive value: SET to exact quantity
            newQuantityOnHand = data.quantity;
          } else {
            // Negative value: REDUCE by that amount
            newQuantityOnHand += data.quantity;
          }
          newQuantityAvailable = newQuantityOnHand - newQuantityAllocated;
          break;
        case 'RETURN':
          // RETURN releases allocated stock back to available (e.g., cancelled order)
          newQuantityAllocated -= Math.min(data.quantity, newQuantityAllocated);
          newQuantityAvailable = newQuantityOnHand - newQuantityAllocated;
          break;
      }

      if (newQuantityAvailable < 0) {
        throw new BusinessLogicError('Insufficient stock available');
      }

      this.db.prepare('BEGIN TRANSACTION').run();

      try {
        const movementStmt = this.db.prepare(`
          INSERT INTO stock_movements (
            id, product_id, movement_type, quantity, reference_id,
            reference_type, movement_date, notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        movementStmt.run(
          movementId,
          data.product_id,
          data.movement_type,
          data.quantity,
          data.reference_id || null,
          data.reference_type || null,
          now,
          data.notes || null,
          now
        );

        this.db.prepare(`
          UPDATE inventory_stock
          SET quantity_on_hand = ?,
              quantity_allocated = ?,
              quantity_available = ?,
              updated_at = ?
          WHERE product_id = ?
        `).run(newQuantityOnHand, newQuantityAllocated, newQuantityAvailable, now, data.product_id);

        this.db.prepare('COMMIT').run();

        logger.info(`Stock movement created: ${movementId}`);
        return movementId;
      } catch (error) {
        this.db.prepare('ROLLBACK').run();
        throw error;
      }
    } catch (error) {
      logger.error('Error creating stock movement', error);
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to create stock movement', error as Error);
    }
  }

  async allocateStock(productId: string, locationId: string, quantity: number, referenceId: string): Promise<void> {
    await this.createMovement({
      product_id: productId,
      location_id: locationId,
      movement_type: 'TRANSFER',
      quantity,
      reference_id: referenceId,
      reference_type: 'ALLOCATION',
    });
  }

  async releaseStock(productId: string, locationId: string, quantity: number, referenceId: string): Promise<void> {
    const stock = this.getStockLevel(productId);

    const releaseQuantity = Math.min(quantity, stock.quantity_allocated);

    await this.createMovement({
      product_id: productId,
      location_id: locationId,
      movement_type: 'RETURN',
      quantity: releaseQuantity,
      reference_id: referenceId,
      reference_type: 'RELEASE',
    });
  }

  async adjustStock(productId: string, newQuantity: number, reason: string): Promise<void> {
    await this.createMovement({
      product_id: productId,
      movement_type: 'ADJUSTMENT',
      quantity: newQuantity,
      notes: reason,
    });
  }

  async getStockLevels(query: StockQuery = {}): Promise<any[]> {
    try {
      const conditions: string[] = ['1 = 1'];
      const params: any[] = [];

      if (query.product_id) {
        conditions.push('stk.product_id = ?');
        params.push(query.product_id);
      }

      if (query.low_stock) {
        conditions.push('stk.quantity_available <= stk.reorder_level');
      }

      let sql = `
        SELECT
          stk.*,
          p.code,
          p.name,
          p.category,
          p.unit
        FROM inventory_stock stk
        JOIN products p ON stk.product_id = p.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY p.code
      `;

      if (query.limit) {
        sql += ' LIMIT ?';
        params.push(query.limit);
        if (query.offset) {
          sql += ' OFFSET ?';
          params.push(query.offset);
        }
      }

      const rows = this.db.prepare(sql).all(...params) as any[];

      return rows.map(row => ({
        product_id: row.product_id,
        product_code: row.code,
        product_name: row.name,
        category: row.category,
        unit: row.unit,
        warehouse_location: row.warehouse_location,
        quantity_on_hand: row.quantity_on_hand,
        quantity_allocated: row.quantity_allocated,
        quantity_available: row.quantity_available,
        reorder_level: row.reorder_level,
        is_low_stock: row.quantity_available <= row.reorder_level,
      }));
    } catch (error) {
      logger.error('Error getting stock levels', error);
      throw new DatabaseError('Failed to get stock levels', error as Error);
    }
  }

  async getLowStockProducts(): Promise<any[]> {
    return this.getStockLevels({ low_stock: true });
  }

  async getMovements(productId: string, limit: number = 100): Promise<any[]> {
    try {
      const rows = this.db
        .prepare(`
          SELECT
            sm.*,
            p.code,
            p.name
          FROM stock_movements sm
          JOIN products p ON sm.product_id = p.id
          WHERE sm.product_id = ?
          ORDER BY sm.movement_date DESC
          LIMIT ?
        `)
        .all(productId, limit) as any[];

      return rows.map(row => ({
        id: row.id,
        product_id: row.product_id,
        product_code: row.code,
        product_name: row.name,
        movement_type: row.movement_type,
        quantity: row.quantity,
        reference_id: row.reference_id,
        reference_type: row.reference_type,
        movement_date: row.movement_date,
        notes: row.notes,
      }));
    } catch (error) {
      logger.error('Error getting stock movements', error);
      throw new DatabaseError('Failed to get stock movements', error as Error);
    }
  }

  async updateReorderLevel(productId: string, reorderLevel: number): Promise<void> {
    try {
      if (reorderLevel < 0) {
        throw new ValidationError('Reorder level cannot be negative');
      }

      this.db.prepare(`
        UPDATE inventory_stock
        SET reorder_level = ?, updated_at = ?
        WHERE product_id = ?
      `).run(reorderLevel, getCurrentTimestamp(), productId);

      logger.info(`Reorder level updated for product: ${productId}`);
    } catch (error) {
      logger.error('Error updating reorder level', error);
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new DatabaseError('Failed to update reorder level', error as Error);
    }
  }

  async getStockValue(): Promise<any> {
    try {
      const row = this.db
        .prepare(`
          SELECT
            COUNT(*) as total_products,
            SUM(stk.quantity_on_hand * p.cost_price) as total_value,
            SUM(stk.quantity_available * p.cost_price) as available_value
          FROM inventory_stock stk
          JOIN products p ON stk.product_id = p.id
        `)
        .get() as any;

      return {
        total_products: row.total_products || 0,
        total_value: row.total_value || 0,
        available_value: row.available_value || 0,
      };
    } catch (error) {
      logger.error('Error getting stock value', error);
      throw new DatabaseError('Failed to get stock value', error as Error);
    }
  }

  async getStockMovementSummary(startDate: string, endDate: string): Promise<any[]> {
    try {
      const rows = this.db
        .prepare(`
          SELECT
            movement_type,
            COUNT(*) as movement_count,
            SUM(quantity) as total_quantity
          FROM stock_movements
          WHERE movement_date >= ? AND movement_date <= ?
          GROUP BY movement_type
          ORDER BY movement_type
        `)
        .all(startDate, endDate) as any[];

      return rows.map(row => ({
        movement_type: row.movement_type,
        movement_count: row.movement_count,
        total_quantity: row.total_quantity,
      }));
    } catch (error) {
      logger.error('Error getting stock movement summary', error);
      throw new DatabaseError('Failed to get stock movement summary', error as Error);
    }
  }

  async getMovementHistory(query: { product_id?: string; limit?: number } = {}): Promise<any[]> {
    try {
      const conditions: string[] = ['1 = 1'];
      const params: any[] = [];

      if (query.product_id) {
        conditions.push('sm.product_id = ?');
        params.push(query.product_id);
      }

      let sql = `
        SELECT
          sm.*,
          p.code,
          p.name
        FROM stock_movements sm
        JOIN products p ON sm.product_id = p.id
        WHERE ${conditions.join(' AND ')}
        ORDER BY sm.movement_date DESC
      `;

      if (query.limit) {
        sql += ' LIMIT ?';
        params.push(query.limit);
      }

      const rows = this.db.prepare(sql).all(...params) as any[];

      return rows.map(row => ({
        id: row.id,
        product_id: row.product_id,
        product_code: row.code,
        product_name: row.name,
        movement_type: row.movement_type,
        quantity: row.quantity,
        reference_id: row.reference_id,
        reference_type: row.reference_type,
        movement_date: row.movement_date,
        notes: row.notes,
      }));
    } catch (error) {
      logger.error('Error getting movement history', error);
      throw new DatabaseError('Failed to get movement history', error as Error);
    }
  }
}

export default StockService;
