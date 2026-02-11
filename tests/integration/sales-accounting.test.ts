import { DatabaseConnection } from '../../src/db/connection';
import { CustomersService, CustomerData } from '../../src/sales/customers';
import { OrdersService, SalesOrderData, OrderItemData } from '../../src/sales/orders';
import { InvoicesService, InvoiceData, InvoiceItemData } from '../../src/sales/invoices';
import { AccountsReceivableService, ReceivableData } from '../../src/accounting/accounts-receivable';
import { ProductsService, ProductData } from '../../src/inventory/products';

describe('Sales to Accounting Integration', () => {
  let db: any;
  let customersService: CustomersService;
  let ordersService: OrdersService;
  let invoicesService: InvoicesService;
  let accountsReceivableService: AccountsReceivableService;
  let productsService: ProductsService;

  let testCustomerId: string;
  let testProductId: string;

  beforeAll(async () => {
    db = DatabaseConnection.getInstance();
    await DatabaseConnection.initialize();
    customersService = new CustomersService(db);
    ordersService = new OrdersService(db);
    invoicesService = new InvoicesService(db);
    accountsReceivableService = new AccountsReceivableService(db);
    productsService = new ProductsService(db);
  });

  beforeEach(async () => {
    db.prepare('DELETE FROM accounts_receivable').run();
    db.prepare('DELETE FROM invoice_items').run();
    db.prepare('DELETE FROM invoices').run();
    db.prepare('DELETE FROM sales_order_items').run();
    db.prepare('DELETE FROM sales_orders').run();
    db.prepare('DELETE FROM inventory_stock').run();
    db.prepare('DELETE FROM products').run();
    db.prepare('DELETE FROM customers').run();

    // Create test customer
    const customerData: CustomerData = {
      code: 'CUS000001',
      name: 'Test Customer',
      category: 'RETAIL',
      payment_term: 30,
    };
    testCustomerId = await customersService.create(customerData);

    // Create test product
    const productData: ProductData = {
      code: 'PRD000001',
      name: 'Test Product',
      category: 'ELECTRONICS',
      unit: 'EA',
      cost_price: 1000,
      selling_price: 1500,
    };
    testProductId = await productsService.create(productData);
  });

  afterEach(() => {
    db.prepare('DELETE FROM accounts_receivable').run();
    db.prepare('DELETE FROM invoice_items').run();
    db.prepare('DELETE FROM invoices').run();
    db.prepare('DELETE FROM sales_order_items').run();
    db.prepare('DELETE FROM sales_orders').run();
    db.prepare('DELETE FROM inventory_stock').run();
    db.prepare('DELETE FROM products').run();
    db.prepare('DELETE FROM customers').run();
  });

  afterAll(() => {
    DatabaseConnection.close();
  });

  describe('Order to Invoice to Accounts Receivable Flow', () => {
    it('should create order, then invoice, then accounts receivable', async () => {
      // 1. Create sales order
      const items: OrderItemData[] = [
        {
          product_id: testProductId,
          quantity: 10,
          unit_price: 1500,
          tax_rate: 0.10,
        },
      ];

      const orderData: SalesOrderData = {
        customer_id: testCustomerId,
        order_date: new Date().toISOString(),
        items,
      };

      const orderId = await ordersService.create(orderData);
      const order = await ordersService.findById(orderId);
      expect(order).toBeDefined();
      expect(order?.status).toBe('PENDING');

      // 2. Confirm order
      await ordersService.update(orderId, { status: 'CONFIRMED' });
      const confirmedOrder = await ordersService.findById(orderId);
      expect(confirmedOrder?.status).toBe('CONFIRMED');

      // 3. Create invoice from order
      const invoiceItems: InvoiceItemData[] = [
        {
          product_id: testProductId,
          quantity: 10,
          unit_price: 1500,
          tax_rate: 0.10,
        },
      ];

      const invoiceData: InvoiceData = {
        customer_id: testCustomerId,
        invoice_date: new Date().toISOString(),
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        order_id: orderId,
        items: invoiceItems,
      };

      const invoiceId = await invoicesService.create(invoiceData);
      const invoice = await invoicesService.findById(invoiceId);
      expect(invoice).toBeDefined();
      expect(invoice?.customer_id).toBe(testCustomerId);
      expect(invoice?.order_id).toBe(orderId);

      // 4. Verify accounts receivable was auto-created
      const receivables = await accountsReceivableService.findAll({ invoice_id: invoiceId });
      expect(receivables.length).toBeGreaterThan(0);
      expect(receivables[0].customer_id).toBe(testCustomerId);
    });

    it('should apply payment to accounts receivable and update invoice status', async () => {
      // Create invoice
      const invoiceItems: InvoiceItemData[] = [
        {
          product_id: testProductId,
          quantity: 5,
          unit_price: 1500,
          tax_rate: 0.10,
        },
      ];

      const invoiceData: InvoiceData = {
        customer_id: testCustomerId,
        invoice_date: new Date().toISOString(),
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        items: invoiceItems,
      };

      const invoiceId = await invoicesService.create(invoiceData);
      const invoice = await invoicesService.findById(invoiceId);

      // Get accounts receivable
      const receivables = await accountsReceivableService.findAll({ invoice_id: invoiceId });
      expect(receivables.length).toBeGreaterThan(0);
      const receivableId = receivables[0].id!;

      // Apply payment
      const paymentAmount = invoice?.total_amount || 0;
      await accountsReceivableService.applyPayment({
        receivable_id: receivableId,
        payment_date: new Date().toISOString(),
        amount: paymentAmount,
        payment_method: 'BANK_TRANSFER',
      });

      // Verify receivable is paid
      const paidReceivable = await accountsReceivableService.findById(receivableId);
      expect(paidReceivable?.balance).toBe(0);
      expect(paidReceivable?.status).toBe('PAID');

      // Verify invoice status is updated
      const updatedInvoice = await invoicesService.findById(invoiceId);
      expect(updatedInvoice?.status).toBe('PAID');
    });

    it('should handle partial payment correctly', async () => {
      // Create invoice
      const invoiceItems: InvoiceItemData[] = [
        {
          product_id: testProductId,
          quantity: 10,
          unit_price: 1500,
          tax_rate: 0.10,
        },
      ];

      const invoiceData: InvoiceData = {
        customer_id: testCustomerId,
        invoice_date: new Date().toISOString(),
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        items: invoiceItems,
      };

      const invoiceId = await invoicesService.create(invoiceData);
      const invoice = await invoicesService.findById(invoiceId);

      // Get accounts receivable
      const receivables = await accountsReceivableService.findAll({ invoice_id: invoiceId });
      expect(receivables.length).toBeGreaterThan(0);
      const receivableId = receivables[0].id!;

      // Apply partial payment
      const totalAmount = invoice?.total_amount || 0;
      const partialPayment = Math.floor(totalAmount / 2);

      await accountsReceivableService.applyPayment({
        receivable_id: receivableId,
        payment_date: new Date().toISOString(),
        amount: partialPayment,
        payment_method: 'CASH',
      });

      // Verify receivable is partially paid
      const partiallyPaidReceivable = await accountsReceivableService.findById(receivableId);
      expect(partiallyPaidReceivable?.balance).toBe(totalAmount - partialPayment);
      expect(partiallyPaidReceivable?.status).toBe('PARTIAL');
    });

    it('should link invoice to order correctly', async () => {
      // Create order
      const items: OrderItemData[] = [
        {
          product_id: testProductId,
          quantity: 5,
          unit_price: 1500,
          tax_rate: 0.10,
        },
      ];

      const orderData: SalesOrderData = {
        customer_id: testCustomerId,
        order_date: new Date().toISOString(),
        items,
      };

      const orderId = await ordersService.create(orderData);

      // Create invoice linked to order
      const invoiceItems: InvoiceItemData[] = [
        {
          product_id: testProductId,
          quantity: 5,
          unit_price: 1500,
          tax_rate: 0.10,
        },
      ];

      const invoiceData: InvoiceData = {
        customer_id: testCustomerId,
        invoice_date: new Date().toISOString(),
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        order_id: orderId,
        items: invoiceItems,
      };

      const invoiceId = await invoicesService.create(invoiceData);
      const invoice = await invoicesService.findById(invoiceId);

      expect(invoice?.order_id).toBe(orderId);

      // Verify order has invoice reference
      const order = await ordersService.findById(orderId);
      expect(order).toBeDefined();
    });
  });

  describe('Customer Credit Management', () => {
    it('should track customer outstanding balance', async () => {
      // Create multiple invoices
      for (let i = 0; i < 3; i++) {
        const invoiceItems: InvoiceItemData[] = [
          {
            product_id: testProductId,
            quantity: 5,
            unit_price: 1500,
            tax_rate: 0.10,
          },
        ];

        const invoiceData: InvoiceData = {
          customer_id: testCustomerId,
          invoice_date: new Date().toISOString(),
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          items: invoiceItems,
        };

        await invoicesService.create(invoiceData);
      }

      // Get customer receivables summary
      const summary = await accountsReceivableService.getSummary();
      expect(summary.total_receivables).toBeGreaterThan(0);
    });

    it('should identify overdue receivables', async () => {
      // Create invoice with past due date
      const invoiceItems: InvoiceItemData[] = [
        {
          product_id: testProductId,
          quantity: 5,
          unit_price: 1500,
          tax_rate: 0.10,
        },
      ];

      const invoiceData: InvoiceData = {
        customer_id: testCustomerId,
        invoice_date: '2024-01-01T00:00:00.000Z',
        due_date: '2024-01-15T00:00:00.000Z',
        items: invoiceItems,
      };

      await invoicesService.create(invoiceData);

      // Get overdue receivables
      const overdue = await accountsReceivableService.getOverdueReceivables();
      expect(overdue.length).toBeGreaterThan(0);
    });
  });
});
