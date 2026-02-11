import Database from 'better-sqlite3';
import { generateId, generateCode, getCurrentTimestamp, ValidationError, NotFoundError, BusinessLogicError, DatabaseError } from '../utils/helpers';
import { Logger } from '../utils/logger';

const logger = new Logger('ProductsService');

export interface ProductData {
  id?: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  cost_price: number;
  selling_price: number;
  tax_rate?: number;
  weight?: number;
  dimensions?: string;
  reorder_level?: number;
  is_active?: boolean;
}

export interface UpdateProductData {
  name?: string;
  category?: string;
  unit?: string;
  cost_price?: number;
  selling_price?: number;
  tax_rate?: number;
  weight?: number;
  dimensions?: string;
  reorder_level?: number;
  is_active?: boolean;
}

export interface ProductQuery {
  category?: string;
  is_active?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export class ProductsService {
  private db: Database.Database;
  private codeCounter: number = 1;

  constructor(db: Database.Database) {
    this.db = db;
    this.initializeCodeCounter();
  }

  private initializeCodeCounter(): void {
    const row = this.db
      .prepare('SELECT MAX(code) as max_code FROM products')
      .get() as { max_code: string | null };

    if (row && row.max_code) {
      const match = row.max_code.match(/PRD(\d+)/);
      if (match) {
        this.codeCounter = parseInt(match[1], 10) + 1;
      }
    }
  }

  private getNextCode(): string {
    return generateCode('PRD', this.codeCounter++);
  }

  async validateProductData(data: ProductData): Promise<void> {
    if (!data.name || data.name.trim().length === 0) {
      throw new ValidationError('Product name is required');
    }

    if (!data.category || data.category.trim().length === 0) {
      throw new ValidationError('Product category is required');
    }

    if (!data.unit || data.unit.trim().length === 0) {
      throw new ValidationError('Product unit is required');
    }

    if (data.cost_price === undefined || data.cost_price < 0) {
      throw new ValidationError('Valid cost price is required');
    }

    if (data.selling_price === undefined || data.selling_price < 0) {
      throw new ValidationError('Valid selling price is required');
    }

    if (data.selling_price < data.cost_price) {
      throw new ValidationError('Selling price cannot be less than cost price');
    }

    if (data.tax_rate !== undefined && (data.tax_rate < 0 || data.tax_rate > 1)) {
      throw new ValidationError('Tax rate must be between 0 and 1');
    }

    const existing = this.db
      .prepare('SELECT id FROM products WHERE code = ?')
      .get(data.code) as { id: string } | undefined;

    if (existing && existing.id !== data.id) {
      throw new BusinessLogicError('Product code already exists');
    }
  }

  async create(data: ProductData): Promise<string> {
    try {
      await this.validateProductData(data);

      const id = data.id || generateId();
      const code = data.code || this.getNextCode();
      const now = getCurrentTimestamp();

      const stmt = this.db.prepare(`
        INSERT INTO products (
          id, code, name, category, unit, cost_price, selling_price,
          tax_rate, weight, dimensions, is_active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        code,
        data.name.trim(),
        data.category.trim(),
        data.unit.trim(),
        data.cost_price,
        data.selling_price,
        data.tax_rate || 0.10,
        data.weight || null,
        data.dimensions || null,
        data.is_active !== undefined ? data.is_active ? 1 : 0 : 1,
        now,
        now
      );

      await this.createInventoryStock(id);

      logger.info(`Product created: ${id}`);
      return id;
    } catch (error) {
      logger.error('Error creating product', error);
      if (error instanceof ValidationError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to create product', error as Error);
    }
  }

  private async createInventoryStock(productId: string): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO inventory_stock (
        id, product_id, warehouse_location, quantity_on_hand,
        quantity_allocated, quantity_available, reorder_level,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      generateId(),
      productId,
      'MAIN',
      0,
      0,
      0,
      0,
      getCurrentTimestamp(),
      getCurrentTimestamp()
    );
  }

  async update(id: string, data: UpdateProductData): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError('Product', id);
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
      if (data.unit !== undefined) {
        updates.push('unit = ?');
        values.push(data.unit.trim());
      }
      if (data.cost_price !== undefined) {
        if (data.cost_price < 0) {
          throw new ValidationError('Cost price cannot be negative');
        }
        // Check if cost_price would be greater than selling_price
        const currentSellingPrice = data.selling_price !== undefined ? data.selling_price : existing.selling_price;
        if (data.cost_price > currentSellingPrice) {
          throw new ValidationError('Cost price cannot be greater than selling price');
        }
        updates.push('cost_price = ?');
        values.push(data.cost_price);
      }
      if (data.selling_price !== undefined) {
        if (data.selling_price < 0) {
          throw new ValidationError('Selling price cannot be negative');
        }
        if (data.selling_price < existing.cost_price) {
          throw new ValidationError('Selling price cannot be less than cost price');
        }
        updates.push('selling_price = ?');
        values.push(data.selling_price);
      }
      if (data.tax_rate !== undefined) {
        if (data.tax_rate < 0 || data.tax_rate > 1) {
          throw new ValidationError('Tax rate must be between 0 and 1');
        }
        updates.push('tax_rate = ?');
        values.push(data.tax_rate);
      }
      if (data.weight !== undefined) {
        updates.push('weight = ?');
        values.push(data.weight);
      }
      if (data.dimensions !== undefined) {
        updates.push('dimensions = ?');
        values.push(data.dimensions);
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
        UPDATE products SET ${updates.join(', ')} WHERE id = ?
      `);

      stmt.run(...values);

      logger.info(`Product updated: ${id}`);
    } catch (error) {
      logger.error('Error updating product', error);
      if (error instanceof ValidationError || error instanceof NotFoundError) {
        throw error;
      }
      throw new DatabaseError('Failed to update product', error as Error);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError('Product', id);
      }

      const hasOrders = this.db
        .prepare('SELECT COUNT(*) as count FROM sales_order_items WHERE product_id = ?')
        .get(id) as { count: number };

      if (hasOrders.count > 0) {
        throw new BusinessLogicError('Cannot delete product with existing orders');
      }

      this.db.prepare('DELETE FROM inventory_stock WHERE product_id = ?').run(id);
      this.db.prepare('DELETE FROM stock_movements WHERE product_id = ?').run(id);
      this.db.prepare('DELETE FROM products WHERE id = ?').run(id);

      logger.info(`Product deleted: ${id}`);
    } catch (error) {
      logger.error('Error deleting product', error);
      if (error instanceof NotFoundError || error instanceof BusinessLogicError) {
        throw error;
      }
      throw new DatabaseError('Failed to delete product', error as Error);
    }
  }

