import { DatabaseConnection } from '../../src/db/connection';
import { promises as fs } from 'fs';
import path from 'path';

describe('Database Connection', () => {
  const TEST_DB_PATH = path.join(process.cwd(), 'test_database.db');

  beforeAll(async () => {
    // Set test database path
    process.env.DATABASE_PATH = TEST_DB_PATH;
  });

  afterAll(async () => {
    // Close connection and clean up test database
    DatabaseConnection.close();

    try {
      await fs.unlink(TEST_DB_PATH);
    } catch (error) {
      // File might not exist
    }
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = DatabaseConnection.getInstance();
      const instance2 = DatabaseConnection.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('Initialization', () => {
    it('should initialize database connection', async () => {
      await DatabaseConnection.initialize();
      const db = DatabaseConnection.getInstance();

      expect(db).toBeDefined();
      expect(db.constructor.name).toBe('Database');
    });

    it('should create tables on initialization', async () => {
      await DatabaseConnection.initialize();
      const db = DatabaseConnection.getInstance();

      // Check if some key tables exist
      const tables = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='table'
        ORDER BY name
      `).all();

      const tableNames = tables.map((t: any) => t.name);

      // Verify some core tables exist
      expect(tableNames).toContain('customers');
      expect(tableNames).toContain('products');
      expect(tableNames).toContain('suppliers');
      expect(tableNames).toContain('employees');
      expect(tableNames).toContain('sales_orders');
      expect(tableNames).toContain('invoices');
      expect(tableNames).toContain('purchase_orders');
      expect(tableNames).toContain('inventory_stock');
      expect(tableNames).toContain('accounts_receivable');
      expect(tableNames).toContain('accounts_payable');
      expect(tableNames).toContain('journal_entries');
      expect(tableNames).toContain('payroll');
      expect(tableNames).toContain('attendance');
    });

    it('should handle re-initialization gracefully', async () => {
      await DatabaseConnection.initialize();
      await DatabaseConnection.initialize(); // Should not throw

      const db = DatabaseConnection.getInstance();
      expect(db).toBeDefined();
    });
  });

  describe('Connection Management', () => {
    beforeEach(async () => {
      await DatabaseConnection.initialize();
    });

    it('should close database connection', async () => {
      const db = DatabaseConnection.getInstance();

      DatabaseConnection.close();

      // Re-initialize for other tests
      await DatabaseConnection.initialize();
    });

    it('should allow operations after close and re-initialize', async () => {
      const db = DatabaseConnection.getInstance();

      // Perform a simple query
      const result = db.prepare('SELECT 1 as test').get();
      expect(result).toBeDefined();

      DatabaseConnection.close();

      // Re-initialize
      await DatabaseConnection.initialize();
      const db2 = DatabaseConnection.getInstance();

      const result2 = db2.prepare('SELECT 2 as test').get();
      expect(result2).toBeDefined();
    });
  });

  describe('Database Operations', () => {
    beforeEach(async () => {
      await DatabaseConnection.initialize();
      const db = DatabaseConnection.getInstance();

      // Clean up test data
      db.prepare('DELETE FROM customers').run();
      db.prepare('DELETE FROM products').run();
    });

    afterEach(() => {
      // Don't close here, let afterAll handle cleanup
    });

    it('should support basic CRUD operations', async () => {
      const db = DatabaseConnection.getInstance();

      // Create
      const stmt = db.prepare(`
        INSERT INTO customers (id, code, name, category, payment_term, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const customerId = 'cust-test-001';
      const now = new Date().toISOString();

      stmt.run(
        customerId,
        'CUST001',
        'Test Customer',
        'RETAIL',
        30,
        now,
        now
      );

      // Read
      const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId) as any;
      expect(customer).toBeDefined();
      expect(customer?.name).toBe('Test Customer');

      // Update
      db.prepare('UPDATE customers SET name = ? WHERE id = ?').run('Updated Customer', customerId);
      const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId) as any;
      expect(updated?.name).toBe('Updated Customer');

      // Delete
      db.prepare('DELETE FROM customers WHERE id = ?').run(customerId);
      const deleted = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
      expect(deleted).toBeUndefined();
    });

    it('should support transactions', async () => {
      const db = DatabaseConnection.getInstance();

      const transaction = db.transaction(() => {
        db.prepare(`
          INSERT INTO customers (id, code, name, category, payment_term, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run('cust-tx-001', 'CUSTTX001', 'Customer 1', 'RETAIL', 30, new Date().toISOString(), new Date().toISOString());

        db.prepare(`
          INSERT INTO customers (id, code, name, category, payment_term, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run('cust-tx-002', 'CUSTTX002', 'Customer 2', 'RETAIL', 30, new Date().toISOString(), new Date().toISOString());
      });

      transaction();

      const count = db.prepare(`SELECT COUNT(*) as count FROM customers WHERE code LIKE 'CUSTTX%'`).get() as { count: number };
      expect(count.count).toBe(2);

      // Cleanup
      db.prepare(`DELETE FROM customers WHERE code LIKE 'CUSTTX%'`).run();
    });

    it('should rollback on transaction failure', async () => {
      const db = DatabaseConnection.getInstance();

      const failingTransaction = db.transaction(() => {
        db.prepare(`
          INSERT INTO customers (id, code, name, category, payment_term, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run('cust-fail-001', 'CUSTFAIL001', 'Customer 1', 'RETAIL', 30, new Date().toISOString(), new Date().toISOString());

        // This will cause a unique constraint violation
        db.prepare(`
          INSERT INTO customers (id, code, name, category, payment_term, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run('cust-fail-001', 'CUSTFAIL001', 'Customer 2', 'RETAIL', 30, new Date().toISOString(), new Date().toISOString());
      });

      expect(() => failingTransaction()).toThrow();

      const count = db.prepare(`SELECT COUNT(*) as count FROM customers WHERE code LIKE 'CUSTFAIL%'`).get() as { count: number };
      expect(count.count).toBe(0);
    });

    it('should support prepared statements', async () => {
      const db = DatabaseConnection.getInstance();

      const insertStmt = db.prepare(`
        INSERT INTO products (id, code, name, category, unit, cost_price, selling_price, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const products = [
        { id: 'prod-001', code: 'PRD001', name: 'Product 1' },
        { id: 'prod-002', code: 'PRD002', name: 'Product 2' },
        { id: 'prod-003', code: 'PRD003', name: 'Product 3' },
      ];

      const now = new Date().toISOString();
      const insertMany = db.transaction((prods: any[]) => {
        for (const prod of prods) {
          insertStmt.run(
            prod.id,
            prod.code,
            prod.name,
            'ELECTRONICS',
            'EA',
            1000,
            1500,
            now,
            now
          );
        }
      });

      insertMany(products);

      const count = db.prepare(`SELECT COUNT(*) as count FROM products WHERE code LIKE 'PRD0%'`).get() as { count: number };
      expect(count.count).toBe(3);

      // Cleanup
      db.prepare(`DELETE FROM products WHERE code LIKE 'PRD0%'`).run();
    });

    it('should handle parameterized queries safely', async () => {
      const db = DatabaseConnection.getInstance();

      // This should be safe from SQL injection
      const maliciousInput = "'; DROP TABLE customers; --";

      const result = db.prepare('SELECT * FROM customers WHERE code = ?').get(maliciousInput);
      expect(result).toBeUndefined();

      // Verify table still exists
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='customers'").get();
      expect(tables).toBeDefined();
    });
  });

  describe('Database Schema', () => {
    it('should have foreign key constraints enabled', async () => {
      await DatabaseConnection.initialize();
      const db = DatabaseConnection.getInstance();

      const result = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
      expect(result.foreign_keys).toBe(1);
    });

    it('should enforce foreign key constraints', async () => {
      await DatabaseConnection.initialize();
      const db = DatabaseConnection.getInstance();

      // Try to insert order with non-existent customer
      expect(() => {
        db.prepare(`
          INSERT INTO sales_orders (id, order_no, customer_id, order_date, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          'order-fk-test',
          'SO000001',
          'non-existent-customer',
          new Date().toISOString(),
          'PENDING',
          new Date().toISOString(),
          new Date().toISOString()
        );
      }).toThrow();
    });

    it('should have indexes on common query fields', async () => {
      await DatabaseConnection.initialize();
      const db = DatabaseConnection.getInstance();

      // Check for indexes
      const indexes = db.prepare(`
        SELECT name FROM sqlite_master
        WHERE type='index'
        AND tbl_name='customers'
      `).all();

      const indexNames = indexes.map((i: any) => i.name);
      expect(indexNames.length).toBeGreaterThan(0);
    });
  });

  describe('Database Performance', () => {
    beforeEach(async () => {
      await DatabaseConnection.initialize();
    });

    it('should handle bulk inserts efficiently', async () => {
      const db = DatabaseConnection.getInstance();

      const insertStmt = db.prepare(`
        INSERT INTO products (id, code, name, category, unit, cost_price, selling_price, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const now = new Date().toISOString();
      const count = 100;

      const startTime = Date.now();

      const insertMany = db.transaction((n: number) => {
        for (let i = 0; i < n; i++) {
          insertStmt.run(
            `prod-bulk-${i}`,
            `PRDBULK${i.toString().padStart(6, '0')}`,
            `Bulk Product ${i}`,
            'ELECTRONICS',
            'EA',
            1000,
            1500,
            now,
            now
          );
        }
      });

      insertMany(count);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete in reasonable time (< 1 second for 100 records)
      expect(duration).toBeLessThan(1000);

      // Verify records
      const result = db.prepare(`SELECT COUNT(*) as count FROM products WHERE code LIKE 'PRDBULK%'`).get() as { count: number };
      expect(result.count).toBe(count);

      // Cleanup
      db.prepare(`DELETE FROM products WHERE code LIKE 'PRDBULK%'`).run();
    });

    it('should handle concurrent read operations', async () => {
      const db = DatabaseConnection.getInstance();

      // First, insert some test data
      const now = new Date().toISOString();
      for (let i = 0; i < 10; i++) {
        db.prepare(`
          INSERT INTO customers (id, code, name, category, payment_term, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(`cust-conc-${i}`, `CUSTCONC${i}`, `Customer ${i}`, 'RETAIL', 30, now, now);
      }

      // Perform multiple concurrent reads
      const promises = Array.from({ length: 10 }, () =>
        Promise.resolve(
          db.prepare(`SELECT * FROM customers WHERE code LIKE 'CUSTCONC%'`).all()
        )
      );

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.length).toBe(10);
      });

      // Cleanup
      db.prepare(`DELETE FROM customers WHERE code LIKE 'CUSTCONC%'`).run();
    });
  });
});
