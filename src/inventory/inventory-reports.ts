import Database from 'better-sqlite3';
import { Logger } from '../utils/logger';

const logger = new Logger('InventoryReportsService');

export interface InventorySummary {
  total_products: number;
  total_quantity_on_hand: number;
  total_stock_value: number;
  low_stock_products: number;
  out_of_stock_products: number;
}

export interface InventoryTurnover {
  product_id: string;
  product_name: string;
  category: string;
  average_stock: number;
  cost_of_goods_sold: number;
  turnover_ratio: number;
  days_in_inventory: number;
}

export interface StockMovementSummary {
  movement_type: string;
  total_quantity: number;
  movement_count: number;
}

export class InventoryReportsService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  async getInventorySummary(): Promise<InventorySummary> {
    try {
      const row = this.db
        .prepare(`
          SELECT
            COUNT(*) as total_products,
            SUM(quantity_on_hand) as total_quantity_on_hand,
            SUM(quantity_on_hand * p.cost_price) as total_stock_value
          FROM inventory_stock is
          JOIN products p ON is.product_id = p.id
        `)
        .get() as any;

      const lowStockRow = this.db
        .prepare(`
          SELECT COUNT(*) as count
          FROM inventory_stock
          WHERE quantity_available > 0 AND quantity_available <= reorder_level
        `)
        .get() as { count: number };

      const outOfStockRow = this.db
        .prepare(`
          SELECT COUNT(*) as count
          FROM inventory_stock
          WHERE quantity_available = 0
        `)
        .get() as { count: number };

      return {
        total_products: row.total_products || 0,
        total_quantity_on_hand: row.total_quantity_on_hand || 0,
        total_stock_value: row.total_stock_value || 0,
        low_stock_products: lowStockRow.count || 0,
        out_of_stock_products: outOfStockRow.count || 0,
      };
    } catch (error) {
      logger.error('Error getting inventory summary', error);
      throw error;
    }
  }

  async getLowStockProducts(): Promise<any[]> {
    try {
      const rows = this.db
        .prepare(`
          SELECT
            p.id,
            p.code,
            p.name,
            p.category,
            p.unit,
            is.quantity_on_hand,
            is.quantity_available,
            is.reorder_level,
            (is.reorder_level - is.quantity_available) as needed_quantity
          FROM inventory_stock is
          JOIN products p ON is.product_id = p.id
          WHERE is.quantity_available <= is.reorder_level
          ORDER BY (is.reorder_level - is.quantity_available) DESC
        `)
        .all() as any[];

      return rows.map(row => ({
        product_id: row.id,
        product_code: row.code,
        product_name: row.name,
        category: row.category,
        unit: row.unit,
        quantity_on_hand: row.quantity_on_hand,
        quantity_available: row.quantity_available,
        reorder_level: row.reorder_level,
        needed_quantity: Math.max(0, row.needed_quantity),
      }));
    } catch (error) {
      logger.error('Error getting low stock products', error);
      throw error;
    }
  }

  async getOutOfStockProducts(): Promise<any[]> {
    try {
      const rows = this.db
        .prepare(`
          SELECT
            p.id,
            p.code,
            p.name,
            p.category,
            p.unit,
            is.quantity_on_hand,
            is.quantity_allocated,
            is.reorder_level
          FROM inventory_stock is
          JOIN products p ON is.product_id = p.id
          WHERE is.quantity_available = 0 AND p.is_active = 1
          ORDER BY p.code
        `)
        .all() as any[];

      return rows.map(row => ({
        product_id: row.id,
        product_code: row.code,
        product_name: row.name,
        category: row.category,
        unit: row.unit,
        quantity_on_hand: row.quantity_on_hand,
        quantity_allocated: row.quantity_allocated,
        reorder_level: row.reorder_level,
      }));
    } catch (error) {
      logger.error('Error getting out of stock products', error);
      throw error;
    }
  }

  async getStockByCategory(): Promise<any[]> {
    try {
      const rows = this.db
        .prepare(`
          SELECT
            p.category,
            COUNT(*) as product_count,
            SUM(is.quantity_on_hand) as total_quantity,
            SUM(is.quantity_on_hand * p.cost_price) as total_value,
            AVG(p.cost_price) as avg_cost
          FROM inventory_stock is
          JOIN products p ON is.product_id = p.id
          GROUP BY p.category
          ORDER BY total_value DESC
        `)
        .all() as any[];

      return rows.map(row => ({
        category: row.category,
        product_count: row.product_count,
        total_quantity: row.total_quantity,
        total_value: row.total_value,
        avg_cost: row.avg_cost,
      }));
    } catch (error) {
      logger.error('Error getting stock by category', error);
      throw error;
    }
  }

  async getInventoryTurnover(startDate: string, endDate: string, limit: number = 20): Promise<InventoryTurnover[]> {
    try {
      const daysInPeriod = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));

      const rows = this.db
        .prepare(`
          WITH product_sales AS (
            SELECT
              p.id as product_id,
              p.name as product_name,
              p.category,
              SUM(soi.quantity) as total_sold,
              SUM(soi.quantity * p.cost_price) as cost_of_goods_sold
            FROM products p
            JOIN sales_order_items soi ON p.id = soi.product_id
            JOIN sales_orders so ON soi.order_id = so.id
            WHERE so.order_date >= ? AND so.order_date <= ?
              AND so.status != 'CANCELLED'
            GROUP BY p.id, p.name, p.category
          ),
          stock_levels AS (
            SELECT
              product_id,
              AVG(quantity_on_hand) as average_stock
            FROM inventory_stock
            GROUP BY product_id
          )
          SELECT
            ps.product_id,
            ps.product_name,
            ps.category,
            COALESCE(sl.average_stock, 0) as average_stock,
            COALESCE(ps.cost_of_goods_sold, 0) as cost_of_goods_sold
          FROM product_sales ps
          LEFT JOIN stock_levels sl ON ps.product_id = sl.product_id
          WHERE ps.cost_of_goods_sold > 0
          ORDER BY ps.cost_of_goods_sold DESC
          LIMIT ?
        `)
        .all(startDate, endDate, limit) as any[];

      return rows.map(row => {
        const turnoverRatio = row.average_stock > 0 ? row.cost_of_goods_sold / row.average_stock : 0;
        const daysInInventory = turnoverRatio > 0 ? daysInPeriod / turnoverRatio : 0;

        return {
          product_id: row.product_id,
          product_name: row.product_name,
          category: row.category,
          average_stock: row.average_stock,
          cost_of_goods_sold: row.cost_of_goods_sold,
          turnover_ratio: Math.round(turnoverRatio * 100) / 100,
          days_in_inventory: Math.round(daysInInventory * 100) / 100,
        };
      });
    } catch (error) {
      logger.error('Error getting inventory turnover', error);
      throw error;
    }
  }

  async getStockMovementSummary(startDate: string, endDate: string): Promise<StockMovementSummary[]> {
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
        total_quantity: row.total_quantity,
        movement_count: row.movement_count,
      }));
    } catch (error) {
      logger.error('Error getting stock movement summary', error);
      throw error;
    }
  }

  async getProductPerformance(startDate: string, endDate: string, limit: number = 20): Promise<any[]> {
    try {
      const rows = this.db
        .prepare(`
          SELECT
            p.id as product_id,
            p.code,
            p.name,
            p.category,
            p.cost_price,
            p.selling_price,
            COUNT(DISTINCT so.id) as order_count,
            SUM(soi.quantity) as total_sold,
            SUM(soi.total_amount) as total_revenue,
            SUM(soi.quantity * p.cost_price) as total_cost,
            SUM(soi.total_amount) - SUM(soi.quantity * p.cost_price) as profit
          FROM products p
          JOIN sales_order_items soi ON p.id = soi.product_id
          JOIN sales_orders so ON soi.order_id = so.id
          WHERE so.order_date >= ? AND so.order_date <= ?
            AND so.status != 'CANCELLED'
          GROUP BY p.id, p.code, p.name, p.category, p.cost_price, p.selling_price
          HAVING total_sold > 0
          ORDER BY total_revenue DESC
          LIMIT ?
        `)
        .all(startDate, endDate, limit) as any[];

      return rows.map(row => ({
        product_id: row.product_id,
        product_code: row.code,
        product_name: row.name,
        category: row.category,
        cost_price: row.cost_price,
        selling_price: row.selling_price,
        order_count: row.order_count,
        total_sold: row.total_sold,
        total_revenue: row.total_revenue,
        total_cost: row.total_cost,
        profit: row.profit,
        profit_margin: row.total_revenue > 0 ? Math.round((row.profit / row.total_revenue) * 10000) / 100 : 0,
      }));
    } catch (error) {
      logger.error('Error getting product performance', error);
      throw error;
    }
  }

  async getABCAnalysis(): Promise<any[]> {
    try {
      const totalValueRow = this.db
        .prepare(`
          SELECT SUM(quantity_on_hand * p.cost_price) as total_value
          FROM inventory_stock is
          JOIN products p ON is.product_id = p.id
        `)
        .get() as any;

      const totalValue = totalValueRow.total_value || 0;

      const rows = this.db
        .prepare(`
          SELECT
            p.id,
            p.code,
            p.name,
            p.category,
            is.quantity_on_hand,
            (is.quantity_on_hand * p.cost_price) as item_value
          FROM inventory_stock is
          JOIN products p ON is.product_id = p.id
          WHERE is.quantity_on_hand > 0
          ORDER BY item_value DESC
        `)
        .all() as any[];

      let cumulativeValue = 0;
      const result = [];

      for (const row of rows) {
        cumulativeValue += row.item_value;
        const percentage = totalValue > 0 ? (cumulativeValue / totalValue) * 100 : 0;

        let abcClass;
        if (percentage <= 80) {
          abcClass = 'A';
        } else if (percentage <= 95) {
          abcClass = 'B';
        } else {
          abcClass = 'C';
        }

        result.push({
          product_id: row.id,
          product_code: row.code,
          product_name: row.name,
          category: row.category,
          quantity_on_hand: row.quantity_on_hand,
          item_value: row.item_value,
          cumulative_value: cumulativeValue,
          cumulative_percentage: Math.round(percentage * 100) / 100,
          abc_class: abcClass,
        });
      }

      return result;
    } catch (error) {
      logger.error('Error getting ABC analysis', error);
      throw error;
    }
  }

  async getExpiringProducts(): Promise<any[]> {
    try {
      const rows = this.db
        .prepare(`
          SELECT
            p.id,
            p.code,
            p.name,
            p.category,
            is.quantity_on_hand,
            is.last_count_date
          FROM inventory_stock is
          JOIN products p ON is.product_id = p.id
          WHERE is.quantity_on_hand > 0
          ORDER BY is.last_count_date ASC
          LIMIT 50
        `)
        .all() as any[];

      return rows.map(row => ({
        product_id: row.id,
        product_code: row.code,
        product_name: row.name,
        category: row.category,
        quantity_on_hand: row.quantity_on_hand,
        last_count_date: row.last_count_date,
        days_since_count: row.last_count_date ? Math.floor((Date.now() - new Date(row.last_count_date).getTime()) / (1000 * 60 * 60 * 24)) : null,
      }));
    } catch (error) {
      logger.error('Error getting expiring products', error);
      throw error;
    }
  }

  async getWarehouseLocationSummary(): Promise<any[]> {
    try {
      const rows = this.db
        .prepare(`
          SELECT
            warehouse_location,
            COUNT(*) as product_count,
            SUM(quantity_on_hand) as total_quantity,
            SUM(quantity_on_hand * p.cost_price) as total_value
          FROM inventory_stock is
          JOIN products p ON is.product_id = p.id
          GROUP BY warehouse_location
          ORDER BY total_value DESC
        `)
        .all() as any[];

      return rows.map(row => ({
        warehouse_location: row.warehouse_location,
        product_count: row.product_count,
        total_quantity: row.total_quantity,
        total_value: row.total_value,
      }));
    } catch (error) {
      logger.error('Error getting warehouse location summary', error);
      throw error;
    }
  }
}

export default InventoryReportsService;
