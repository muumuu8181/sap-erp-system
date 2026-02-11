import Database from 'better-sqlite3';
import { generateId, generateCode, getCurrentTimestamp, ValidationError, NotFoundError, BusinessLogicError, DatabaseError } from '../utils/helpers';
import { Logger } from '../utils/logger';
import { StockService } from './stock';

const logger = new Logger('StockTakingService');

export interface StockTakingItemData {
  id?: string;
  product_id: string;
  expected_quantity: number;
  actual_quantity: number;
  discrepancy?: number;
  notes?: string;
}

export interface StockTakingData {
  id?: string;
  taking_no?: string;
  location_id?: string;
  taking_date: string;
  status?: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  items: StockTakingItemData[];
  notes?: string;
}

export interface UpdateStockTakingData {
  status?: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  notes?: string;
}

export class StockTakingService {
  private db: Database.Database;
  private takingCounter: number = 1;

  constructor(db: Database.Database) {
    this.db = db;
    this.initializeTakingCounter();
  }

  private initializeTakingCounter(): void {
    const row = this.db
      .prepare('SELECT MAX(taking_no) as max_taking FROM stock_taking')
      .get() as { max_taking: string | null };

    if (row && row.max_taking) {
      const match = row.max_taking.match(/ST(\d+)/);
      if (match) {
        this.takingCounter = parseInt(match[1], 10) + 1;
      }
    }
  }

  private getNextTakingNo(): string {
    return generateCode('ST', this.takingCounter++);
  }

  async validateStockTakingData(data: StockTakingData): Promise<void> {
    if (!data.taking_date) {
      throw new ValidationError('Taking date is required');
    }

    if (!data.items || data.items.length === 0) {
      throw new ValidationError('Stock taking must have at least one item');
    }

    for (const item of data.items) {
      if (!item.product_id) {
        throw new ValidationError('Product ID is required for all items');
      }

      const product = this.db
        .prepare('SELECT id FROM products WHERE id = ?')
        .get(item.product_id);

      if (!product) {
        throw new NotFoundError('Product', item.product_id);
      }

      if (item.expected_quantity < 0) {
        throw new ValidationError('Expected quantity cannot be negative');
      }

      if (item.actual_quantity < 0) {
        throw new ValidationError('Actual quantity cannot be negative');
      }
    }
  }

