import { DatabaseConnection } from '../../src/db/connection';
import { AccountsReceivableService, ReceivableData } from '../../src/accounting/accounts-receivable';
import { CustomersService, CustomerData } from '../../src/sales/customers';
import { InvoicesService, InvoiceData, InvoiceItemData } from '../../src/sales/invoices';
import { ProductsService, ProductData } from '../../src/inventory/products';
import { ValidationError, NotFoundError } from '../../src/utils/helpers';

describe('AccountsReceivableService', () => {
  let db: any;
  let service: AccountsReceivableService;
  let customersService: CustomersService;
  let invoicesService: InvoicesService;
  let productsService: ProductsService;
  let testCustomerId: string;
  let testProductId: string;

  beforeAll(async () => {
    db = DatabaseConnection.getInstance();
    await DatabaseConnection.initialize();
    service = new AccountsReceivableService(db);
    customersService = new CustomersService(db);
    invoicesService = new InvoicesService(db);
    productsService = new ProductsService(db);
  });

  beforeEach(async () => {
    db.prepare('DELETE FROM accounts_receivable').run();
    db.prepare('DELETE FROM invoice_items').run();
    db.prepare('DELETE FROM invoices').run();
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
    db.prepare('DELETE FROM inventory_stock').run();
    db.prepare('DELETE FROM products').run();
    db.prepare('DELETE FROM customers').run();
  });

  afterAll(() => {
    DatabaseConnection.close();
  });

  // Helper function to create an invoice
  async function createInvoice(invoiceNo: string): Promise<string> {
    const items: InvoiceItemData[] = [
      {
        product_id: testProductId,
        description: 'Test Product',
        quantity: 10,
        unit_price: 1500,
        tax_rate: 0.10,
      },
    ];

    const invoiceData: InvoiceData = {
      customer_id: testCustomerId,
      invoice_date: new Date().toISOString(),
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      items,
    };

    return await invoicesService.create(invoiceData);
  }

  describe('create', () => {
    it('should create a new accounts receivable from invoice', async () => {
      const invoiceId = await createInvoice('INV-001');

      const data: ReceivableData = {
        customer_id: testCustomerId,
        invoice_id: invoiceId,
        transaction_date: new Date().toISOString(),
        debit_amount: 16500,
        credit_amount: 0,
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const id = await service.create(data);

      expect(id).toBeDefined();

      const ar = db.prepare('SELECT * FROM accounts_receivable WHERE id = ?').get(id);
      expect(ar).toBeDefined();
      expect(ar.customer_id).toBe(testCustomerId);
      expect(ar.balance).toBe(16500);
      expect(ar.status).toBe('OPEN');
    });

    it('should throw NotFoundError for non-existent customer', async () => {
      const data: ReceivableData = {
        customer_id: 'non-existent',
        invoice_id: 'does-not-matter',
        transaction_date: new Date().toISOString(),
        debit_amount: 10000,
        credit_amount: 0,
        due_date: new Date().toISOString(),
      };

      await expect(service.create(data)).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError for non-existent invoice', async () => {
      const data: ReceivableData = {
        customer_id: testCustomerId,
        invoice_id: 'non-existent-invoice',
        transaction_date: new Date().toISOString(),
        debit_amount: 10000,
        credit_amount: 0,
        due_date: new Date().toISOString(),
      };

      await expect(service.create(data)).rejects.toThrow(NotFoundError);
    });

    it('should calculate balance correctly', async () => {
      const invoiceId = await createInvoice('INV-002');

      const data: ReceivableData = {
        customer_id: testCustomerId,
        invoice_id: invoiceId,
        transaction_date: new Date().toISOString(),
        debit_amount: 10000,
        credit_amount: 2000,
        due_date: new Date().toISOString(),
      };

      const id = await service.create(data);

      const ar = db.prepare('SELECT * FROM accounts_receivable WHERE id = ?').get(id);
      expect(ar.balance).toBe(8000);
    });
  });

  describe('applyPayment', () => {
    let testReceivableId: string;

    beforeEach(async () => {
      const invoiceId = await createInvoice('INV-003');

      const data: ReceivableData = {
        customer_id: testCustomerId,
        invoice_id: invoiceId,
        transaction_date: new Date().toISOString(),
        debit_amount: 10000,
        credit_amount: 0,
        due_date: new Date().toISOString(),
        status: 'OPEN',
      };

      testReceivableId = await service.create(data);
    });

    it('should apply payment to receivable', async () => {
      const paymentData = {
        receivable_id: testReceivableId,
        payment_date: new Date().toISOString(),
        amount: 5000,
        payment_method: 'BANK_TRANSFER',
        reference: 'REF-001',
      };

      const id = await service.applyPayment(paymentData);

      expect(id).toBeDefined();

      const ar = db.prepare('SELECT * FROM accounts_receivable WHERE id = ?').get(testReceivableId);
      expect(ar.credit_amount).toBe(5000);
      expect(ar.balance).toBe(5000);
      expect(ar.status).toBe('PARTIAL');
    });

    it('should update status to PAID when fully paid', async () => {
      const paymentData = {
        receivable_id: testReceivableId,
        payment_date: new Date().toISOString(),
        amount: 10000,
        payment_method: 'CASH',
      };

      await service.applyPayment(paymentData);

      const ar = db.prepare('SELECT * FROM accounts_receivable WHERE id = ?').get(testReceivableId);
      expect(ar.balance).toBe(0);
      expect(ar.status).toBe('PAID');
    });

    it('should throw NotFoundError for non-existent receivable', async () => {
      const paymentData = {
        receivable_id: 'non-existent',
        payment_date: new Date().toISOString(),
        amount: 1000,
      };

      await expect(service.applyPayment(paymentData)).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessLogicError for already paid receivable', async () => {
      // First, mark as paid
      db.prepare('UPDATE accounts_receivable SET status = ? WHERE id = ?')
        .run('PAID', testReceivableId);

      const paymentData = {
        receivable_id: testReceivableId,
        payment_date: new Date().toISOString(),
        amount: 1000,
      };

      await expect(service.applyPayment(paymentData)).rejects.toThrow('already paid');
    });

    it('should throw ValidationError for zero payment', async () => {
      // Reset to open
      db.prepare('UPDATE accounts_receivable SET status = ? WHERE id = ?')
        .run('OPEN', testReceivableId);

      const paymentData = {
        receivable_id: testReceivableId,
        payment_date: new Date().toISOString(),
        amount: 0,
      };

      await expect(service.applyPayment(paymentData)).rejects.toThrow('must be greater than 0');
    });

    it('should throw ValidationError for payment exceeding balance', async () => {
      const paymentData = {
        receivable_id: testReceivableId,
        payment_date: new Date().toISOString(),
        amount: 15000,
      };

      await expect(service.applyPayment(paymentData)).rejects.toThrow('cannot exceed balance');
    });

    it('should create new payment record', async () => {
      const paymentData = {
        receivable_id: testReceivableId,
        payment_date: new Date().toISOString(),
        amount: 3000,
        notes: 'Partial payment',
      };

      await service.applyPayment(paymentData);

      // Payment creates a new accounts_receivable record with credit_amount
      // The original receivable should have increased credit_amount
      const receivable = await service.findById(testReceivableId);
      expect(receivable?.credit_amount).toBe(3000);
    });
  });

  describe('findById', () => {
    it('should find receivable by id', async () => {
      const invoiceId = await createInvoice('INV-004');

      const data: ReceivableData = {
        customer_id: testCustomerId,
        invoice_id: invoiceId,
        transaction_date: new Date().toISOString(),
        debit_amount: 10000,
        credit_amount: 0,
        due_date: new Date().toISOString(),
      };

      const id = await service.create(data);
      const ar = await service.findById(id);

      expect(ar).toBeDefined();
      expect(ar?.id).toBe(id);
      expect(ar?.customer_id).toBe(testCustomerId);
    });

    it('should return null for non-existent receivable', async () => {
      const ar = await service.findById('non-existent-id');
      expect(ar).toBeNull();
    });
  });

  describe('findAll', () => {
    beforeEach(async () => {
      const invoiceIds = await Promise.all([
        createInvoice('INV-005'),
        createInvoice('INV-006'),
        createInvoice('INV-007'),
      ]);

      const receivables: ReceivableData[] = [
        {
          customer_id: testCustomerId,
          invoice_id: invoiceIds[0],
          transaction_date: new Date().toISOString(),
          debit_amount: 10000,
          credit_amount: 0,
          due_date: new Date().toISOString(),
          status: 'OPEN',
        },
        {
          customer_id: testCustomerId,
          invoice_id: invoiceIds[1],
          transaction_date: new Date().toISOString(),
          debit_amount: 20000,
          credit_amount: 5000,
          due_date: new Date().toISOString(),
          status: 'PARTIAL',
        },
        {
          customer_id: testCustomerId,
          invoice_id: invoiceIds[2],
          transaction_date: new Date().toISOString(),
          debit_amount: 5000,
          credit_amount: 5000,
          due_date: new Date().toISOString(),
          status: 'PAID',
        },
      ];

      for (const ar of receivables) {
        await service.create(ar);
      }
    });

    it('should find all receivables', async () => {
      const receivables = await service.findAll();
      expect(receivables.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter by customer_id', async () => {
      const receivables = await service.findAll({ customer_id: testCustomerId });
      expect(receivables.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter by status', async () => {
      const receivables = await service.findAll({ status: 'OPEN' });
      expect(receivables.length).toBeGreaterThanOrEqual(1);
    });

    it('should support pagination', async () => {
      const receivables = await service.findAll({ limit: 2, offset: 0 });
      expect(receivables.length).toBeLessThanOrEqual(2);
    });
  });

  describe('getCustomerReceivables', () => {
    it('should get receivables for a specific customer', async () => {
      const invoiceId = await createInvoice('INV-008');

      const data: ReceivableData = {
        customer_id: testCustomerId,
        invoice_id: invoiceId,
        transaction_date: new Date().toISOString(),
        debit_amount: 10000,
        credit_amount: 0,
        due_date: new Date().toISOString(),
      };

      await service.create(data);

      const receivables = await service.getCustomerReceivables(testCustomerId);
      expect(receivables.length).toBeGreaterThan(0);
      expect(receivables[0].customer_id).toBe(testCustomerId);
    });
  });

  describe('getOverdueReceivables', () => {
    it('should return overdue receivables', async () => {
      const invoiceId = await createInvoice('INV-009');

      const data: ReceivableData = {
        customer_id: testCustomerId,
        invoice_id: invoiceId,
        transaction_date: '2024-01-01T00:00:00.000Z',
        debit_amount: 10000,
        credit_amount: 0,
        due_date: '2024-01-15T00:00:00.000Z',
        status: 'OPEN',
      };

      await service.create(data);

      const overdue = await service.getOverdueReceivables();
      expect(overdue.length).toBeGreaterThan(0);
    });
  });

  describe('getAgingReport', () => {
    it('should generate aging report', async () => {
      const invoiceId = await createInvoice('INV-010');

      const data: ReceivableData = {
        customer_id: testCustomerId,
        invoice_id: invoiceId,
        transaction_date: new Date().toISOString(),
        debit_amount: 10000,
        credit_amount: 0,
        due_date: new Date().toISOString(),
        status: 'OPEN',
      };

      await service.create(data);

      const report = await service.getAgingReport();
      expect(report).toBeDefined();
      expect(Array.isArray(report)).toBe(true);
    });
  });

  describe('getSummary', () => {
    it('should return accounts receivable summary', async () => {
      const invoiceId = await createInvoice('INV-011');

      const data: ReceivableData = {
        customer_id: testCustomerId,
        invoice_id: invoiceId,
        transaction_date: new Date().toISOString(),
        debit_amount: 10000,
        credit_amount: 0,
        due_date: new Date().toISOString(),
      };

      await service.create(data);

      const summary = await service.getSummary();
      expect(summary).toBeDefined();
      expect(summary.total_receivables).toBeGreaterThan(0);
      expect(summary.total_outstanding).toBeGreaterThan(0);
    });
  });
});
