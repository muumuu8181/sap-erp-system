import express, { Application } from 'express';
import { DatabaseConnection } from './db/connection';
import { Logger } from './utils/logger';
import { notFound, errorHandler } from './middleware/error';

const logger = new Logger('App');

// Import controllers
import {
  customersControllers,
  ordersControllers,
  shipmentsControllers,
  invoicesControllers,
  salesReportsControllers,
} from './sales/controllers';

import {
  productsControllers,
  stockControllers,
  stockTakingControllers,
  inventoryReportsControllers,
} from './inventory/controllers';

import {
  suppliersControllers,
  purchaseOrdersControllers,
  receivingControllers,
  purchasingReportsControllers,
} from './purchasing/controllers';

import {
  accountsReceivableControllers,
  accountsPayableControllers,
  journalEntriesControllers,
  financialReportsControllers,
} from './accounting/controllers';

import {
  employeesControllers,
  payrollControllers,
  attendanceControllers,
  hrReportsControllers,
} from './hr/controllers';

class App {
  public app: Application;
  public PORT: number = 3000;

  constructor() {
    this.app = express();
    this.initializeDatabase();
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private async initializeDatabase(): Promise<void> {
    try {
      await DatabaseConnection.initialize();
      logger.info('Database initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database', error);
      throw error;
    }
  }

  private initializeMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging middleware
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`);
      next();
    });
  }

  private initializeRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', message: 'SAP ERP System is running' });
    });

    // Sales routes
    this.app.post('/api/sales/customers', customersControllers.create);
    this.app.put('/api/sales/customers/:id', customersControllers.update);
    this.app.delete('/api/sales/customers/:id', customersControllers.delete);
    this.app.get('/api/sales/customers/:id', customersControllers.getById);
    this.app.get('/api/sales/customers/code/:code', customersControllers.getByCode);
    this.app.get('/api/sales/customers', customersControllers.getAll);
    this.app.get('/api/sales/customers/:id/stats', customersControllers.getStats);

    this.app.post('/api/sales/orders', ordersControllers.create);
    this.app.put('/api/sales/orders/:id', ordersControllers.update);
    this.app.delete('/api/sales/orders/:id', ordersControllers.delete);
    this.app.get('/api/sales/orders/:id', ordersControllers.getById);
    this.app.get('/api/sales/orders/no/:orderNo', ordersControllers.getByOrderNo);
    this.app.get('/api/sales/orders', ordersControllers.getAll);
    this.app.get('/api/sales/customers/:customerId/orders', ordersControllers.getCustomerOrders);

    this.app.post('/api/sales/shipments', shipmentsControllers.create);
    this.app.put('/api/sales/shipments/:id', shipmentsControllers.update);
    this.app.delete('/api/sales/shipments/:id', shipmentsControllers.delete);
    this.app.get('/api/sales/shipments/:id', shipmentsControllers.getById);
    this.app.get('/api/sales/shipments/no/:shipmentNo', shipmentsControllers.getByShipmentNo);
    this.app.get('/api/sales/shipments', shipmentsControllers.getAll);
    this.app.get('/api/sales/orders/:orderId/shipments', shipmentsControllers.getOrderShipments);

    this.app.post('/api/sales/invoices', invoicesControllers.create);
    this.app.put('/api/sales/invoices/:id', invoicesControllers.update);
    this.app.delete('/api/sales/invoices/:id', invoicesControllers.delete);
    this.app.get('/api/sales/invoices/:id', invoicesControllers.getById);
    this.app.get('/api/sales/invoices/no/:invoiceNo', invoicesControllers.getByInvoiceNo);
    this.app.get('/api/sales/invoices', invoicesControllers.getAll);
    this.app.get('/api/sales/customers/:customerId/invoices', invoicesControllers.getCustomerInvoices);
    this.app.get('/api/sales/invoices/overdue', invoicesControllers.getOverdueInvoices);

    this.app.get('/api/sales/reports/summary', salesReportsControllers.getSalesSummary);
    this.app.get('/api/sales/reports/daily-sales', salesReportsControllers.getDailySales);
    this.app.get('/api/sales/reports/customer-ranking', salesReportsControllers.getCustomerSalesRanking);
    this.app.get('/api/sales/reports/product-ranking', salesReportsControllers.getProductSalesRanking);
    this.app.get('/api/sales/reports/monthly-sales', salesReportsControllers.getMonthlySales);
    this.app.get('/api/sales/reports/outstanding-by-customer', salesReportsControllers.getOutstandingInvoicesByCustomer);
    this.app.get('/api/sales/reports/order-status', salesReportsControllers.getOrderStatusSummary);
    this.app.get('/api/sales/reports/by-category', salesReportsControllers.getSalesByCategory);
    this.app.get('/api/sales/reports/top-products', salesReportsControllers.getTopProductsByQuantity);
    this.app.get('/api/sales/reports/revenue-by-payment-term', salesReportsControllers.getRevenueByPaymentTerm);

    // Inventory routes
    this.app.post('/api/inventory/products', productsControllers.create);
    this.app.put('/api/inventory/products/:id', productsControllers.update);
    this.app.delete('/api/inventory/products/:id', productsControllers.delete);
    this.app.get('/api/inventory/products/:id', productsControllers.getById);
    this.app.get('/api/inventory/products/code/:code', productsControllers.getByCode);
    this.app.get('/api/inventory/products', productsControllers.getAll);
    this.app.get('/api/inventory/products/categories', productsControllers.getCategories);
    this.app.get('/api/inventory/products/:id/stats', productsControllers.getStats);

    this.app.post('/api/inventory/stock/movements', stockControllers.createMovement);
    this.app.get('/api/inventory/stock/levels', stockControllers.getStockLevels);
    this.app.get('/api/inventory/stock/low-stock', stockControllers.getLowStockProducts);
    this.app.get('/api/inventory/stock/products/:productId/movements', stockControllers.getMovements);
    this.app.put('/api/inventory/stock/products/:productId/reorder-level', stockControllers.updateReorderLevel);
    this.app.get('/api/inventory/stock/value', stockControllers.getStockValue);
    this.app.get('/api/inventory/stock/movement-summary', stockControllers.getMovementSummary);
    this.app.post('/api/inventory/stock/products/:productId/allocate', stockControllers.allocateStock);
    this.app.post('/api/inventory/stock/products/:productId/release', stockControllers.releaseStock);
    this.app.post('/api/inventory/stock/products/:productId/adjust', stockControllers.adjustStock);

    this.app.post('/api/inventory/stock-taking', stockTakingControllers.create);
    this.app.put('/api/inventory/stock-taking/:id', stockTakingControllers.update);
    this.app.delete('/api/inventory/stock-taking/:id', stockTakingControllers.delete);
    this.app.get('/api/inventory/stock-taking/:id', stockTakingControllers.getById);
    this.app.get('/api/inventory/stock-taking/no/:takingNo', stockTakingControllers.getByTakingNo);
    this.app.get('/api/inventory/stock-taking', stockTakingControllers.getAll);
    this.app.get('/api/inventory/stock-taking/:id/discrepancies', stockTakingControllers.getDiscrepancies);

    this.app.get('/api/inventory/reports/summary', inventoryReportsControllers.getInventorySummary);
    this.app.get('/api/inventory/reports/low-stock', inventoryReportsControllers.getLowStockProducts);
    this.app.get('/api/inventory/reports/out-of-stock', inventoryReportsControllers.getOutOfStockProducts);
    this.app.get('/api/inventory/reports/by-category', inventoryReportsControllers.getStockByCategory);
    this.app.get('/api/inventory/reports/turnover', inventoryReportsControllers.getInventoryTurnover);
    this.app.get('/api/inventory/reports/movement-summary', inventoryReportsControllers.getStockMovementSummary);
    this.app.get('/api/inventory/reports/product-performance', inventoryReportsControllers.getProductPerformance);
    this.app.get('/api/inventory/reports/abc-analysis', inventoryReportsControllers.getABCAnalysis);
    this.app.get('/api/inventory/reports/expiring', inventoryReportsControllers.getExpiringProducts);
    this.app.get('/api/inventory/reports/warehouse-summary', inventoryReportsControllers.getWarehouseLocationSummary);

    // Purchasing routes
    this.app.post('/api/purchasing/suppliers', suppliersControllers.create);
    this.app.put('/api/purchasing/suppliers/:id', suppliersControllers.update);
    this.app.delete('/api/purchasing/suppliers/:id', suppliersControllers.delete);
    this.app.get('/api/purchasing/suppliers/:id', suppliersControllers.getById);
    this.app.get('/api/purchasing/suppliers/code/:code', suppliersControllers.getByCode);
    this.app.get('/api/purchasing/suppliers', suppliersControllers.getAll);
    this.app.get('/api/purchasing/suppliers/:id/stats', suppliersControllers.getStats);

    this.app.post('/api/purchasing/purchase-orders', purchaseOrdersControllers.create);
    this.app.put('/api/purchasing/purchase-orders/:id', purchaseOrdersControllers.update);
    this.app.delete('/api/purchasing/purchase-orders/:id', purchaseOrdersControllers.delete);
    this.app.get('/api/purchasing/purchase-orders/:id', purchaseOrdersControllers.getById);
    this.app.get('/api/purchasing/purchase-orders/no/:orderNo', purchaseOrdersControllers.getByOrderNo);
    this.app.get('/api/purchasing/purchase-orders', purchaseOrdersControllers.getAll);
    this.app.get('/api/purchasing/suppliers/:supplierId/orders', purchaseOrdersControllers.getSupplierOrders);

    this.app.post('/api/purchasing/receiving', receivingControllers.create);
    this.app.put('/api/purchasing/receiving/:id', receivingControllers.update);
    this.app.delete('/api/purchasing/receiving/:id', receivingControllers.delete);
    this.app.get('/api/purchasing/receiving/:id', receivingControllers.getById);
    this.app.get('/api/purchasing/receiving/no/:receivingNo', receivingControllers.getByReceivingNo);
    this.app.get('/api/purchasing/receiving', receivingControllers.getAll);
    this.app.get('/api/purchasing/orders/:orderId/receiving', receivingControllers.getOrderReceiving);

    this.app.get('/api/purchasing/reports/summary', purchasingReportsControllers.getPurchasingSummary);
    this.app.get('/api/purchasing/reports/supplier-spending', purchasingReportsControllers.getSupplierSpending);
    this.app.get('/api/purchasing/reports/by-category', purchasingReportsControllers.getPurchaseByCategory);
    this.app.get('/api/purchasing/reports/top-products', purchasingReportsControllers.getTopPurchasedProducts);
    this.app.get('/api/purchasing/reports/outstanding-payments', purchasingReportsControllers.getOutstandingPayments);
    this.app.get('/api/purchasing/reports/order-status', purchasingReportsControllers.getOrderStatusSummary);
    this.app.get('/api/purchasing/reports/monthly-purchases', purchasingReportsControllers.getMonthlyPurchases);
    this.app.get('/api/purchasing/reports/supplier-performance', purchasingReportsControllers.getSupplierPerformance);
    this.app.get('/api/purchasing/reports/pending-delivery', purchasingReportsControllers.getPendingDelivery);

    // Accounting routes
    this.app.post('/api/accounting/receivables', accountsReceivableControllers.create);
    this.app.post('/api/accounting/receivables/payment', accountsReceivableControllers.applyPayment);
    this.app.get('/api/accounting/receivables/:id', accountsReceivableControllers.getById);
    this.app.get('/api/accounting/receivables', accountsReceivableControllers.getAll);
    this.app.get('/api/accounting/receivables/customers/:customerId', accountsReceivableControllers.getCustomerReceivables);
    this.app.get('/api/accounting/receivables/overdue', accountsReceivableControllers.getOverdueReceivables);
    this.app.get('/api/accounting/receivables/aging-report', accountsReceivableControllers.getAgingReport);
    this.app.get('/api/accounting/receivables/summary', accountsReceivableControllers.getSummary);

    this.app.post('/api/accounting/payables', accountsPayableControllers.create);
    this.app.post('/api/accounting/payables/payment', accountsPayableControllers.applyPayment);
    this.app.get('/api/accounting/payables/:id', accountsPayableControllers.getById);
    this.app.get('/api/accounting/payables', accountsPayableControllers.getAll);
    this.app.get('/api/accounting/payables/suppliers/:supplierId', accountsPayableControllers.getSupplierPayables);
    this.app.get('/api/accounting/payables/overdue', accountsPayableControllers.getOverduePayables);
    this.app.get('/api/accounting/payables/aging-report', accountsPayableControllers.getAgingReport);
    this.app.get('/api/accounting/payables/summary', accountsPayableControllers.getSummary);

    this.app.post('/api/accounting/journal-entries', journalEntriesControllers.create);
    this.app.put('/api/accounting/journal-entries/:id', journalEntriesControllers.update);
    this.app.delete('/api/accounting/journal-entries/:id', journalEntriesControllers.delete);
    this.app.get('/api/accounting/journal-entries/:id', journalEntriesControllers.getById);
    this.app.get('/api/accounting/journal-entries/no/:entryNo', journalEntriesControllers.getByEntryNo);
    this.app.get('/api/accounting/journal-entries', journalEntriesControllers.getAll);
    this.app.get('/api/accounting/journal-entries/trial-balance', journalEntriesControllers.getTrialBalance);

    this.app.get('/api/accounting/reports/income-statement', financialReportsControllers.getIncomeStatement);
    this.app.get('/api/accounting/reports/balance-sheet', financialReportsControllers.getBalanceSheet);
    this.app.get('/api/accounting/reports/cash-flow', financialReportsControllers.getCashFlow);
    this.app.get('/api/accounting/reports/revenue-by-month', financialReportsControllers.getRevenueByMonth);
    this.app.get('/api/accounting/reports/expense-by-month', financialReportsControllers.getExpenseByMonth);
    this.app.get('/api/accounting/reports/profitability', financialReportsControllers.getProfitabilityMetrics);
    this.app.get('/api/accounting/reports/liquidity', financialReportsControllers.getLiquidityRatios);
    this.app.get('/api/accounting/reports/receivables-turnover', financialReportsControllers.getAccountsReceivableTurnover);

    // HR routes
    this.app.post('/api/hr/employees', employeesControllers.create);
    this.app.put('/api/hr/employees/:id', employeesControllers.update);
    this.app.delete('/api/hr/employees/:id', employeesControllers.delete);
    this.app.get('/api/hr/employees/:id', employeesControllers.getById);
    this.app.get('/api/hr/employees/code/:code', employeesControllers.getByCode);
    this.app.get('/api/hr/employees', employeesControllers.getAll);
    this.app.get('/api/hr/employees/departments', employeesControllers.getDepartments);
    this.app.get('/api/hr/employees/positions', employeesControllers.getPositions);

    this.app.post('/api/hr/payroll', payrollControllers.create);
    this.app.put('/api/hr/payroll/:id', payrollControllers.update);
    this.app.delete('/api/hr/payroll/:id', payrollControllers.delete);
    this.app.get('/api/hr/payroll/:id', payrollControllers.getById);
    this.app.get('/api/hr/payroll/no/:payrollNo', payrollControllers.getByPayrollNo);
    this.app.get('/api/hr/payroll', payrollControllers.getAll);
    this.app.get('/api/hr/employees/:employeeId/payroll', payrollControllers.getEmployeePayroll);

    this.app.post('/api/hr/attendance', attendanceControllers.create);
    this.app.put('/api/hr/attendance/:id', attendanceControllers.update);
    this.app.delete('/api/hr/attendance/:id', attendanceControllers.delete);
    this.app.get('/api/hr/attendance/:id', attendanceControllers.getById);
    this.app.get('/api/hr/attendance', attendanceControllers.getAll);
    this.app.get('/api/hr/employees/:employeeId/attendance', attendanceControllers.getEmployeeAttendance);
    this.app.get('/api/hr/employees/:employeeId/attendance/summary', attendanceControllers.getAttendanceSummary);

    this.app.get('/api/hr/reports/summary', hrReportsControllers.getHRSummary);
    this.app.get('/api/hr/reports/department-stats', hrReportsControllers.getDepartmentStats);
    this.app.get('/api/hr/reports/employees-by-department', hrReportsControllers.getEmployeeByDepartment);
    this.app.get('/api/hr/reports/attendance', hrReportsControllers.getAttendanceReport);
    this.app.get('/api/hr/reports/payroll-summary', hrReportsControllers.getPayrollSummary);
    this.app.get('/api/hr/reports/overtime', hrReportsControllers.getOvertimeReport);
    this.app.get('/api/hr/reports/leave', hrReportsControllers.getLeaveReport);
    this.app.get('/api/hr/reports/hiring-trend', hrReportsControllers.getHiringTrend);
    this.app.get('/api/hr/reports/tenure', hrReportsControllers.getEmployeeTenure);
    this.app.get('/api/hr/reports/top-earners', hrReportsControllers.getTopEarners);
  }

  private initializeErrorHandling(): void {
    this.app.use(notFound);
    this.app.use(errorHandler);
  }

  public listen(): void {
    this.app.listen(this.PORT, () => {
      logger.info(`Server is running on port ${this.PORT}`);
      logger.info(`Health check: http://localhost:${this.PORT}/health`);
      logger.info('API endpoints:');
      logger.info('  Sales: /api/sales/*');
      logger.info('  Inventory: /api/inventory/*');
      logger.info('  Purchasing: /api/purchasing/*');
      logger.info('  Accounting: /api/accounting/*');
      logger.info('  HR: /api/hr/*');
    });
  }
}

export default App;
