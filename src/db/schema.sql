-- SAP ERP Database Schema
-- Team 004

-- Customers Table
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  payment_term INTEGER NOT NULL,
  credit_limit REAL DEFAULT 0,
  tax_id TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'JP',
  is_active BOOLEAN DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Products Table
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit TEXT NOT NULL,
  cost_price REAL NOT NULL,
  selling_price REAL DEFAULT 0,
  is_sellable BOOLEAN DEFAULT 1,
  tax_rate REAL DEFAULT 0.10,
  weight REAL,
  dimensions TEXT,
  is_active BOOLEAN DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Suppliers Table
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  payment_term INTEGER NOT NULL,
  tax_id TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'JP',
  is_active BOOLEAN DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Employees Table
CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  department TEXT NOT NULL,
  position TEXT NOT NULL,
  hire_date TEXT NOT NULL,
  birth_date TEXT,
  gender TEXT,
  address TEXT,
  bank_name TEXT,
  bank_account TEXT,
  is_active BOOLEAN DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Sales Orders Table
CREATE TABLE IF NOT EXISTS sales_orders (
  id TEXT PRIMARY KEY,
  order_no TEXT UNIQUE NOT NULL,
  customer_id TEXT NOT NULL,
  order_date TEXT NOT NULL,
  delivery_date TEXT,
  status TEXT DEFAULT 'PENDING',
  subtotal REAL NOT NULL,
  tax_amount REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  total_amount REAL NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- Sales Order Items Table
CREATE TABLE IF NOT EXISTS sales_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  tax_rate REAL DEFAULT 0.10,
  discount_rate REAL DEFAULT 0,
  subtotal REAL NOT NULL,
  tax_amount REAL DEFAULT 0,
  total_amount REAL NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES sales_orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Shipments Table
CREATE TABLE IF NOT EXISTS shipments (
  id TEXT PRIMARY KEY,
  shipment_no TEXT UNIQUE NOT NULL,
  order_id TEXT NOT NULL,
  shipment_date TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING',
  tracking_number TEXT,
  carrier TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES sales_orders(id)
);

-- Shipment Items Table
CREATE TABLE IF NOT EXISTS shipment_items (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity REAL NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (shipment_id) REFERENCES shipments(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Invoices Table
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  invoice_no TEXT UNIQUE NOT NULL,
  customer_id TEXT NOT NULL,
  order_id TEXT,
  invoice_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING',
  subtotal REAL NOT NULL,
  tax_amount REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  total_amount REAL NOT NULL,
  paid_amount REAL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (order_id) REFERENCES sales_orders(id)
);

-- Invoice Items Table
CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  product_id TEXT,
  description TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  tax_rate REAL DEFAULT 0.10,
  discount_rate REAL DEFAULT 0,
  subtotal REAL NOT NULL,
  tax_amount REAL DEFAULT 0,
  total_amount REAL NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Inventory Stock Table
CREATE TABLE IF NOT EXISTS inventory_stock (
  id TEXT PRIMARY KEY,
  product_id TEXT UNIQUE NOT NULL,
  warehouse_location TEXT DEFAULT 'MAIN',
  quantity_on_hand REAL DEFAULT 0,
  quantity_allocated REAL DEFAULT 0,
  quantity_available REAL DEFAULT 0,
  reorder_level REAL DEFAULT 0,
  last_count_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Stock Movements Table
CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  movement_type TEXT NOT NULL,
  quantity REAL NOT NULL,
  reference_id TEXT,
  reference_type TEXT,
  movement_date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Stock Taking Table
CREATE TABLE IF NOT EXISTS stock_taking (
  id TEXT PRIMARY KEY,
  taking_no TEXT UNIQUE NOT NULL,
  taking_date TEXT NOT NULL,
  status TEXT DEFAULT 'DRAFT',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Stock Taking Items Table
CREATE TABLE IF NOT EXISTS stock_taking_items (
  id TEXT PRIMARY KEY,
  taking_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  expected_quantity REAL NOT NULL,
  actual_quantity REAL NOT NULL,
  difference REAL NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (taking_id) REFERENCES stock_taking(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Purchase Orders Table
CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  order_no TEXT UNIQUE NOT NULL,
  supplier_id TEXT NOT NULL,
  order_date TEXT NOT NULL,
  expected_date TEXT,
  status TEXT DEFAULT 'PENDING',
  subtotal REAL NOT NULL,
  tax_amount REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  total_amount REAL NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

-- Purchase Order Items Table
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  tax_rate REAL DEFAULT 0.10,
  discount_rate REAL DEFAULT 0,
  subtotal REAL NOT NULL,
  tax_amount REAL DEFAULT 0,
  total_amount REAL NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES purchase_orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Receiving Table
CREATE TABLE IF NOT EXISTS receiving (
  id TEXT PRIMARY KEY,
  receiving_no TEXT UNIQUE NOT NULL,
  order_id TEXT NOT NULL,
  receiving_date TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES purchase_orders(id)
);

-- Receiving Items Table
CREATE TABLE IF NOT EXISTS receiving_items (
  id TEXT PRIMARY KEY,
  receiving_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  ordered_quantity REAL NOT NULL,
  received_quantity REAL NOT NULL,
  damaged_quantity REAL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (receiving_id) REFERENCES receiving(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Journal Entries Table
CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,
  entry_no TEXT UNIQUE NOT NULL,
  entry_date TEXT NOT NULL,
  status TEXT DEFAULT 'DRAFT',
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Journal Entry Lines Table
CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  debit_amount REAL DEFAULT 0,
  credit_amount REAL DEFAULT 0,
  description TEXT,
  line_no INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (entry_id) REFERENCES journal_entries(id)
);

-- Accounts Receivable Table
CREATE TABLE IF NOT EXISTS accounts_receivable (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  transaction_date TEXT NOT NULL,
  debit_amount REAL DEFAULT 0,
  credit_amount REAL DEFAULT 0,
  balance REAL NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT DEFAULT 'OPEN',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id)
);

-- Accounts Payable Table
CREATE TABLE IF NOT EXISTS accounts_payable (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  transaction_date TEXT NOT NULL,
  debit_amount REAL DEFAULT 0,
  credit_amount REAL DEFAULT 0,
  balance REAL NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT DEFAULT 'OPEN',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

-- Payroll Table
CREATE TABLE IF NOT EXISTS payroll (
  id TEXT PRIMARY KEY,
  payroll_no TEXT UNIQUE NOT NULL,
  employee_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  pay_date TEXT NOT NULL,
  status TEXT DEFAULT 'DRAFT',
  basic_salary REAL NOT NULL,
  overtime_pay REAL DEFAULT 0,
  bonus REAL DEFAULT 0,
  allowances REAL DEFAULT 0,
  deductions REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  insurance_amount REAL DEFAULT 0,
  net_pay REAL NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id)
);

-- Attendance Table
CREATE TABLE IF NOT EXISTS attendance (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  attendance_date TEXT NOT NULL,
  check_in TEXT,
  check_out TEXT,
  work_hours REAL DEFAULT 0,
  overtime_hours REAL DEFAULT 0,
  status TEXT DEFAULT 'PRESENT',
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id),
  UNIQUE(employee_id, attendance_date)
);

-- Create Indexes
CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(code);
CREATE INDEX IF NOT EXISTS idx_customers_category ON customers(category);
CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_suppliers_code ON suppliers(code);
CREATE INDEX IF NOT EXISTS idx_employees_code ON employees(code);
CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email);
CREATE INDEX IF NOT EXISTS idx_sales_orders_customer ON sales_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_date ON sales_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_sales_orders_status ON sales_orders(status);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_inventory_stock_product ON inventory_stock(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements(movement_date);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_date ON purchase_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON journal_entries(status);
CREATE INDEX IF NOT EXISTS idx_accounts_receivable_customer ON accounts_receivable(customer_id);
CREATE INDEX IF NOT EXISTS idx_accounts_receivable_status ON accounts_receivable(status);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_supplier ON accounts_payable(supplier_id);
CREATE INDEX IF NOT EXISTS idx_accounts_payable_status ON accounts_payable(status);
CREATE INDEX IF NOT EXISTS idx_payroll_employee ON payroll(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_period ON payroll(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_attendance_employee ON attendance(employee_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(attendance_date);