  async findById(id: string): Promise<ProductData | null> {
    try {
      const row = this.db
        .prepare('SELECT * FROM products WHERE id = ?')
        .get(id) as any;

      if (!row) {
        return null;
      }

      return this.mapToProductData(row);
    } catch (error) {
      logger.error('Error finding product', error);
      throw new DatabaseError('Failed to find product', error as Error);
    }
  }

  async findByCode(code: string): Promise<ProductData | null> {
    try {
      const row = this.db
        .prepare('SELECT * FROM products WHERE code = ?')
        .get(code) as any;

      if (!row) {
        return null;
      }

      return this.mapToProductData(row);
    } catch (error) {
      logger.error('Error finding product by code', error);
      throw new DatabaseError('Failed to find product by code', error as Error);
    }
  }

  async findAll(query: ProductQuery = {}): Promise<ProductData[]> {
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
        conditions.push('(name LIKE ? OR code LIKE ?)');
        const searchTerm = `%${query.search}%`;
        params.push(searchTerm, searchTerm);
      }

      let sql = `SELECT * FROM products WHERE ${conditions.join(' AND ')} ORDER BY code`;

      if (query.limit) {
        sql += ' LIMIT ?';
        params.push(query.limit);
        if (query.offset) {
          sql += ' OFFSET ?';
          params.push(query.offset);
        }
      }

      const rows = this.db.prepare(sql).all(...params) as any[];
      return rows.map(row => this.mapToProductData(row));
    } catch (error) {
      logger.error('Error finding products', error);
      throw new DatabaseError('Failed to find products', error as Error);
    }
  }

  async count(query: ProductQuery = {}): Promise<number> {
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
        conditions.push('(name LIKE ? OR code LIKE ?)');
        const searchTerm = `%${query.search}%`;
        params.push(searchTerm, searchTerm);
      }

      const sql = `SELECT COUNT(*) as count FROM products WHERE ${conditions.join(' AND ')}`;

      const row = this.db.prepare(sql).get(...params) as { count: number };
      return row.count;
    } catch (error) {
      logger.error('Error counting products', error);
      throw new DatabaseError('Failed to count products', error as Error);
    }
  }

  async getCategories(): Promise<string[]> {
    try {
      const rows = this.db
        .prepare('SELECT DISTINCT category FROM products WHERE is_active = 1 ORDER BY category')
        .all() as any[];

      return rows.map(row => row.category);
    } catch (error) {
      logger.error('Error getting product categories', error);
      throw new DatabaseError('Failed to get product categories', error as Error);
    }
  }

  private mapToProductData(row: any): ProductData {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      category: row.category,
      unit: row.unit,
      cost_price: row.cost_price,
      selling_price: row.selling_price,
      tax_rate: row.tax_rate,
      weight: row.weight,
      dimensions: row.dimensions,
      is_active: row.is_active === 1,
    };
  }

  async getProductStats(id: string): Promise<any> {
    try {
      const product = await this.findById(id);
      if (!product) {
        throw new NotFoundError('Product', id);
      }

      const stock = this.db
        .prepare('SELECT * FROM inventory_stock WHERE product_id = ?')
        .get(id) as any;

      const totalSold = this.db
        .prepare(`
          SELECT COALESCE(SUM(quantity), 0) as total_sold
          FROM sales_order_items
          WHERE product_id = ?
        `)
        .get(id) as { total_sold: number };

      return {
        product,
        stock: stock ? {
          quantity_on_hand: stock.quantity_on_hand,
          quantity_allocated: stock.quantity_allocated,
          quantity_available: stock.quantity_available,
          reorder_level: stock.reorder_level,
        } : null,
        total_sold: totalSold.total_sold,
      };
    } catch (error) {
      logger.error('Error getting product stats', error);
      if (error instanceof NotFoundError) {
        throw error;
      }
      throw new DatabaseError('Failed to get product stats', error as Error);
    }
  }
}

export default ProductsService;