  async create(data: StockTakingData): Promise<string> {
    try {
      await this.validateStockTakingData(data);

      const id = data.id || generateId();
      const takingNo = data.taking_no || this.getNextTakingNo();
      const now = getCurrentTimestamp();

      this.db.prepare('BEGIN TRANSACTION').run();

      try {
        const stmt = this.db.prepare(`
          INSERT INTO stock_taking (
            id, taking_no, taking_date, status, notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          id,
          takingNo,
          data.taking_date,
          data.status || 'DRAFT',
          data.notes || null,
          now,
          now
        );

        for (const item of data.items) {
          const difference = item.actual_quantity - item.expected_quantity;

          const itemStmt = this.db.prepare(`
            INSERT INTO stock_taking_items (
              id, taking_id, product_id, expected_quantity, actual_quantity,
              difference, notes, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `);

          itemStmt.run(
            generateId(),
            id,
            item.product_id,
            item.expected_quantity,
            item.actual_quantity,
            difference,
            item.notes || null,
            now
          );
        }

        this.db.prepare('COMMIT').run();

        logger.info(`Stock taking created: ${id}`);
        return id;
      } catch (error) {
        this.db.prepare('ROLLBACK').run();
        throw error;
      }
    } catch (error) {
      logger.error('Error creating stock taking', error);
      if (error instanceof ValidationError || error instanceof NotFoundError) {
        throw error;
      }
      throw new DatabaseError('Failed to create stock taking', error as Error);
    }
  }

  async update(id: string, data: UpdateStockTakingData): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError('Stock Taking', id);
      }

      if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
        throw new BusinessLogicError('Cannot update completed or cancelled stock taking');
      }

      const updates: string[] = [];
      const values: any[] = [];

      if (data.status !== undefined) {
        if (!['DRAFT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(data.status)) {
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
        UPDATE stock_taking SET ${updates.join(', ')} WHERE id = ?
      `);

      stmt.run(...values);

      if (data.status === 'COMPLETED') {
        await this.processStockTaking(id);
      }

      logger.info(`Stock taking updated: ${id}`);
    } catch (error) {
      logger.error('Error updating stock taking', error);
      if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to update stock taking', error as Error);
    }
  }

  private async processStockTaking(takingId: string): Promise<void> {
    const items = this.db
      .prepare('SELECT product_id, actual_quantity FROM stock_taking_items WHERE taking_id = ?')
      .all(takingId) as any[];

    for (const item of items) {
      const currentStock = this.db
        .prepare('SELECT quantity_on_hand FROM inventory_stock WHERE product_id = ?')
        .get(item.product_id) as any;

      if (currentStock && currentStock.quantity_on_hand !== item.actual_quantity) {
        this.db.prepare(`
          UPDATE inventory_stock
          SET quantity_on_hand = ?,
              quantity_available = quantity_on_hand - quantity_allocated,
              last_count_date = (SELECT taking_date FROM stock_taking WHERE id = ?),
              updated_at = ?
          WHERE product_id = ?
        `).run(item.actual_quantity, takingId, getCurrentTimestamp(), item.product_id);

        this.db.prepare(`
          INSERT INTO stock_movements (
            id, product_id, movement_type, quantity, reference_id,
            reference_type, movement_date, notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          generateId(),
          item.product_id,
          'ADJUSTMENT',
          item.actual_quantity,
          takingId,
          'STOCK_TAKING',
          getCurrentTimestamp(),
          'Stock taking adjustment',
          getCurrentTimestamp()
        );
      }
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError('Stock Taking', id);
      }

      if (existing.status === 'COMPLETED') {
        throw new BusinessLogicError('Cannot delete completed stock taking');
      }

      this.db.prepare('DELETE FROM stock_taking_items WHERE taking_id = ?').run(id);
      this.db.prepare('DELETE FROM stock_taking WHERE id = ?').run(id);

      logger.info(`Stock taking deleted: ${id}`);
    } catch (error) {
      logger.error('Error deleting stock taking', error);
      if (error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to delete stock taking', error as Error);
    }
  }

  async findById(id: string): Promise<StockTakingData | null> {
    try {
      const row = this.db
        .prepare('SELECT * FROM stock_taking WHERE id = ?')
        .get(id) as any;

      if (!row) {
        return null;
      }

      const items = this.db
        .prepare('SELECT * FROM stock_taking_items WHERE taking_id = ?')
        .all(id) as any[];

      return this.mapToStockTakingData(row, items);
    } catch (error) {
      logger.error('Error finding stock taking', error);
      throw new DatabaseError('Failed to find stock taking', error as Error);
    }
  }

  async findByTakingNo(takingNo: string): Promise<StockTakingData | null> {
    try {
      const row = this.db
        .prepare('SELECT * FROM stock_taking WHERE taking_no = ?')
        .get(takingNo) as any;

      if (!row) {
        return null;
      }

      const items = this.db
        .prepare('SELECT * FROM stock_taking_items WHERE taking_id = ?')
        .all(row.id) as any[];

      return this.mapToStockTakingData(row, items);
    } catch (error) {
      logger.error('Error finding stock taking by number', error);
      throw new DatabaseError('Failed to find stock taking by number', error as Error);
    }
  }

  async findAll(limit: number = 50, offset: number = 0): Promise<StockTakingData[]> {
    try {
      const rows = this.db
        .prepare('SELECT * FROM stock_taking ORDER BY taking_date DESC LIMIT ? OFFSET ?')
        .all(limit, offset) as any[];

      const results: StockTakingData[] = [];
      for (const row of rows) {
        const items = this.db
          .prepare('SELECT * FROM stock_taking_items WHERE taking_id = ?')
          .all(row.id) as any[];
        results.push(this.mapToStockTakingData(row, items));
      }

      return results;
    } catch (error) {
      logger.error('Error finding stock takings', error);
      throw new DatabaseError('Failed to find stock takings', error as Error);
    }
  }

  async count(): Promise<number> {
    try {
      const row = this.db
        .prepare('SELECT COUNT(*) as count FROM stock_taking')
        .get() as { count: number };
      return row.count;
    } catch (error) {
      logger.error('Error counting stock takings', error);
      throw new DatabaseError('Failed to count stock takings', error as Error);
    }
  }

  async getDiscrepancies(takingId: string): Promise<any[]> {
    try {
      const rows = this.db
        .prepare(`
          SELECT
            sti.*,
            p.code,
            p.name,
            p.unit
          FROM stock_taking_items sti
          JOIN products p ON sti.product_id = p.id
          WHERE sti.taking_id = ? AND sti.difference != 0
          ORDER BY ABS(sti.difference) DESC
        `)
        .all(takingId) as any[];

      return rows.map(row => ({
        product_id: row.product_id,
        product_code: row.code,
        product_name: row.name,
        unit: row.unit,
        expected_quantity: row.expected_quantity,
        actual_quantity: row.actual_quantity,
        difference: row.difference,
        notes: row.notes,
      }));
    } catch (error) {
      logger.error('Error getting discrepancies', error);
      throw new DatabaseError('Failed to get discrepancies', error as Error);
    }
  }

  async confirmStocktaking(takingId: string): Promise<void> {
    try {
      const taking = await this.findById(takingId);
      if (!taking) {
        throw new NotFoundError('Stock Taking', takingId);
      }

      if (taking.status !== 'COMPLETED') {
        throw new BusinessLogicError('Cannot confirm uncompleted stock taking');
      }

      // Create stock movements for discrepancies
      for (const item of taking.items) {
        const discrepancy = item.discrepancy || 0;
        if (discrepancy !== 0) {
          const stockService = new StockService(this.db);
          // Use ADJUSTMENT movement to adjust stock by discrepancy amount
          await stockService.createMovement({
            product_id: item.product_id,
            movement_type: 'ADJUSTMENT',
            quantity: discrepancy,
            reference_id: takingId,
            reference_type: 'STOCKTAKING',
            notes: `Stock taking adjustment`,
          });
        }
      }

      logger.info(`Stock taking confirmed and adjustments applied: ${takingId}`);
    } catch (error) {
      logger.error('Error confirming stock taking', error);
      if (error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to confirm stock taking', error as Error);
    }
  }

  private mapToStockTakingData(taking: any, items: any[]): StockTakingData {
    return {
      id: taking.id,
      taking_no: taking.taking_no,
      taking_date: taking.taking_date,
      status: taking.status,
      items: items.map(item => ({
        id: item.id,
        product_id: item.product_id,
        expected_quantity: item.expected_quantity,
        actual_quantity: item.actual_quantity,
        discrepancy: item.difference,
        notes: item.notes,
      })),
      notes: taking.notes,
    };
  }
}

export default StockTakingService;
