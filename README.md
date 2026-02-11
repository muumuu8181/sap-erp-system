# SAP ERP System - Team 004

A comprehensive ERP (Enterprise Resource Planning) system built with TypeScript, Express.js, and SQLite.

## Features

### Sales Module
- Customer management (CRUD operations)
- Sales order processing
- Shipment tracking
- Invoice generation and management
- Accounts receivable tracking
- Sales analytics and reporting

### Inventory Module
- Product management
- Stock level monitoring
- Stock movement tracking
- Stock taking and inventory counts
- Low stock alerts
- ABC analysis
- Inventory turnover reports

### Purchasing Module
- Supplier management
- Purchase order processing
- Goods receiving and inspection
- Accounts payable tracking
- Supplier performance analysis

### Accounting/Finance Module
- General ledger with journal entries
- Accounts receivable management
- Accounts payable management
- Financial statements (Income Statement, Balance Sheet, Cash Flow)
- Trial balance generation
- Financial ratios and metrics

### HR Module
- Employee management
- Payroll processing with Japanese tax calculations
- Attendance tracking
- Overtime and leave management
- HR analytics and reporting

## Technology Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: SQLite (better-sqlite3)
- **Validation**: Zod
- **Utilities**: date-fns, uuid

## Project Structure

```
team_004/
├── src/
│   ├── config/
│   │   └── database.ts          # Database configuration
│   ├── db/
│   │   ├── connection.ts        # Database connection management
│   │   └── schema.sql           # Database schema
│   ├── middleware/
│   │   ├── error.ts             # Error handling middleware
│   │   └── validation.ts        # Request validation middleware
│   ├── utils/
│   │   ├── logger.ts            # Logging utility
│   │   └── helpers.ts           # Helper functions
│   ├── sales/
│   │   ├── customers.ts         # Customer service
│   │   ├── orders.ts            # Sales order service
│   │   ├── shipments.ts         # Shipment service
│   │   ├── invoices.ts          # Invoice service
│   │   ├── sales-reports.ts     # Sales reports service
│   │   └── controllers.ts       # Sales controllers
│   ├── inventory/
│   │   ├── products.ts          # Product service
│   │   ├── stock.ts             # Stock management service
│   │   ├── stocktaking.ts       # Stock taking service
│   │   ├── inventory-reports.ts # Inventory reports service
│   │   └── controllers.ts       # Inventory controllers
│   ├── purchasing/
│   │   ├── suppliers.ts         # Supplier service
│   │   ├── purchase-orders.ts   # Purchase order service
│   │   ├── receiving.ts         # Receiving service
│   │   ├── purchasing-reports.ts # Purchasing reports service
│   │   └── controllers.ts       # Purchasing controllers
│   ├── accounting/
│   │   ├── accounts-receivable.ts  # AR service
│   │   ├── accounts-payable.ts     # AP service
│   │   ├── journal-entries.ts      # General ledger service
│   │   ├── financial-reports.ts    # Financial reports service
│   │   └── controllers.ts          # Accounting controllers
│   ├── hr/
│   │   ├── employees.ts         # Employee service
│   │   ├── payroll.ts           # Payroll service
│   │   ├── attendance.ts        # Attendance service
│   │   ├── hr-reports.ts        # HR reports service
│   │   └── controllers.ts       # HR controllers
│   └── index.ts                # Application entry point
├── tests/                       # Test files
├── docs/                        # Documentation
├── package.json
├── tsconfig.json
├── jest.config.js
└── README.md
```

## Installation

```bash
npm install
```

## Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

The server will start on port 3000 by default.

## API Endpoints

### Health Check
- `GET /health` - Check if the server is running

### Sales (`/api/sales/*`)
- `POST /customers` - Create a new customer
- `GET /customers` - List all customers
- `GET /customers/:id` - Get customer by ID
- `PUT /customers/:id` - Update customer
- `DELETE /customers/:id` - Delete customer
- `POST /orders` - Create a sales order
- `GET /orders` - List all orders
- `POST /invoices` - Create an invoice
- `GET /invoices` - List all invoices
- `GET /reports/summary` - Get sales summary
- And many more...

### Inventory (`/api/inventory/*`)
- `POST /products` - Create a new product
- `GET /products` - List all products
- `POST /stock/movements` - Create a stock movement
- `GET /stock/levels` - Get stock levels
- `POST /stock-taking` - Create a stock taking
- And many more...

### Purchasing (`/api/purchasing/*`)
- `POST /suppliers` - Create a new supplier
- `GET /suppliers` - List all suppliers
- `POST /purchase-orders` - Create a purchase order
- `POST /receiving` - Create a receiving record
- And many more...

### Accounting (`/api/accounting/*`)
- `POST /journal-entries` - Create a journal entry
- `GET /journal-entries` - List all journal entries
- `POST /receivables` - Create an accounts receivable
- `POST /receivables/payment` - Apply payment to receivable
- `GET /reports/income-statement` - Get income statement
- And many more...

### HR (`/api/hr/*`)
- `POST /employees` - Create a new employee
- `GET /employees` - List all employees
- `POST /payroll` - Create a payroll record
- `POST /attendance` - Create an attendance record
- `GET /reports/summary` - Get HR summary
- And many more...

## Database Schema

The system uses SQLite with the following main tables:
- `customers` - Customer master data
- `products` - Product master data
- `suppliers` - Supplier master data
- `employees` - Employee master data
- `sales_orders` - Sales orders
- `sales_order_items` - Sales order line items
- `shipments` - Shipment records
- `invoices` - Invoice records
- `purchase_orders` - Purchase orders
- `receiving` - Goods receiving records
- `inventory_stock` - Stock levels
- `stock_movements` - Stock movement history
- `stock_taking` - Stock taking records
- `accounts_receivable` - Accounts receivable
- `accounts_payable` - Accounts payable
- `journal_entries` - Journal entries
- `journal_entry_lines` - Journal entry line items
- `payroll` - Payroll records
- `attendance` - Attendance records

## Code Quality Features

1. **Type Safety**: Full TypeScript implementation with strict type checking
2. **Validation**: Zod-based request validation
3. **Error Handling**: Comprehensive error handling with custom error types
4. **Logging**: Structured logging throughout the application
5. **UUID-based IDs**: All entities use UUID for primary keys
6. **ISO 8601 Dates**: Standardized date/time formatting
7. **Transaction Support**: Database transactions for data integrity

## Testing

```bash
npm test
```

## License

MIT

## Team

Developed by Team 004
