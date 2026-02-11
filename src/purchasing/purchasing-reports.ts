import Database from 'better-sqlite3';
import { Logger } from '../utils/logger';

const logger = new Logger('PurchasingReportsService');

export interface PurchasingSummary {
  total_orders: number;
  total_amount: number;
  average_order_value: number;
  total_items_ordered: number;
  total_suppliers: number;
  pending_orders: number;
  received_orders: number;
}

export interface SupplierSpending {
  supplier_id: string;
  supplier_name: string;
  total_orders: number;
  total_amount: number;
}

export interface PurchaseByCategory {
  category: string;
  orders: number;
  amount: number;
}

export class PurchasingReportsService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  async getPurchasingSummary(startDate?: string, endDate?: string): Promise<PurchasingSummary> {
    try {
      let dateFilter = '';
      const params: any[] = [];

      if (startDate && endDate) {
        dateFilter = 'WHERE order_date >= ? AND order_date <= ?';
        params.push(startDate, endDate);
      } else if (startDate) {
        dateFilter = 'WHERE order_date >= ?';
        params.push(startDate);
      } else if (endDate) {
        dateFilter = 'WHERE order_date <= ?';
        params.push(endDate);
      }

      const row = this.db
        .prepare(`
          SELECT
            COUNT(*) as total_orders,
            COALESCE(SUM(total_amount), 0) as total_amount,
            COALESCE(AVG(total_amount), 0) as average_order_value
          FROM purchase_orders
          ${dateFilter}
          AND status != 'CANCELLED'
        `)
        .get(...params) as any;

      const itemsRow = this.db
        .prepare(`
          SELECT COALESCE(SUM(poi.quantity), 0) as total_items
          FROM purchase_order_items poi
          JOIN purchase_orders po ON poi.order_id = po.id
          ${dateFilter}
          AND po.status != 'CANCELLED'
        `)
        .get(...params) as any;

      const suppliersRow = this.db
        .prepare(`
          SELECT COUNT(DISTINCT supplier_id) as total_suppliers
          FROM purchase_orders
          ${dateFilter}
          AND status != 'CANCELLED'
        `)
        .get(...params) as any;

      const statusRow = this.db
        .prepare(`
          SELECT
            SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending_orders,
            SUM(CASE WHEN status = 'RECEIVED' THEN 1 ELSE 0 END) as received_orders
          FROM purchase_orders
          ${dateFilter}
        `)
        .get(...params) as any;

      return {
        total_orders: row.total_orders,
        total_amount: row.total_amount,
        average_order_value: row.average_order_value,
        total_items_ordered: itemsRow.total_items,
        total_suppliers: suppliersRow.total_suppliers,
        pending_orders: statusRow.pending_orders || 0,
        received_orders: statusRow.received_orders || 0,
      };
    } catch (error) {
      logger.error('Error getting purchasing summary', error);
      throw error;
    }
  }

  async getSupplierSpending(limit: number = 10, startDate?: string, endDate?: string): Promise<SupplierSpending[]> {
    try {
      let dateFilter = '';
      const params: any[] = [];

      if (startDate && endDate) {
        dateFilter = 'AND po.order_date >= ? AND po.order_date <= ?';
        params.push(startDate, endDate);
      } else if (startDate) {
        dateFilter = 'AND po.order_date >= ?';
        params.push(startDate);
      } else if (endDate) {
        dateFilter = 'AND po.order_date <= ?';
        params.push(endDate);
      }

      params.push(limit);

      const rows = this.db
        .prepare(`
          SELECT
            s.id as supplier_id,
            s.name as supplier_name,
            COUNT(po.id) as total_orders,
            COALESCE(SUM(po.total_amount), 0) as total_amount
          FROM suppliers s
          LEFT JOIN purchase_orders po ON s.id = po.supplier_id AND po.status != 'CANCELLED' ${dateFilter}
          GROUP BY s.id, s.name
          HAVING total_orders > 0
          ORDER BY total_amount DESC
          LIMIT ?
        `)
        .all(...params) as any[];

      return rows.map(row => ({
        supplier_id: row.supplier_id,
        supplier_name: row.supplier_name,
        total_orders: row.total_orders,
        total_amount: row.total_amount,
      }));
    } catch (error) {
      logger.error('Error getting supplier spending', error);
      throw error;
    }
  }

  async getPurchaseByCategory(startDate?: string, endDate?: string): Promise<PurchaseByCategory[]> {
    try {
      let dateFilter = '';
      const params: any[] = [];

      if (startDate && endDate) {
        dateFilter = 'AND po.order_date >= ? AND po.order_date <= ?';
        params.push(startDate, endDate);
      } else if (startDate) {
        dateFilter = 'AND po.order_date >= ?';
        params.push(startDate);
      } else if (endDate) {
        dateFilter = 'AND po.order_date <= ?';
        params.push(endDate);
      }

      const rows = this.db
        .prepare(`
          SELECT
            s.category,
            COUNT(DISTINCT po.id) as orders,
            COALESCE(SUM(poi.total_amount), 0) as amount
          FROM suppliers s
          JOIN purchase_orders po ON s.id = po.supplier_id
          JOIN purchase_order_items poi ON po.id = poi.order_id
          WHERE po.status != 'CANCELLED' ${dateFilter}
          GROUP BY s.category
          ORDER BY amount DESC
        `)
        .all(...params) as any[];

      return rows.map(row => ({
        category: row.category,
        orders: row.orders,
        amount: row.amount,
      }));
    } catch (error) {
      logger.error('Error getting purchase by category', error);
      throw error;
    }
  }

  async getTopPurchasedProducts(limit: number = 10, startDate?: string, endDate?: string): Promise<any[]> {
    try {
      let dateFilter = '';
      const params: any[] = [];

      if (startDate && endDate) {
        dateFilter = 'AND po.order_date >= ? AND po.order_date <= ?';
        params.push(startDate, endDate);
      } else if (startDate) {
        dateFilter = 'AND po.order_date >= ?';
        params.push(startDate);
      } else if (endDate) {
        dateFilter = 'AND po.order_date <= ?';
        params.push(endDate);
      }

      params.push(limit);

      const rows = this.db
        .prepare(`
          SELECT
            p.id as product_id,
            p.code as product_code,
            p.name as product_name,
            p.category,
            COALESCE(SUM(poi.quantity), 0) as total_quantity,
            COUNT(DISTINCT poi.order_id) as order_count,
            COALESCE(SUM(poi.total_amount), 0) as total_amount
          FROM products p
          JOIN purchase_order_items poi ON p.id = poi.product_id
          JOIN purchase_orders po ON poi.order_id = po.id
          WHERE po.status != 'CANCELLED' ${dateFilter}
          GROUP BY p.id, p.code, p.name, p.category
          HAVING total_quantity > 0
          ORDER BY total_amount DESC
          LIMIT ?
        `)
        .all(...params) as any[];

      return rows.map(row => ({
        product_id: row.product_id,
        product_code: row.product_code,
        product_name: row.product_name,
        category: row.category,
        total_quantity: row.total_quantity,
        order_count: row.order_count,
        total_amount: row.total_amount,
        average_cost: row.total_quantity > 0 ? row.total_amount / row.total_quantity : 0,
      }));
    } catch (error) {
      logger.error('Error getting top purchased products', error);
      throw error;
    }
  }

  async getOutstandingPayments(): Promise<any[]> {
    try {
      const rows = this.db
        .prepare(`
          SELECT
            s.id as supplier_id,
            s.name as supplier_name,
            s.code as supplier_code,
            COUNT(ap.id) as invoice_count,
            SUM(ap.balance) as total_outstanding
          FROM suppliers s
          JOIN accounts_payable ap ON s.id = ap.supplier_id
          WHERE ap.status = 'OPEN'
          GROUP BY s.id, s.name, s.code
          HAVING total_outstanding > 0
          ORDER BY total_outstanding DESC
        `)
        .all() as any[];

      return rows.map(row => ({
        supplier_id: row.supplier_id,
        supplier_name: row.supplier_name,
        supplier_code: row.supplier_code,
        invoice_count: row.invoice_count,
        total_outstanding: row.total_outstanding,
      }));
    } catch (error) {
      logger.error('Error getting outstanding payments', error);
      throw error;
    }
  }

  async getOrderStatusSummary(): Promise<any[]> {
    try {
      const rows = this.db
        .prepare(`
          SELECT
            status,
            COUNT(*) as count,
            COALESCE(SUM(total_amount), 0) as total_amount
          FROM purchase_orders
          GROUP BY status
          ORDER BY count DESC
        `)
        .all() as any[];

      return rows.map(row => ({
        status: row.status,
        count: row.count,
        total_amount: row.total_amount,
      }));
    } catch (error) {
      logger.error('Error getting order status summary', error);
      throw error;
    }
  }

  async getMonthlyPurchases(year?: number): Promise<any[]> {
    try {
      let yearFilter = '';
      const params: any[] = [];

      if (year) {
        yearFilter = 'AND strftime("%Y", order_date) = ?';
        params.push(String(year));
      }

      const rows = this.db
        .prepare(`
          SELECT
            CAST(strftime("%Y", order_date) AS INTEGER) as year,
            CAST(strftime("%m", order_date) AS INTEGER) as month,
            COUNT(*) as orders,
            COALESCE(SUM(total_amount), 0) as amount,
            COALESCE(SUM((SELECT SUM(quantity) FROM purchase_order_items WHERE order_id = purchase_orders.id)), 0) as items
          FROM purchase_orders
          WHERE status != 'CANCELLED' ${yearFilter}
          GROUP BY strftime("%Y", order_date), strftime("%m", order_date)
          ORDER BY year DESC, month DESC
        `)
        .all(...params) as any[];

      return rows.map(row => ({
        year: row.year,
        month: row.month,
        orders: row.orders,
        amount: row.amount,
        items: row.items,
      }));
    } catch (error) {
      logger.error('Error getting monthly purchases', error);
      throw error;
    }
  }

  async getSupplierPerformance(): Promise<any[]> {
    try {
      const rows = this.db
        .prepare(`
          SELECT
            s.id as supplier_id,
            s.name as supplier_name,
            s.category,
            COUNT(po.id) as total_orders,
            COUNT(CASE WHEN po.status = 'RECEIVED' THEN 1 END) as received_orders,
            COALESCE(AVG(
              CASE
                WHEN po.status = 'RECEIVED' THEN
                  JULIANDAY(MIN((SELECT receiving_date FROM receiving WHERE order_id = po.id))) -
                  JULIANDAY(po.order_date)
                ELSE NULL
              END
            ), 0) as avg_lead_time_days
          FROM suppliers s
          LEFT JOIN purchase_orders po ON s.id = po.supplier_id
          GROUP BY s.id, s.name, s.category
          HAVING total_orders > 0
          ORDER BY total_orders DESC
        `)
        .all() as any[];

      return rows.map(row => ({
        supplier_id: row.supplier_id,
        supplier_name: row.supplier_name,
        category: row.category,
        total_orders: row.total_orders,
        received_orders: row.received_orders,
        fulfillment_rate: row.total_orders > 0 ? Math.round((row.received_orders / row.total_orders) * 10000) / 100 : 0,
        avg_lead_time_days: Math.round(row.avg_lead_time_days * 100) / 100,
      }));
    } catch (error) {
      logger.error('Error getting supplier performance', error);
      throw error;
    }
  }

  async getPendingDelivery(): Promise<any[]> {
    try {
      const rows = this.db
        .prepare(`
          SELECT
            po.id,
            po.order_no,
            po.supplier_id,
            s.name as supplier_name,
            po.order_date,
            po.expected_date,
            po.total_amount,
            (SELECT COUNT(*) FROM receiving WHERE order_id = po.id) as receiving_count
          FROM purchase_orders po
          JOIN suppliers s ON po.supplier_id = s.id
          WHERE po.status IN ('PENDING', 'CONFIRMED')
          ORDER BY po.expected_date ASC
        `)
        .all() as any[];

      return rows.map(row => ({
        order_id: row.id,
        order_no: row.order_no,
        supplier_id: row.supplier_id,
        supplier_name: row.supplier_name,
        order_date: row.order_date,
        expected_date: row.expected_date,
        total_amount: row.total_amount,
        receiving_count: row.receiving_count,
        is_overdue: row.expected_date && new Date(row.expected_date) < new Date(),
      }));
    } catch (error) {
      logger.error('Error getting pending delivery', error);
      throw error;
    }
  }
}

export default PurchasingReportsService;
