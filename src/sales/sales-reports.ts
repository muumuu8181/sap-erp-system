import Database from 'better-sqlite3';
import { Logger } from '../utils/logger';

const logger = new Logger('SalesReportsService');

export interface SalesSummary {
  total_orders: number;
  total_revenue: number;
  average_order_value: number;
  total_items_sold: number;
  total_customers: number;
}

export interface DailySales {
  date: string;
  orders: number;
  revenue: number;
  items: number;
}

export interface CustomerSalesRanking {
  customer_id: string;
  customer_name: string;
  total_orders: number;
  total_revenue: number;
}

export interface ProductSalesRanking {
  product_id: string;
  product_name: string;
  total_quantity: number;
  total_revenue: number;
}

export interface MonthlySalesReport {
  year: number;
  month: number;
  orders: number;
  revenue: number;
  items: number;
}

export class SalesReportsService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  async getSalesSummary(startDate?: string, endDate?: string): Promise<SalesSummary> {
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
            COALESCE(SUM(total_amount), 0) as total_revenue,
            COALESCE(AVG(total_amount), 0) as average_order_value
          FROM sales_orders
          ${dateFilter}
          AND status != 'CANCELLED'
        `)
        .get(...params) as any;

      const itemsRow = this.db
        .prepare(`
          SELECT COALESCE(SUM(soi.quantity), 0) as total_items
          FROM sales_order_items soi
          JOIN sales_orders so ON soi.order_id = so.id
          ${dateFilter}
          AND so.status != 'CANCELLED'
        `)
        .get(...params) as any;

      const customersRow = this.db
        .prepare(`
          SELECT COUNT(DISTINCT customer_id) as total_customers
          FROM sales_orders
          ${dateFilter}
          AND status != 'CANCELLED'
        `)
        .get(...params) as any;

      return {
        total_orders: row.total_orders,
        total_revenue: row.total_revenue,
        average_order_value: row.average_order_value,
        total_items_sold: itemsRow.total_items,
        total_customers: customersRow.total_customers,
      };
    } catch (error) {
      logger.error('Error getting sales summary', error);
      throw error;
    }
  }

  async getDailySales(startDate: string, endDate: string): Promise<DailySales[]> {
    try {
      const rows = this.db
        .prepare(`
          SELECT
            DATE(order_date) as date,
            COUNT(*) as orders,
            COALESCE(SUM(total_amount), 0) as revenue,
            COALESCE((SELECT SUM(quantity) FROM sales_order_items WHERE order_id IN (SELECT id FROM sales_orders WHERE DATE(order_date) = DATE(s.order_date))), 0) as items
          FROM sales_orders s
          WHERE order_date >= ? AND order_date <= ?
            AND status != 'CANCELLED'
          GROUP BY DATE(order_date)
          ORDER BY date
        `)
        .all(startDate, endDate) as any[];

      return rows.map(row => ({
        date: row.date,
        orders: row.orders,
        revenue: row.revenue,
        items: row.items,
      }));
    } catch (error) {
      logger.error('Error getting daily sales', error);
      throw error;
    }
  }

  async getCustomerSalesRanking(limit: number = 10, startDate?: string, endDate?: string): Promise<CustomerSalesRanking[]> {
    try {
      let dateFilter = '';
      const params: any[] = [];

      if (startDate && endDate) {
        dateFilter = 'AND so.order_date >= ? AND so.order_date <= ?';
        params.push(startDate, endDate);
      } else if (startDate) {
        dateFilter = 'AND so.order_date >= ?';
        params.push(startDate);
      } else if (endDate) {
        dateFilter = 'AND so.order_date <= ?';
        params.push(endDate);
      }

      params.push(limit);

      const rows = this.db
        .prepare(`
          SELECT
            c.id as customer_id,
            c.name as customer_name,
            COUNT(so.id) as total_orders,
            COALESCE(SUM(so.total_amount), 0) as total_revenue
          FROM customers c
          LEFT JOIN sales_orders so ON c.id = so.customer_id AND so.status != 'CANCELLED' ${dateFilter}
          GROUP BY c.id, c.name
          HAVING total_orders > 0
          ORDER BY total_revenue DESC
          LIMIT ?
        `)
        .all(...params) as any[];

      return rows.map(row => ({
        customer_id: row.customer_id,
        customer_name: row.customer_name,
        total_orders: row.total_orders,
        total_revenue: row.total_revenue,
      }));
    } catch (error) {
      logger.error('Error getting customer sales ranking', error);
      throw error;
    }
  }

  async getProductSalesRanking(limit: number = 10, startDate?: string, endDate?: string): Promise<ProductSalesRanking[]> {
    try {
      let dateFilter = '';
      const params: any[] = [];

      if (startDate && endDate) {
        dateFilter = 'AND so.order_date >= ? AND so.order_date <= ?';
        params.push(startDate, endDate);
      } else if (startDate) {
        dateFilter = 'AND so.order_date >= ?';
        params.push(startDate);
      } else if (endDate) {
        dateFilter = 'AND so.order_date <= ?';
        params.push(endDate);
      }

      params.push(limit);

      const rows = this.db
        .prepare(`
          SELECT
            p.id as product_id,
            p.name as product_name,
            COALESCE(SUM(soi.quantity), 0) as total_quantity,
            COALESCE(SUM(soi.total_amount), 0) as total_revenue
          FROM products p
          LEFT JOIN sales_order_items soi ON p.id = soi.product_id
          LEFT JOIN sales_orders so ON soi.order_id = so.id AND so.status != 'CANCELLED' ${dateFilter}
          GROUP BY p.id, p.name
          HAVING total_quantity > 0
          ORDER BY total_revenue DESC
          LIMIT ?
        `)
        .all(...params) as any[];

      return rows.map(row => ({
        product_id: row.product_id,
        product_name: row.product_name,
        total_quantity: row.total_quantity,
        total_revenue: row.total_revenue,
      }));
    } catch (error) {
      logger.error('Error getting product sales ranking', error);
      throw error;
    }
  }

  async getMonthlySales(year?: number): Promise<MonthlySalesReport[]> {
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
            COALESCE(SUM(total_amount), 0) as revenue,
            COALESCE(SUM((SELECT SUM(quantity) FROM sales_order_items WHERE order_id = sales_orders.id)), 0) as items
          FROM sales_orders
          WHERE status != 'CANCELLED' ${yearFilter}
          GROUP BY strftime("%Y", order_date), strftime("%m", order_date)
          ORDER BY year DESC, month DESC
        `)
        .all(...params) as any[];

      return rows.map(row => ({
        year: row.year,
        month: row.month,
        orders: row.orders,
        revenue: row.revenue,
        items: row.items,
      }));
    } catch (error) {
      logger.error('Error getting monthly sales', error);
      throw error;
    }
  }

  async getOutstandingInvoicesByCustomer(): Promise<any[]> {
    try {
      const rows = this.db
        .prepare(`
          SELECT
            c.id as customer_id,
            c.name as customer_name,
            c.code as customer_code,
            COUNT(ar.id) as invoice_count,
            SUM(ar.balance) as total_outstanding
          FROM customers c
          JOIN accounts_receivable ar ON c.id = ar.customer_id
          WHERE ar.status = 'OPEN'
          GROUP BY c.id, c.name, c.code
          HAVING total_outstanding > 0
          ORDER BY total_outstanding DESC
        `)
        .all() as any[];

      return rows.map(row => ({
        customer_id: row.customer_id,
        customer_name: row.customer_name,
        customer_code: row.customer_code,
        invoice_count: row.invoice_count,
        total_outstanding: row.total_outstanding,
      }));
    } catch (error) {
      logger.error('Error getting outstanding invoices by customer', error);
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
          FROM sales_orders
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

  async getSalesByCategory(startDate?: string, endDate?: string): Promise<any[]> {
    try {
      let dateFilter = '';
      const params: any[] = [];

      if (startDate && endDate) {
        dateFilter = 'AND so.order_date >= ? AND so.order_date <= ?';
        params.push(startDate, endDate);
      } else if (startDate) {
        dateFilter = 'AND so.order_date >= ?';
        params.push(startDate);
      } else if (endDate) {
        dateFilter = 'AND so.order_date <= ?';
        params.push(endDate);
      }

      const rows = this.db
        .prepare(`
          SELECT
            c.category,
            COUNT(DISTINCT so.id) as orders,
            COALESCE(SUM(soi.total_amount), 0) as revenue
          FROM customers c
          JOIN sales_orders so ON c.id = so.customer_id
          JOIN sales_order_items soi ON so.id = soi.order_id
          WHERE so.status != 'CANCELLED' ${dateFilter}
          GROUP BY c.category
          ORDER BY revenue DESC
        `)
        .all(...params) as any[];

      return rows.map(row => ({
        category: row.category,
        orders: row.orders,
        revenue: row.revenue,
      }));
    } catch (error) {
      logger.error('Error getting sales by category', error);
      throw error;
    }
  }

  async getTopProductsByQuantity(limit: number = 10, startDate?: string, endDate?: string): Promise<any[]> {
    try {
      let dateFilter = '';
      const params: any[] = [];

      if (startDate && endDate) {
        dateFilter = 'AND so.order_date >= ? AND so.order_date <= ?';
        params.push(startDate, endDate);
      } else if (startDate) {
        dateFilter = 'AND so.order_date >= ?';
        params.push(startDate);
      } else if (endDate) {
        dateFilter = 'AND so.order_date <= ?';
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
            COALESCE(SUM(soi.quantity), 0) as total_quantity,
            COUNT(DISTINCT soi.order_id) as order_count
          FROM products p
          JOIN sales_order_items soi ON p.id = soi.product_id
          JOIN sales_orders so ON soi.order_id = so.id
          WHERE so.status != 'CANCELLED' ${dateFilter}
          GROUP BY p.id, p.code, p.name, p.category
          ORDER BY total_quantity DESC
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
      }));
    } catch (error) {
      logger.error('Error getting top products by quantity', error);
      throw error;
    }
  }

  async getRevenueByPaymentTerm(): Promise<any[]> {
    try {
      const rows = this.db
        .prepare(`
          SELECT
            c.payment_term,
            COUNT(DISTINCT so.id) as orders,
            COALESCE(SUM(so.total_amount), 0) as revenue
          FROM customers c
          JOIN sales_orders so ON c.id = so.customer_id
          WHERE so.status != 'CANCELLED'
          GROUP BY c.payment_term
          ORDER BY payment_term
        `)
        .all() as any[];

      return rows.map(row => ({
        payment_term: row.payment_term,
        orders: row.orders,
        revenue: row.revenue,
      }));
    } catch (error) {
      logger.error('Error getting revenue by payment term', error);
      throw error;
    }
  }
}

export default SalesReportsService;
