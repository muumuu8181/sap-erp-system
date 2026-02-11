import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

export class DatabaseConnection {
  private static instance: Database.Database;
  private static initialized = false;

  private constructor() {}

  public static getInstance(): Database.Database {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new Database(':memory:');
      DatabaseConnection.instance.pragma('journal_mode = WAL');
      DatabaseConnection.instance.pragma('foreign_keys = ON');
    }
    return DatabaseConnection.instance;
  }

  public static async initialize(): Promise<void> {
    if (DatabaseConnection.initialized) {
      return;
    }

    const db = DatabaseConnection.getInstance();
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    db.exec(schema);
    DatabaseConnection.initialized = true;
  }

  public static close(): void {
    if (DatabaseConnection.instance) {
      DatabaseConnection.instance.close();
      DatabaseConnection.instance = null as any;
      DatabaseConnection.initialized = false;
    }
  }

  public static reset(): void {
    const db = DatabaseConnection.getInstance();
    db.exec('DROP TABLE IF EXISTS journal_entry_lines');
    db.exec('DROP TABLE IF EXISTS journal_entries');
    db.exec('DROP TABLE IF EXISTS accounts_payable');
    db.exec('DROP TABLE IF EXISTS accounts_receivable');
    db.exec('DROP TABLE IF EXISTS receiving_items');
    db.exec('DROP TABLE IF EXISTS receiving');
    db.exec('DROP TABLE IF EXISTS purchase_order_items');
    db.exec('DROP TABLE IF EXISTS purchase_orders');
    db.exec('DROP TABLE IF EXISTS stock_taking_items');
    db.exec('DROP TABLE IF EXISTS stock_taking');
    db.exec('DROP TABLE IF EXISTS stock_movements');
    db.exec('DROP TABLE IF EXISTS inventory_stock');
    db.exec('DROP TABLE IF EXISTS invoice_items');
    db.exec('DROP TABLE IF EXISTS invoices');
    db.exec('DROP TABLE IF EXISTS shipment_items');
    db.exec('DROP TABLE IF EXISTS shipments');
    db.exec('DROP TABLE IF EXISTS sales_order_items');
    db.exec('DROP TABLE IF EXISTS sales_orders');
    db.exec('DROP TABLE IF EXISTS employees');
    db.exec('DROP TABLE IF EXISTS suppliers');
    db.exec('DROP TABLE IF EXISTS products');
    db.exec('DROP TABLE IF EXISTS customers');
    db.exec('DROP TABLE IF EXISTS attendance');
    db.exec('DROP TABLE IF EXISTS payroll');

    DatabaseConnection.initialized = false;
    DatabaseConnection.initialize();
  }
}

export default DatabaseConnection;
